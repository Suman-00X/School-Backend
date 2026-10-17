import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, del, person, tokenFor, uuid } from "../helpers/harness.js";

const AC = "/api/v1/administration/access";
const HS = "/api/v1/hostel";
const L = "/api/v1/library";
const T = "/api/v1/transport";
const today = todayIn("Asia/Kolkata");
const tomorrow = addDays(today, 1);

/* Values shared by the tests below */
const t = {};
const as = token => ({ as: token });
const status = async (method, url, token, body) => (await request(method, url, { as: token, body })).status;
const keysOf = access => access.modules.flatMap(m => m.resources.flatMap(r => r.permissions.map(p => p.key)));

/* A new office account (role STAFF) and its token */
const staffMember = async key => {
  const staff = (await post("/api/v1/users/staff", { role: "STAFF", user: person(key) })).data;
  return { ...staff, token: tokenFor(staff.userId, "STAFF"), name: `F${key} L${key}` };
};

/* The audit trail is written just after the response */
const auditEntry = async filter => {
  for (let i = 0; i < 100; i++) {
    const entry = await h.modules.AuditLog.findOne({ tenantId: h.tenant.id, ...filter }).lean();
    if (entry) return entry;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(`no audit entry for ${JSON.stringify(filter)}`);
};

const OWNERS_REFUSAL = "Only an administrator can make someone a module owner or change their ownership";

const handOver = (body, token = h.tokens.hostelManager) =>
  request("POST", `${AC}/handovers`, { as: token, body: { module: "hostel", ...body } });

describe("owners: everything inside their module", () => {
  it("an owner holds every permission of their module, ADMIN-only ones included", async () => {
    t.libraryOwner = await staffMember("libowner");
    await post(`${AC}/assignments`, { kind: "OWNER", module: "library", userId: t.libraryOwner.userId });
    t.libraryClerk = await staffMember("libclerk");
    const desk = (
      await post(
        `${AC}/operator-roles`,
        { module: "library", name: "Front desk", permissions: ["library.books.read"] },
        as(h.tokens.librarian)
      )
    ).data;
    await post(`${AC}/assignments`, { operatorRoleId: desk.id, userId: t.libraryClerk.userId }, as(h.tokens.librarian));

    /* A permission of the module that lists ADMIN only */
    const { definePermissions } = await import("../../src/common/auth/authorize.middleware.js");
    const { hasPermission } = await import("../../src/common/auth/grants.js");
    const { ACCESS_PERMISSIONS } =
      await import("../../src/modules/administration/access/permissions/access.permissions.js");
    const { purge } = definePermissions("library.testOnly", { purge: { roles: ["ADMIN"], label: "Purge (test)" } });
    const may = (userId, role, permission = purge) =>
      h.inSchool(() => hasPermission({ tenantId: h.tenant.id, userId, role }, permission));

    assert.equal(await may(world.librarian.userId, "LIBRARIAN"), true, "the built-in owner role");
    assert.equal(await may(t.libraryOwner.userId, "STAFF"), true, "an owner by assignment");
    assert.equal(await may(t.libraryClerk.userId, "STAFF"), false, "an operator");
    assert.equal(await may(world.office.userId, "STAFF"), false, "anyone else");
    assert.equal(await may(world.hostelManager.userId, "HOSTEL_MANAGER"), false, "another module's owner");
    /* ... but never who owns the module */
    assert.equal(await may(world.librarian.userId, "LIBRARIAN", ACCESS_PERMISSIONS.manageOwners), false);
    assert.equal(await may(t.libraryOwner.userId, "STAFF", ACCESS_PERMISSIONS.manageOwners), false);

    /* A real one: the module's activity log lists ADMIN only, and its owners read it */
    assert.equal(await status("GET", `${L}/activity`, h.tokens.librarian), 200);
    assert.equal(await status("GET", `${L}/activity`, t.libraryOwner.token), 200);
    assert.equal(await status("GET", `${L}/activity`, t.libraryClerk.token), 403);

    /* Effective access says where it comes from */
    const librarian = await get(`${AC}/users/${world.librarian.userId}/access?module=library`);
    const activity = librarian.data.modules[0].resources
      .find(r => r.resource === "activity")
      .permissions.find(p => p.action === "read");
    assert.deepEqual(activity.sources, [{ type: "OWNER", role: "LIBRARIAN" }]);
    const owner = await get(`${AC}/me/access?module=library`, as(t.libraryOwner.token));
    assert.ok(keysOf(owner.data).includes("library.activity.read"));
    assert.ok(keysOf(owner.data).includes("library.testOnly.purge"));
    assert.equal(owner.data.modules[0].owner, true);
  });

  it("changing who owns a module stays ADMIN's", async () => {
    for (const token of [h.tokens.librarian, t.libraryOwner.token]) {
      const made = await request("POST", `${AC}/assignments`, {
        as: token,
        body: { kind: "OWNER", module: "library", userId: world.office.userId }
      });
      assert.deepEqual([made.status, made.body.message], [403, OWNERS_REFUSAL]);
    }
    const ownership = await handOver(
      { module: "library", fromUserId: t.libraryOwner.userId, toUserId: world.office.userId, includeOwnership: true },
      h.tokens.librarian
    );
    assert.deepEqual([ownership.status, ownership.body.message], [403, OWNERS_REFUSAL]);
  });

  it("self-service still follows the account's role", async () => {
    /* A transport owner by assignment has no "my transport": that is for students and parents */
    const owner = await staffMember("trowner");
    await post(`${AC}/assignments`, { kind: "OWNER", module: "transport", userId: owner.userId });
    assert.equal(await status("GET", `${T}/routes`, owner.token), 200);
    assert.equal(await status("GET", `${T}/my-transport`, owner.token), 403);
    t.transportOwner = owner;
    world.transportOwner = owner;
  });
});

describe("handover: a new operator takes over completely", () => {
  it("sets up an operator who runs a desk and wardens a hostel", async () => {
    t.from = await staffMember("hofrom");
    t.to = await staffMember("hoto");
    t.desk = (
      await post(
        `${AC}/operator-roles`,
        { module: "hostel", name: "Hostel desk", permissions: ["hostel.hostels.read", "hostel.rooms.read"] },
        as(h.tokens.hostelManager)
      )
    ).data;
    t.nights = (
      await post(
        `${AC}/operator-roles`,
        { module: "hostel", name: "Night rounds", permissions: ["hostel.allocations.read"] },
        as(h.tokens.hostelManager)
      )
    ).data;
    t.live = (
      await post(
        `${AC}/assignments`,
        { operatorRoleId: t.desk.id, userId: t.from.userId, validTo: addDays(today, 30) },
        as(h.tokens.hostelManager)
      )
    ).data;
    t.upcoming = (
      await post(
        `${AC}/assignments`,
        { operatorRoleId: t.nights.id, userId: t.from.userId, validFrom: tomorrow },
        as(h.tokens.hostelManager)
      )
    ).data;
    t.hostel = (
      await post(
        `${HS}/hostels`,
        { name: "Handover House", residentGender: "COED", wardenUserId: t.from.userId },
        as(h.tokens.hostelManager)
      )
    ).data;
    assert.equal(await status("GET", `${HS}/hostels`, t.from.token), 200);
    assert.equal(await status("GET", `${HS}/hostels`, t.to.token), 403);
  });

  it("refuses with clear errors", async () => {
    const same = await handOver({ fromUserId: t.from.userId, toUserId: t.from.userId });
    assert.equal(same.status, 400);
    assert.match(same.body.message, /toUserId must be someone other than fromUserId/);

    const student = await handOver({ fromUserId: t.from.userId, toUserId: world.s1.userId });
    assert.equal(student.status, 422);
    assert.equal(
      student.body.message,
      "Fstudent1 Lstudent1 has a student account; work is handed over to employees only"
    );
    const nobody = await handOver({ fromUserId: t.from.userId, toUserId: uuid() });
    assert.equal(nobody.body.message, "toUserId does not refer to an active user");
    const unknown = await handOver({ fromUserId: uuid(), toUserId: t.to.userId });
    assert.equal(unknown.body.message, "fromUserId does not refer to a user of this school");

    const idle = await staffMember("hoidle");
    const nothing = await handOver({ fromUserId: idle.userId, toUserId: t.to.userId });
    assert.equal(nothing.status, 422);
    assert.equal(
      nothing.body.message,
      "Fhoidle Lhoidle has nothing to hand over in the Hostel module: no operator access now or later, and no records in their charge"
    );

    /* The person taking over must be able to hold it all, or nothing moves */
    const accountant = await handOver({ fromUserId: t.from.userId, toUserId: world.accountant.userId });
    assert.equal(accountant.status, 422);
    assert.equal(
      accountant.body.message,
      "Faccountant Laccountant cannot be a hostel warden: wardens have ADMIN, PRINCIPAL, HOSTEL_MANAGER, STAFF, TEACHER accounts, and theirs is ACCOUNTANT"
    );
    const manager = await handOver({ fromUserId: t.from.userId, toUserId: world.hostelManager.userId });
    assert.equal(manager.status, 422);
    assert.match(manager.body.message, /already owns it/);
    assert.equal(await status("GET", `${HS}/hostels`, t.from.token), 200, "rolled back");
    assert.equal((await get(`${HS}/hostels/${t.hostel.id}`)).data.wardenUserId, t.from.userId);

    /* Only the module's owners (or ADMIN) */
    assert.equal(
      (await handOver({ fromUserId: t.from.userId, toUserId: t.to.userId }, h.tokens.transportManager)).status,
      403
    );
    assert.equal((await handOver({ fromUserId: t.from.userId, toUserId: t.to.userId }, t.from.token)).status, 403);
    assert.equal((await handOver({ fromUserId: t.from.userId, toUserId: t.to.userId }, h.tokens.office)).status, 403);
    assert.equal(
      (await handOver({ module: "academics", fromUserId: t.from.userId, toUserId: t.to.userId })).status,
      400
    );
  });

  it("moves the operator's assignments and the records in their charge, in one go", async () => {
    const res = await handOver({ fromUserId: t.from.userId, toUserId: t.to.userId });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(
      res.body.message,
      `Hostel work of Fhofrom Lhofrom handed over to Fhoto Lhoto: 2 operator assignments (Hostel desk, Night rounds); Hostels (warden): Handover House (${t.hostel.code})`
    );
    const handover = res.body.data;
    assert.deepEqual([handover.module, handover.from.id, handover.to.id], ["hostel", t.from.userId, t.to.userId]);
    assert.equal(handover.note, "Handed over from Fhofrom Lhofrom");
    const byRole = Object.fromEntries(handover.assignments.map(a => [a.operatorRole.name, a]));
    /* A live one starts today and keeps its end; an upcoming one keeps its start */
    assert.deepEqual(
      [byRole["Hostel desk"].endedAssignmentId, byRole["Hostel desk"].validFrom, byRole["Hostel desk"].validTo],
      [t.live.id, today, addDays(today, 30)]
    );
    assert.deepEqual(
      [byRole["Night rounds"].endedAssignmentId, byRole["Night rounds"].validFrom, byRole["Night rounds"].validTo],
      [t.upcoming.id, tomorrow, null]
    );
    assert.deepEqual(handover.records, [
      {
        kind: "hostelWardens",
        label: "Hostels (warden)",
        count: 1,
        records: [{ id: t.hostel.id, name: `Handover House (${t.hostel.code})` }]
      }
    ]);

    /* The old operator has no access left; the new one has it at once */
    assert.equal(await status("GET", `${HS}/hostels`, t.from.token), 403);
    assert.equal(await status("GET", `${HS}/rooms`, t.from.token), 403);
    assert.equal(await status("GET", `${HS}/hostels`, t.to.token), 200);
    const from = await get(`${AC}/users/${t.from.userId}/access?module=hostel`, as(h.tokens.hostelManager));
    assert.deepEqual([from.data.modules, from.data.assignments], [[], []]);
    const to = await get(`${AC}/me/access?module=hostel`, as(t.to.token));
    assert.deepEqual(to.data.assignments.map(a => [a.operatorRole.name, a.status]).sort(), [
      ["Hostel desk", "ACTIVE"],
      ["Night rounds", "SCHEDULED"]
    ]);
    assert.equal((await get(`${HS}/hostels/${t.hostel.id}`)).data.wardenUserId, t.to.userId);

    /* History stays: the old rows are revoked as a handover, by whoever did it, with their
       original assigner; the new ones are assigned by the same person */
    const { rows } = await h.pool.query(
      `SELECT id, user_id, revoked_at IS NOT NULL AS revoked, revoked_by, revoke_reason, assigned_by, note
         FROM access_assignments WHERE id = ANY($1) ORDER BY user_id = $2 DESC`,
      [
        [t.live.id, t.upcoming.id, byRole["Hostel desk"].assignmentId, byRole["Night rounds"].assignmentId],
        t.from.userId
      ]
    );
    for (const row of rows.slice(0, 2)) {
      assert.deepEqual(
        [row.user_id, row.revoked, row.revoked_by, row.revoke_reason, row.assigned_by],
        [t.from.userId, true, world.hostelManager.userId, "HANDOVER", world.hostelManager.userId]
      );
    }
    for (const row of rows.slice(2)) {
      assert.deepEqual(
        [row.user_id, row.revoked, row.revoke_reason, row.assigned_by, row.note],
        [t.to.userId, false, null, world.hostelManager.userId, "Handed over from Fhofrom Lhofrom"]
      );
    }
    const revoked = await get(`${AC}/assignments?userId=${t.from.userId}&status=REVOKED`, as(h.tokens.hostelManager));
    assert.equal(revoked.meta.total, 2);

    /* Nothing left to hand over */
    assert.equal((await handOver({ fromUserId: t.from.userId, toUserId: t.to.userId })).status, 422);

    /* Audited under the handover permission, filed under the person who handed over */
    const audit = await auditEntry({ permission: "administration.access.handOver" });
    assert.deepEqual(
      [audit.entityId, audit.userId, audit.module, audit.action, audit.summary],
      [
        t.from.userId,
        world.hostelManager.userId,
        "administration",
        "Hand over an operator's access and duties in owned modules",
        res.body.message
      ]
    );
  });

  it("refuses to hand over to someone who already holds the same role", async () => {
    const third = await staffMember("hothird");
    await post(
      `${AC}/assignments`,
      { operatorRoleId: t.desk.id, userId: third.userId, validTo: addDays(today, 5) },
      as(h.tokens.hostelManager)
    );
    const overlap = await handOver({ fromUserId: t.to.userId, toUserId: third.userId });
    assert.equal(overlap.status, 409);
    assert.equal(
      overlap.body.message,
      `Fhothird Lhothird already holds Hostel desk (Hostel) until ${addDays(today, 5)}`
    );
    assert.equal(await status("GET", `${HS}/hostels`, t.to.token), 200, "nothing moved");
    assert.equal((await get(`${HS}/hostels/${t.hostel.id}`)).data.wardenUserId, t.to.userId);
  });

  it("ADMIN also hands over a module ownership, even from someone who has left", async () => {
    const leaving = await staffMember("ownleaving");
    const next = await staffMember("ownnext");
    const ownership = (
      await post(`${AC}/assignments`, {
        kind: "OWNER",
        module: "hostel",
        userId: leaving.userId,
        validTo: addDays(today, 200)
      })
    ).data;
    assert.equal(await status("GET", `${HS}/activity`, leaving.token), 200);

    /* An owner by assignment can hand over operators, but not their own ownership */
    assert.equal(
      (await handOver({ fromUserId: leaving.userId, toUserId: next.userId, includeOwnership: true }, leaving.token))
        .status,
      403
    );
    /* Without includeOwnership the ownership stays (and there is nothing else) */
    assert.equal((await handOver({ fromUserId: leaving.userId, toUserId: next.userId }, h.tokens.admin)).status, 422);

    await del(`/api/v1/users/${leaving.userId}`);
    const res = await handOver(
      { fromUserId: leaving.userId, toUserId: next.userId, includeOwnership: true, note: "Took over the hostel" },
      h.tokens.admin
    );
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(
      res.body.message,
      "Hostel work of Fownleaving Lownleaving handed over to Fownnext Lownnext: ownership of the module"
    );
    const [moved] = res.body.data.assignments;
    assert.deepEqual(
      [moved.kind, moved.endedAssignmentId, moved.validFrom, moved.validTo, moved.label],
      ["OWNER", ownership.id, today, addDays(today, 200), "owner of the Hostel module"]
    );
    assert.equal(await status("GET", `${HS}/activity`, next.token), 200);
    assert.equal(await status("GET", `${AC}/operator-roles?module=hostel`, next.token), 200);
    const audit = await auditEntry({ permission: "administration.access.manageOwners", entityId: leaving.userId });
    assert.equal(audit.summary, res.body.message);
  });
});
