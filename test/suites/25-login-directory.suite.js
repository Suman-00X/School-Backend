import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, request, get, post, patch, del, settleJobs } from "../helpers/harness.js";

/* Sign-in without a school code: the platform login directory finds the schools that have
   an account for the email; the password decides which of them may be named */
const AUTH = "/api/v1/auth";
const PASSWORD = "Directory2026";
const OTHER_PASSWORD = "Elsewhere2026";

const lastEmailTo = address => h.modules.outbox.email.filter(m => m.to === address).at(-1);
const tokenIn = message => new URL(/https?:\/\/\S+/.exec(message.text)[0]).searchParams.get("token");
const schoolIn = message => new URL(/https?:\/\/\S+/.exec(message.text)[0]).searchParams.get("school");

/* Accounts shared between the tests below */
const world = {};

const login = body => request("POST", `${AUTH}/login`, { as: null, body });

/* An account in one school (TST as its admin, OTH as the other admin), with a password set
   through the emailed invitation */
const account = async ({ school, email, password = PASSWORD, kind = "teachers" }) => {
  const as = school === "OTH" ? h.tokens.otherAdmin : h.tokens.admin;
  const name = email.split("@")[0].replace(/[^a-z]/gi, "");
  const created = await post(
    `/api/v1/users/${kind}`,
    { ...(kind === "staff" && { role: "STAFF" }), user: { firstName: name, lastName: school, email }, profile: {} },
    { as }
  );
  const userId = created.data.userId;
  await post(`${AUTH}/invitations`, { userIds: [userId] }, { as }, 200);
  const set = await request("POST", `${AUTH}/password-resets`, {
    as: null,
    body: { token: tokenIn(lastEmailTo(email)), password }
  });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  return { userId, as };
};

/* The directory rows of a school (digests only) */
const rowsOf = async tenantId =>
  (
    await h.platformPool.query("SELECT * FROM platform_account_directory WHERE tenant_id = $1 ORDER BY user_id", [
      tenantId
    ])
  ).rows;
const digestOf = async email => (await import("../../src/common/tenancy/directory.js")).emailDigest(email);
const listed = async (tenantId, email) =>
  (
    await h.platformPool.query(
      "SELECT user_id FROM platform_account_directory WHERE tenant_id = $1 AND email_digest = $2",
      [tenantId, await digestOf(email)]
    )
  ).rows.map(r => r.user_id);

const setStatus = (pool, userId, status) => pool.query("UPDATE users SET status = $1 WHERE id = $2", [status, userId]);

