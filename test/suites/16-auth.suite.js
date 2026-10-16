import assert from "node:assert/strict";
import { describe, it } from "node:test";
import jwt from "jsonwebtoken";
import { h, world, request, get, post, patch, del, settleJobs, tokenFor } from "../helpers/harness.js";

const AUTH = "/api/v1/auth";
const PASSWORD = "Sunrise2026";

/* The newest email to an address, and the token in its link */
const lastEmailTo = address => h.modules.outbox.email.filter(m => m.to === address).at(-1);
const tokenIn = message => new URL(/https?:\/\/\S+/.exec(message.text)[0]).searchParams.get("token");

const login = (email, password = PASSWORD, schoolCode = "TST") =>
  request("POST", `${AUTH}/login`, { as: null, body: { schoolCode, email, password } });

/* Invite an account, follow the emailed link, set a password */
const activate = async (userId, email) => {
  await post(`${AUTH}/invitations`, { userIds: [userId] }, {}, 200);
  const res = await request("POST", `${AUTH}/password-resets`, {
    as: null,
    body: { token: tokenIn(lastEmailTo(email)), password: PASSWORD }
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
};

describe("auth: invitations and first password", () => {
  it("invites accounts and lets them set a password once", async () => {
    world.auth = {
      teacher: (await get(`/api/v1/users/${world.teacher.userId}`)).data,
      mother: (await get(`/api/v1/users/${(await get(`/api/v1/users/parents/${world.motherId}`)).data.userId}`)).data,
      student: (await get(`/api/v1/users/${world.s1.userId}`)).data,
      school: (await get("/api/v1/administration/settings")).data.name
    };
    const { teacher, mother } = world.auth;

    const sent = await post(`${AUTH}/invitations`, { userIds: [teacher.id, mother.id] }, {}, 200);
    assert.equal(sent.message, "2 invitation(s) sent");
    const invite = lastEmailTo(mother.email);
    assert.equal(invite.subject, `Your ${world.auth.school} account`);
    assert.match(invite.text, /School code: TST/);
    assert.match(invite.text, /set-password\?token=/);

    /* A new invitation replaces the old link */
    const firstLink = tokenIn(lastEmailTo(teacher.email));
    await post(`${AUTH}/invitations`, { userIds: [teacher.id] }, {}, 200);
    const stale = await request("POST", `${AUTH}/password-resets`, {
      as: null,
      body: { token: firstLink, password: PASSWORD }
    });
    assert.equal(stale.status, 422);
    assert.equal(stale.body.message, "This link is invalid or has expired. Ask for a new one.");

    const weak = await request("POST", `${AUTH}/password-resets`, {
      as: null,
      body: { token: tokenIn(lastEmailTo(teacher.email)), password: "password" }
    });
    assert.equal(weak.status, 400);
    assert.match(weak.body.message, /password must contain at least one letter and one digit/);

    const link = tokenIn(lastEmailTo(teacher.email));
    const set = await request("POST", `${AUTH}/password-resets`, {
      as: null,
      body: { token: link, password: PASSWORD }
    });
    assert.equal(set.status, 200);
    assert.equal(set.body.message, "Password set. You can now sign in.");
    const again = await request("POST", `${AUTH}/password-resets`, {
      as: null,
      body: { token: link, password: PASSWORD }
    });
    assert.equal(again.status, 422, "a link works once");

    await activate(mother.id, mother.email);
    const repeat = await post(`${AUTH}/invitations`, { userIds: [teacher.id] }, {}, 200);
    assert.deepEqual(repeat.data.skipped, [
      { userId: teacher.id, reason: "The account already has a password; use password reset" }
    ]);
  });

  it("lets only administrators invite privileged staff", async () => {
    await post(`${AUTH}/invitations`, { userIds: [world.accountant.userId] }, { as: h.tokens.office }, 403);
    await post(`${AUTH}/invitations`, { userIds: [world.s2.userId] }, { as: h.tokens.office }, 200);
    await post(`${AUTH}/invitations`, { userIds: [world.s2.userId] }, { as: h.tokens.teacher }, 403);
    await post(`${AUTH}/invitations`, { userIds: [crypto.randomUUID()] }, {}, 422);
  });
});

describe("auth: sign-in and sessions", () => {
  it("signs in with school code, email and password, and opens the portal", async () => {
    const { mother } = world.auth;
    const res = await login(mother.email.toUpperCase(), PASSWORD, "tst");
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.message, `Signed in as ${mother.firstName} ${mother.lastName}`);
    const session = res.body.data;
    assert.equal(session.tokenType, "Bearer");
    assert.equal(session.expiresIn, 900);
    assert.deepEqual(session.school, { id: h.tenant.id, name: world.auth.school, code: "TST" });
    assert.equal(session.user.role, "PARENT");
    world.auth.motherSession = session;

    /* D-12: the parent portal works with a real sign-in */
    const children = await get("/api/v1/me/students", { as: session.accessToken });
    const ids = children.data.map(c => c.id);
    assert.ok(ids.includes(world.s1.id) && ids.includes(world.s2.id));
  });

  it("gives one answer for every kind of wrong credential", async () => {
    const { mother } = world.auth;
    for (const attempt of [
      login(mother.email, "Wrong2026"),
      login("nobody@test.school"),
      login(mother.email, PASSWORD, "NOPE"),
      login(mother.email, PASSWORD, "OTH")
    ]) {
      const res = await attempt;
      assert.equal(res.status, 401);
      assert.equal(res.body.message, "The school code, email or password is incorrect");
    }
    /* Not yet activated */
    assert.equal((await login(world.auth.student.email)).status, 401);
  });

  it("rotates refresh tokens and ends the session when an old one is replayed", async () => {
    const first = world.auth.motherSession;
    const refreshed = await post(`${AUTH}/refresh`, { refreshToken: first.refreshToken }, { as: null }, 200);
    assert.notEqual(refreshed.data.refreshToken, first.refreshToken);
    await get("/api/v1/me/students", { as: refreshed.data.accessToken });

    /* Right after a rotation (another tab, a retry) the old token is refused, the session lives */
    const late = await request("POST", `${AUTH}/refresh`, { as: null, body: { refreshToken: first.refreshToken } });
    assert.equal(late.status, 401);
    assert.equal(late.body.message, "This refresh token was just replaced. Use the newest one.");
    await get("/api/v1/me/students", { as: refreshed.data.accessToken });

    /* Later, an old token means theft: the whole session ends */
    await h.pool.query("UPDATE auth_sessions SET last_used_at = now() - interval '5 minutes' WHERE id = $1", [
      first.refreshToken.split(".")[1]
    ]);
    const replay = await request("POST", `${AUTH}/refresh`, { as: null, body: { refreshToken: first.refreshToken } });
    assert.equal(replay.status, 401);
    assert.equal(replay.body.message, "This sign-in was ended for your security. Please sign in again.");

    const after = await request("POST", `${AUTH}/refresh`, {
      as: null,
      body: { refreshToken: refreshed.data.refreshToken }
    });
    assert.equal(after.status, 401);
    const denied = await request("GET", "/api/v1/me/students", { as: refreshed.data.accessToken });
    assert.equal(denied.status, 401);
    assert.equal(denied.body.message, "Your session has ended. Please sign in again.");

    const junk = await request("POST", `${AUTH}/refresh`, {
      as: null,
      body: { refreshToken: "not-a-real-refresh-token" }
    });
    assert.equal(junk.status, 401);
  });

  it("survives two refreshes at once", async () => {
    const session = (await login(world.auth.mother.email)).body.data;
    const results = await Promise.all(
      [1, 2].map(() => request("POST", `${AUTH}/refresh`, { as: null, body: { refreshToken: session.refreshToken } }))
    );
    assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
    const winner = results.find(r => r.status === 200).body.data;
    await post(`${AUTH}/refresh`, { refreshToken: winner.refreshToken }, { as: null }, 200);
  });

  it("lists devices, signs one out remotely, and signs out", async () => {
    const { teacher } = world.auth;
    const laptop = (await login(teacher.email)).body.data;
    const phone = (await login(teacher.email)).body.data;

    const devices = await get(`${AUTH}/sessions`, { as: laptop.accessToken });
    assert.equal(devices.data.length, 2);
    assert.equal(devices.data.filter(d => d.current).length, 1);
    assert.equal(devices.data.find(d => d.current).id, laptop.refreshToken.split(".")[1]);
    assert.equal(devices.data[0].refreshHash, undefined);

    const phoneId = phone.refreshToken.split(".")[1];
    await del(`${AUTH}/sessions/${phoneId}`, { as: laptop.accessToken });
    assert.equal((await request("GET", "/api/v1/me", { as: phone.accessToken })).status, 401);
    await del(`${AUTH}/sessions/${phoneId}`, { as: laptop.accessToken }, 404);
    /* Someone else's session is not found, not forbidden */
    await del(`${AUTH}/sessions/${laptop.refreshToken.split(".")[1]}`, { as: h.tokens.admin }, 404);

    const out = await post(`${AUTH}/logout`, {}, { as: laptop.accessToken }, 200);
    assert.equal(out.message, "Signed out");
    assert.equal((await request("GET", "/api/v1/me", { as: laptop.accessToken })).status, 401);
    assert.equal(
      (await request("POST", `${AUTH}/refresh`, { as: null, body: { refreshToken: laptop.refreshToken } })).status,
      401
    );
  });
});

describe("auth: passwords", () => {
  it("changes a password and signs out the other devices", async () => {
    const { teacher } = world.auth;
    const here = (await login(teacher.email)).body.data;
    const there = (await login(teacher.email)).body.data;

    const wrong = await request("PATCH", `${AUTH}/password`, {
      as: here.accessToken,
      body: { currentPassword: "Nope12345", newPassword: "Moonrise2027" }
    });
    assert.equal(wrong.status, 422);
    assert.equal(wrong.body.message, "The current password is incorrect");

    const changed = await patch(
      `${AUTH}/password`,
      { currentPassword: PASSWORD, newPassword: "Moonrise2027" },
      { as: here.accessToken }
    );
    assert.equal(changed.message, "Password changed; 1 other device(s) signed out");
    await get("/api/v1/me", { as: here.accessToken });
    assert.equal((await request("GET", "/api/v1/me", { as: there.accessToken })).status, 401);
    assert.equal((await login(teacher.email)).status, 401);
    assert.equal((await login(teacher.email, "Moonrise2027")).status, 201);

    /* The audit trail records the change, never the passwords */
    await new Promise(resolve => setTimeout(resolve, 100));
    const entry = await h.modules.AuditLog.findOne({ permission: "auth.credentials.changeOwn" }).lean();
    assert.ok(entry);
    assert.doesNotMatch(JSON.stringify(entry), /Moonrise2027|Sunrise2026/);
  });

  it("resets a forgotten password without revealing accounts", async () => {
    const { teacher } = world.auth;
    const before = (await login(teacher.email, "Moonrise2027")).body.data;
    const sentBefore = h.modules.outbox.email.length;

    const unknown = await request("POST", `${AUTH}/password-reset-requests`, {
      as: null,
      body: { schoolCode: "TST", email: "ghost@test.school" }
    });
    const known = await request("POST", `${AUTH}/password-reset-requests`, {
      as: null,
      body: { schoolCode: "TST", email: teacher.email }
    });
    assert.equal(unknown.status, 202);
    assert.deepEqual(unknown.body.message, known.body.message, "same answer either way");
    /* The link is sent by a background job */
    await settleJobs();
    assert.equal(h.modules.outbox.email.length, sentBefore + 1);

    const mail = lastEmailTo(teacher.email);
    assert.equal(mail.subject, `Reset your ${world.auth.school} password`);
    const reset = await request("POST", `${AUTH}/password-resets`, {
      as: null,
      body: { token: tokenIn(mail), password: PASSWORD }
    });
    assert.equal(reset.body.message, "Password changed. Please sign in again.");

    /* Every earlier session ends */
    assert.equal((await request("GET", "/api/v1/me", { as: before.accessToken })).status, 401);
    assert.equal(
      (await request("POST", `${AUTH}/refresh`, { as: null, body: { refreshToken: before.refreshToken } })).status,
      401
    );
    assert.equal((await login(teacher.email)).status, 201);
    /* The harness token predates the reset; later suites need a fresh one */
    h.tokens.teacher = tokenFor(world.teacher.userId, "TEACHER");
  });

  it("limits password guessing, also in parallel and for unknown accounts", async () => {
    const student2 = (await get(`/api/v1/users/${world.s2.userId}`)).data;
    await activate(student2.id, student2.email);

    /* 12 guesses at once: no more than 5 reach the password check */
    const burst = await Promise.all(Array.from({ length: 12 }, () => login(student2.email, "Wrong2026")));
    const statuses = burst.map(r => r.status);
    assert.ok(statuses.filter(s => s === 401).length <= 5, statuses.join(","));
    assert.ok(statuses.includes(429));
    const locked = await login(student2.email);
    assert.equal(locked.status, 429);
    assert.match(
      locked.body.message,
      /^Too many sign-in attempts\. Try again in 1[45] minute\(s\), or reset your password\.$/
    );

    /* Unknown accounts answer exactly the same way, so lockouts reveal nothing */
    const ghost = [];
    for (let i = 0; i < 6; i++) ghost.push((await login("ghost.student@test.school", "Wrong2026")).status);
    assert.deepEqual(ghost, [401, 401, 401, 401, 401, 429]);

    /* Other accounts are unaffected */
    assert.equal((await login(world.auth.mother.email)).status, 201);
  });

  it("stores only password hashes, never passwords", async () => {
    const { rows } = await h.pool.query("SELECT password_hash FROM users WHERE id = $1", [world.auth.mother.id]);
    assert.match(rows[0].password_hash, /^scrypt\$32768\$8\$1\$/);
    assert.doesNotMatch(rows[0].password_hash, new RegExp(PASSWORD));
  });
});

describe("auth: account lifecycle and records", () => {
  it("ends sessions and tells the old address when the office changes an email", async () => {
    const parent = await post("/api/v1/users/parents", {
      user: { firstName: "Lata", lastName: "Menon", email: "lata.old@test.school" },
      profile: {}
    });
    await activate(parent.data.userId, "lata.old@test.school");
    const session = (await login("lata.old@test.school")).body.data;

    await patch(`/api/v1/users/${parent.data.userId}`, { email: "lata.new@test.school" });
    await settleJobs();
    const notice = lastEmailTo("lata.old@test.school");
    assert.match(notice.subject, /The email on your .* account was changed/);
    assert.match(notice.text, /lata\.new@test\.school/);
    assert.equal((await request("GET", "/api/v1/me", { as: session.accessToken })).status, 401);
    assert.equal(
      (await request("POST", `${AUTH}/refresh`, { as: null, body: { refreshToken: session.refreshToken } })).status,
      401
    );
    assert.equal((await login("lata.new@test.school")).status, 201, "the password still works with the new email");
  });

  it("accepts only session access tokens", async () => {
    const forged = jwt.sign({ userId: h.admin.id, tenantId: h.tenant.id, role: "ADMIN" }, "test-secret");
    const res = await request("GET", "/api/v1/users", { as: forged });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Invalid token");
  });

  it("ends every session when an account is deactivated", async () => {
    const teacher = await post("/api/v1/users/teachers", {
      user: { firstName: "Temp", lastName: "Teacher", email: "temp.teacher@test.school" },
      profile: {}
    });
    await activate(teacher.data.userId, "temp.teacher@test.school");
    const session = (await login("temp.teacher@test.school")).body.data;
    await get("/api/v1/me", { as: session.accessToken });

    await del(`/api/v1/users/${teacher.data.userId}`);
    assert.equal((await request("GET", "/api/v1/me", { as: session.accessToken })).status, 401);
    assert.equal(
      (await request("POST", `${AUTH}/refresh`, { as: null, body: { refreshToken: session.refreshToken } })).status,
      401
    );
    assert.equal((await login("temp.teacher@test.school")).status, 401);
  });

  it("records sign-ins in the audit trail and documents the public endpoints", async () => {
    const { AuditLog } = h.modules;
    assert.ok((await AuditLog.countDocuments({ tenantId: h.tenant.id, permission: "auth.login" })) >= 5);
    const failed = await AuditLog.findOne({ permission: "auth.login.failed", userId: world.auth.mother.id }).lean();
    assert.equal(failed.statusCode, 401);

    const doc = (await request("GET", "/api/v1/openapi.json", { as: null })).body;
    assert.deepEqual(doc.paths["/api/v1/auth/login"].post.security, []);
    assert.equal(doc.paths["/api/v1/auth/logout"].post.security, undefined);
  });
});