describe("auth: sign-in without a school code", () => {
  it("lists every new account in the login directory, by email digest only", async () => {
    const one = await account({ school: "TST", email: "dir.one@test.school" });
    assert.deepEqual(await listed(h.tenant.id, "dir.one@test.school"), [one.userId]);
    assert.deepEqual(await listed(h.tenant.id, "  DIR.ONE@test.school "), [one.userId], "normalised like sign-in");
    /* The admins written directly by the harness are there through the rebuild */
    assert.deepEqual(await listed(h.otherTenant.id, "admin@other.school"), [
      (await get("/api/v1/users?role=ADMIN", { as: h.tokens.otherAdmin })).data[0].id
    ]);

    /* The platform database never holds an address */
    const rows = await rowsOf(h.tenant.id);
    assert.ok(rows.length > 10, "every account of the school, students and parents included");
    for (const row of rows) assert.match(row.email_digest, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(JSON.stringify(rows), /@/);
    const { rows: columns } = await h.platformPool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'platform_account_directory'"
    );
    assert.deepEqual(columns.map(c => c.column_name).sort(), [
      "created_at",
      "email_digest",
      "tenant_id",
      "updated_at",
      "user_id"
    ]);
  });

  it("signs in with email and password alone when one school has the account", async () => {
    const res = await login({ email: "Dir.One@test.school", password: PASSWORD });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.school.id, h.tenant.id);
    assert.equal(res.body.data.school.code, "TST");
    assert.equal(res.body.data.user.email, "dir.one@test.school");
    await get("/api/v1/me", { as: res.body.data.accessToken });

    /* A listed account without a password yet answers like any wrong password */
    const other = await login({ email: "admin@other.school", password: "Whatever1" });
    assert.equal(other.status, 401);
  });

  it("asks which school when the password is right in several, then signs in to the chosen one", async () => {
    const email = "shared.person@test.school";
    world.dir = {
      tst: await account({ school: "TST", email }),
      oth: await account({ school: "OTH", email, kind: "staff" })
    };
    const tstName = (await get("/api/v1/administration/settings")).data.name;
    const othName = (await get("/api/v1/administration/settings", { as: h.tokens.otherAdmin })).data.name;

    const res = await login({ email, password: PASSWORD });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.message, "Choose a school to continue");
    assert.equal(res.body.data.chooseSchool, true);
    assert.equal(res.body.data.accessToken, undefined, "no session before a school is chosen");
    const schools = res.body.data.schools;
    assert.deepEqual(
      schools.map(s => [s.id, s.code, s.name, s.role]).sort((a, b) => a[1].localeCompare(b[1])),
      [
        [h.otherTenant.id, "OTH", othName, "STAFF"],
        [h.tenant.id, "TST", tstName, "TEACHER"]
      ]
    );
    for (const school of schools) assert.ok(school.logoUrl === null || typeof school.logoUrl === "string");

    /* The client signs in again with the chosen school */
    const chosen = await login({ email, password: PASSWORD, schoolId: h.otherTenant.id });
    assert.equal(chosen.status, 201, JSON.stringify(chosen.body));
    assert.equal(chosen.body.data.school.code, "OTH");
    assert.equal(chosen.body.data.user.role, "STAFF");
    assert.equal(chosen.body.data.user.id, world.dir.oth.userId);
    const me = await get("/api/v1/me", { as: chosen.body.data.accessToken });
    assert.equal(me.data.account.id, world.dir.oth.userId);

    /* schoolCode still works the old way; a school without the account answers like a wrong password */
    assert.equal((await login({ email, password: PASSWORD, schoolCode: "TST" })).status, 201);
    const elsewhere = await login({ email: "dir.one@test.school", password: PASSWORD, schoolId: h.otherTenant.id });
    assert.equal(elsewhere.status, 401);
    const unknown = await login({ email, password: PASSWORD, schoolId: crypto.randomUUID() });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.message, "The email or password is incorrect");
    const both = await login({ email, password: PASSWORD, schoolId: h.tenant.id, schoolCode: "TST" });
    assert.equal(both.status, 400);
  });

  it("documents both answers of the sign-in", async () => {
    const doc = (await request("GET", "/api/v1/openapi.json", { as: null })).body;
    const operation = doc.paths["/api/v1/auth/login"].post;
    assert.deepEqual(operation.security, []);
    assert.ok(operation.responses[200] && operation.responses[201] && operation.responses[429]);
    assert.match(operation.description, /chooseSchool/);
    assert.deepEqual(operation.requestBody.content["application/json"].schema.required.sort(), ["email", "password"]);
    const reset = doc.paths["/api/v1/auth/password-reset-requests"].post;
    assert.ok(reset.responses[202] && !reset.responses[201]);
  });

  it("names only the schools where the password is right", async () => {
    const email = "split.person@test.school";
    await account({ school: "TST", email, password: PASSWORD });
    await account({ school: "OTH", email, password: OTHER_PASSWORD });

    const tst = await login({ email, password: PASSWORD });
    assert.equal(tst.status, 201, "straight in: the other school is never mentioned");
    assert.equal(tst.body.data.school.code, "TST");
    const oth = await login({ email, password: OTHER_PASSWORD });
    assert.equal(oth.status, 201);
    assert.equal(oth.body.data.school.code, "OTH");
  });

  it("gives one answer for a wrong password everywhere and for an unknown email", async () => {
    for (const body of [
      { email: "shared.person@test.school", password: "Wrong2026x" },
      { email: "nobody.anywhere@test.school", password: PASSWORD }
    ]) {
      const res = await login(body);
      assert.equal(res.status, 401);
      assert.equal(res.body.message, "The email or password is incorrect");
      assert.doesNotMatch(JSON.stringify(res.body), /Other School|OTH|TST/);
    }
  });

  it("keeps a disabled account in one school from blocking the other", async () => {
    const email = "shared.person@test.school";
    await setStatus(h.otherPool, world.dir.oth.userId, "BLOCKED");
    const res = await login({ email, password: PASSWORD });
    assert.equal(res.status, 201, "the active school signs in directly");
    assert.equal(res.body.data.school.code, "TST");

    /* Disabled everywhere the password is right: the disabled answer */
    await setStatus(h.pool, world.dir.tst.userId, "BLOCKED");
    const disabled = await login({ email, password: PASSWORD });
    assert.equal(disabled.status, 403);
    assert.equal(disabled.body.message, "This account is disabled. Please contact the school office.");
    /* ...but only after the password was right */
    assert.equal((await login({ email, password: "Wrong2026x" })).status, 401);

    await setStatus(h.otherPool, world.dir.oth.userId, "ACTIVE");
    await setStatus(h.pool, world.dir.tst.userId, "ACTIVE");
    assert.equal((await login({ email, password: PASSWORD })).status, 200);
  });

  it("keeps a lockout in one school from blocking the other; locked everywhere is 429", async () => {
    const email = "locked.person@test.school";
    await account({ school: "TST", email });
    await account({ school: "OTH", email });

    /* Five wrong guesses at TST alone lock that school's account */
    for (let i = 0; i < 5; i++) await login({ email, password: "Wrong2026x", schoolCode: "TST" });
    assert.equal((await login({ email, password: PASSWORD, schoolCode: "TST" })).status, 429);
    const res = await login({ email, password: PASSWORD });
    assert.equal(res.status, 201, "the other school still signs in");
    assert.equal(res.body.data.school.code, "OTH");

    /* Guesses without a school count in every school; once all are locked: 429 */
    for (let i = 0; i < 5; i++) await login({ email, password: "Wrong2026x" });
    const locked = await login({ email, password: PASSWORD });
    assert.equal(locked.status, 429);
    assert.match(
      locked.body.message,
      /^Too many sign-in attempts\. Try again in \d+ minute\(s\), or reset your password\.$/
    );

    /* Unknown emails are limited the same way */
    const ghost = [];
    for (let i = 0; i < 6; i++)
      ghost.push((await login({ email: "ghost.directory@test.school", password: PASSWORD })).status);
    assert.deepEqual(ghost, [401, 401, 401, 401, 401, 429]);
  });

  it("sends a reset link from every school when no school code is given", async () => {
    const email = "shared.person@test.school";
    const sentBefore = h.modules.outbox.email.filter(m => m.to === email).length;
    const res = await request("POST", `${AUTH}/password-reset-requests`, { as: null, body: { email } });
    const unknown = await request("POST", `${AUTH}/password-reset-requests`, {
      as: null,
      body: { email: "nobody.anywhere@test.school" }
    });
    assert.equal(res.status, 202);
    assert.equal(unknown.status, 202);
    assert.equal(res.body.message, unknown.body.message, "same answer either way");
    await settleJobs();

    const mails = h.modules.outbox.email.filter(m => m.to === email).slice(sentBefore);
    assert.equal(mails.length, 2, "one per school");
    const bySchool = Object.fromEntries(mails.map(m => [schoolIn(m), m]));
    assert.deepEqual(Object.keys(bySchool).sort(), ["OTH", "TST"]);
    for (const [code, mail] of Object.entries(bySchool)) {
      assert.match(mail.subject, /^Reset your .+ password$/);
      assert.match(mail.text, new RegExp(`School: .+ \\(${code}\\)`));
    }

    /* Each link resets its own school's password only */
    const reset = await request("POST", `${AUTH}/password-resets`, {
      as: null,
      body: { token: tokenIn(bySchool.OTH), password: OTHER_PASSWORD }
    });
    assert.equal(reset.status, 200);
    const tst = await login({ email, password: PASSWORD });
    assert.equal(tst.status, 201);
    assert.equal(tst.body.data.school.code, "TST");

    /* With a school code: that school only */
    await request("POST", `${AUTH}/password-reset-requests`, { as: null, body: { email, schoolCode: "OTH" } });
    await settleJobs();
    assert.equal(h.modules.outbox.email.filter(m => m.to === email).length, sentBefore + 3);
    assert.equal(schoolIn(lastEmailTo(email)), "OTH");
  });

  it("follows an email change and a deactivation", async () => {
    const { userId } = await account({ school: "TST", email: "dir.before@test.school" });
    await patch(`/api/v1/users/${userId}`, { email: "dir.after@test.school" });
    await settleJobs();
    assert.deepEqual(await listed(h.tenant.id, "dir.before@test.school"), []);
    assert.deepEqual(await listed(h.tenant.id, "dir.after@test.school"), [userId]);
    assert.equal((await login({ email: "dir.after@test.school", password: PASSWORD })).status, 201);
    assert.equal((await login({ email: "dir.before@test.school", password: PASSWORD })).status, 401);

    await del(`/api/v1/users/${userId}`);
    assert.deepEqual(await listed(h.tenant.id, "dir.after@test.school"), []);
    assert.equal((await login({ email: "dir.after@test.school", password: PASSWORD })).status, 401);
  });

  it("rebuilds itself from the schools' accounts, and heals on sign-in with a school code", async () => {
    const { accountDirectory } = h.modules;
    /* What the school's own database says: every account not deactivated */
    const { rows: accounts } = await h.pool.query("SELECT id, email FROM users WHERE is_active ORDER BY id");
    const expected = await Promise.all(accounts.map(async a => [await digestOf(a.email), a.id]));

    /* Lost rows and a stale row (an account whose creation rolled back) */
    await h.platformPool.query("DELETE FROM platform_account_directory WHERE tenant_id = $1", [h.tenant.id]);
    await h.platformPool.query(
      "INSERT INTO platform_account_directory (email_digest, tenant_id, user_id, updated_at) VALUES ($1, $2, $3, now() - interval '1 minute')",
      [await digestOf("rolled.back@test.school"), h.tenant.id, crypto.randomUUID()]
    );
    assert.equal((await login({ email: "dir.one@test.school", password: PASSWORD })).status, 401);

    /* A sign-in with the school code puts the account back */
    assert.equal((await login({ email: "dir.one@test.school", password: PASSWORD, schoolCode: "TST" })).status, 201);
    assert.equal((await listed(h.tenant.id, "dir.one@test.school")).length, 1);
    assert.equal((await login({ email: "dir.one@test.school", password: PASSWORD })).status, 201);

    const result = await accountDirectory.rebuild(h.tenant.id);
    assert.equal(result.accounts, accounts.length);
    assert.equal(result.removed, 1, "the stale row");
    const after = await rowsOf(h.tenant.id);
    assert.deepEqual(
      after.map(r => [r.email_digest, r.user_id]),
      expected
    );

    /* Idempotent, for every school */
    await accountDirectory.rebuildAll();
    const again = await accountDirectory.rebuildAll();
    assert.deepEqual(
      again.map(r => [r.code, r.ok, r.removed]),
      [
        ["OTH", true, 0],
        ["TST", true, 0]
      ]
    );
    assert.deepEqual(
      (await rowsOf(h.tenant.id)).map(r => [r.email_digest, r.user_id]),
      expected
    );
    assert.equal((await login({ email: "shared.person@test.school", password: PASSWORD })).status, 201);
  });
});
