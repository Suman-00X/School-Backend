import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, patch, del, person, tokenFor, uuid } from "../helpers/harness.js";

const AC = "/api/v1/administration/access";
const T = "/api/v1/transport";
const HS = "/api/v1/hostel";
const I = "/api/v1/inventory";
const HR = "/api/v1/hr";
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

/* Hold a row lock from a separate connection while `requests` start, then release it */
const raceBehindLock = async (lockSql, params, requests) => {
  const holder = await h.pool.connect();
  try {
    await holder.query("BEGIN");
    await holder.query(lockSql, params);
    const pending = Promise.all(requests.map(send => send()));
    let waiting = 0;
    for (let i = 0; i < 200 && waiting < requests.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      const { rows } = await h.pool.query(
        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
      );
      waiting = Number(rows[0].count);
    }
    assert.equal(waiting, requests.length, "every request waits on the lock");
    await holder.query("COMMIT");
    return await pending;
  } finally {
    holder.release(true);
  }
};

describe("access: permission catalogue", () => {
  it("lists every permission with its module, resource, action and label", async () => {
    const transport = await get(`${AC}/permissions?module=transport`, as(h.tokens.transportManager));
    assert.equal(transport.data.length, 1);
    const [module] = transport.data;
    assert.deepEqual(
      [module.module, module.label, module.operatorRoles, module.ownerRole],
      ["transport", "Transport", true, "TRANSPORT_MANAGER"]
    );
    const all = module.resources.flatMap(r => r.permissions);
    assert.equal(transport.message, `${all.length} permissions in the Transport module`);
    const byKey = Object.fromEntries(all.map(p => [p.key, p]));
    assert.deepEqual(Object.keys(byKey).sort(), [
      "transport.access.manage",
      "transport.activity.read",
      "transport.assignments.manage",
      "transport.assignments.read",
      "transport.myTransport.read",
      "transport.roster.read",
      "transport.routes.manage",
      "transport.routes.read",
      "transport.vehicles.manage",
      "transport.vehicles.read"
    ]);
    assert.deepEqual(
      [byKey["transport.assignments.manage"].label, byKey["transport.assignments.manage"].resource],
      ["Assign students to routes, change and end seats", "assignments"]
    );
    assert.equal(module.resources.find(r => r.resource === "myTransport").label, "My transport");
    /* Operator management and self-service are never given to operators */
    assert.deepEqual(
      [byKey["transport.access.manage"].ownerOnly, byKey["transport.access.manage"].grantable],
      [true, false]
    );
    assert.deepEqual(
      [byKey["transport.myTransport.read"].selfService, byKey["transport.myTransport.read"].grantable],
      [true, false]
    );
    /* The module's activity log: ADMIN by role, owners through ownership, never operators */
    assert.deepEqual(
      [
        byKey["transport.activity.read"].roles,
        byKey["transport.activity.read"].ownerOnly,
        byKey["transport.activity.read"].grantable
      ],
      [["ADMIN"], true, false]
    );
    assert.equal(byKey["transport.routes.read"].grantable, true);
    assert.deepEqual(byKey["transport.routes.read"].roles, ["ADMIN", "PRINCIPAL", "ACCOUNTANT", "TRANSPORT_MANAGER"]);

    /* Approval-type actions are marked by their module */
    const inventory = (await get(`${AC}/permissions?module=inventory`)).data[0];
    const adjust = inventory.resources.flatMap(r => r.permissions).find(p => p.key === "inventory.stock.adjust");
    assert.deepEqual(
      [adjust.ownerOnly, adjust.grantable, adjust.label],
      [true, false, "Adjust stock (counts, damage, loss)"]
    );

    /* Every module, labels generated from the key where none is given */
    const everything = await get(`${AC}/permissions`);
    const modules = everything.data.map(m => m.module);
    assert.ok(
      ["academics", "finance", "hostel", "hr", "inventory", "library", "transport"].every(m => modules.includes(m))
    );
    const academics = everything.data.find(m => m.module === "academics");
    assert.equal(academics.operatorRoles, false);
    const classes = academics.resources.find(r => r.resource === "classes").permissions;
    assert.deepEqual(
      classes.map(p => [p.key, p.label, p.grantable]),
      [
        ["academics.classes.create", "Create classes", false],
        ["academics.classes.read", "View classes", false],
        ["academics.classes.update", "Update classes", false]
      ]
    );

    /* What a role editor offers: grantable permissions only */
    const grantable = await get(`${AC}/permissions?grantable=true`);
    const offered = grantable.data.flatMap(m => m.resources.flatMap(r => r.permissions));
    assert.ok(offered.length > 20 && offered.every(p => p.grantable && !p.ownerOnly && !p.selfService));
    assert.deepEqual([...new Set(grantable.data.map(m => m.module))].sort(), [
      "hostel",
      "hr",
      "inventory",
      "library",
      "transport"
    ]);

    await get(`${AC}/permissions?module=nowhere`, {}, 400);
    await get(`${AC}/permissions?grantable=yes`, {}, 400);
    await get(`${AC}/permissions`, as(h.tokens.teacher), 403);
    await get(`${AC}/permissions`, as(h.tokens.office), 403);
    await get(`${AC}/permissions`, as(h.tokens.student1), 403);
  });
});

describe("access: operator roles", () => {
  it("a module owner defines operator roles from their module's permissions", async () => {
    const desk = await post(
      `${AC}/operator-roles`,
      {
        module: "transport",
        name: "Transport desk",
        description: "Front desk: routes, seats and rosters",
        permissions: [
          "transport.roster.read",
          "transport.routes.read",
          "transport.assignments.manage",
          "transport.roster.read"
        ]
      },
      as(h.tokens.transportManager)
    );
    assert.equal(desk.message, "Operator role Transport desk created in Transport with 3 permissions");
    assert.deepEqual(desk.data.permissions, [
      "transport.assignments.manage",
      "transport.roster.read",
      "transport.routes.read"
    ]);
    assert.deepEqual(
      desk.data.permissionDetails.map(p => [p.label, p.available]),
      [
        ["Assign students to routes, change and end seats", true],
        ["View and print route rosters", true],
        ["View routes and stops", true]
      ]
    );
    assert.equal(desk.data.holders, 0);
    t.desk = desk.data;

    const refused = (body, token = h.tokens.transportManager) =>
      request("POST", `${AC}/operator-roles`, { as: token, body: { module: "transport", name: "X", ...body } });

    const wrongModule = await refused({ permissions: ["transport.routes.read", "hostel.rooms.read"] });
    assert.equal(wrongModule.status, 422);
    assert.equal(
      wrongModule.body.message,
      "An operator role cannot include: hostel.rooms.read belongs to the Hostel module, not Transport"
    );
    const reserved = await refused({ permissions: ["transport.access.manage", "transport.myTransport.read"] });
    assert.equal(reserved.status, 422);
    assert.equal(
      reserved.body.message,
      'An operator role cannot include: "Manage Transport operator roles and operators" (transport.access.manage) is reserved for the module\'s owners; "View own (or own children\'s) transport" (transport.myTransport.read) is self-service and follows the account\'s role'
    );
    const unknown = await refused({ permissions: ["transport.routes.fly"] });
    assert.equal(
      unknown.body.message,
      "An operator role cannot include: transport.routes.fly is not a known permission"
    );
    assert.equal((await refused({ permissions: [] })).status, 400);
    assert.equal((await refused({ permissions: ["not a key"] })).status, 400);
    assert.equal((await refused({ module: "academics", permissions: ["academics.classes.read"] })).status, 400);

    const duplicate = await refused({ name: "transport DESK", permissions: ["transport.routes.read"] });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.message, "The Transport module already has an operator role named Transport desk");

    /* Another module's owner, office staff and teachers cannot */
    const otherOwner = await refused({ permissions: ["transport.routes.read"] }, h.tokens.hostelManager);
    assert.equal(otherOwner.status, 403);
    assert.equal(
      otherOwner.body.message,
      "Only an administrator or an owner of the Transport module can manage its operators"
    );
    assert.equal((await refused({ permissions: ["transport.routes.read"] }, h.tokens.office)).status, 403);
    assert.equal((await refused({ permissions: ["transport.routes.read"] }, h.tokens.teacher)).status, 403);

    /* Approval-type actions stay with the owner */
    const adjuster = await request("POST", `${AC}/operator-roles`, {
      as: h.tokens.inventoryManager,
      body: {
        module: "inventory",
        name: "Store clerk",
        permissions: ["inventory.stock.move", "inventory.stock.adjust"]
      }
    });
    assert.equal(adjuster.status, 422);
    assert.match(
      adjuster.body.message,
      /"Adjust stock \(counts, damage, loss\)" \(inventory\.stock\.adjust\) is reserved/
    );
    t.clerk = (
      await post(
        `${AC}/operator-roles`,
        { module: "inventory", name: "Store clerk", permissions: ["inventory.stock.move", "inventory.items.read"] },
        as(h.tokens.inventoryManager)
      )
    ).data;

    /* ADMIN works in every module */
    t.wardenDesk = (
      await post(`${AC}/operator-roles`, {
        module: "hostel",
        name: "Warden desk",
        permissions: ["hostel.hostels.read", "hostel.allocations.read"]
      })
    ).data;
  });

  it("lists, edits and guards roles per module", async () => {
    const mine = await get(`${AC}/operator-roles`, as(h.tokens.transportManager));
    assert.deepEqual(
      mine.data.map(r => r.name),
      ["Transport desk"],
      "an owner sees only their module's roles"
    );
    const everyone = await get(`${AC}/operator-roles`);
    assert.deepEqual(
      everyone.data.map(r => [r.module, r.name]),
      [
        ["transport", "Transport desk"],
        ["hostel", "Warden desk"],
        ["inventory", "Store clerk"]
      ]
    );
    assert.equal((await get(`${AC}/operator-roles?module=hostel&search=ward`)).meta.total, 1);
    assert.equal((await get(`${AC}/operator-roles?search=%25`)).meta.total, 0, "LIKE wildcards are literal");
    await get(`${AC}/operator-roles?module=transport`, as(h.tokens.hostelManager), 403);
    await get(`${AC}/operator-roles/${t.desk.id}`, as(h.tokens.hostelManager), 403);
    await get(`${AC}/operator-roles/${uuid()}`, {}, 404);
    await get(`${AC}/operator-roles/${t.desk.id}`, as(h.tokens.otherAdmin), 404);

    const renamed = await patch(
      `${AC}/operator-roles/${t.desk.id}`,
      { description: "Front desk" },
      as(h.tokens.transportManager)
    );
    assert.equal(renamed.message, "Operator role Transport desk updated (3 permissions)");
    await patch(`${AC}/operator-roles/${t.desk.id}`, { name: "Hijacked" }, as(h.tokens.hostelManager), 403);
    await patch(`${AC}/operator-roles/${t.desk.id}`, { module: "hostel" }, as(h.tokens.transportManager), 400);
    await patch(
      `${AC}/operator-roles/${t.desk.id}`,
      { permissions: ["transport.vehicles.manage", "hr.payslips.read"] },
      as(h.tokens.transportManager),
      422
    );
    await del(`${AC}/operator-roles/${t.desk.id}`, as(h.tokens.hostelManager), 403);
  });
});

describe("access: operators", () => {
  it("an operator can do exactly what their role allows in the module, nothing else", async () => {
    t.deskUser = await staffMember("desk");
    const desk = t.deskUser.token;
    const roster = `${T}/routes/${world.r1.id}/roster`;
    assert.equal(await status("GET", `${T}/routes`, desk), 403, "office staff have no transport access by default");

    const assigned = await post(
      `${AC}/assignments`,
      { operatorRoleId: t.desk.id, userId: t.deskUser.userId, note: "Mornings at the gate" },
      as(h.tokens.transportManager)
    );
    assert.equal(assigned.message, "Fdesk Ldesk now holds Transport desk (Transport) with no end date");
    assert.deepEqual(
      [
        assigned.data.kind,
        assigned.data.module,
        assigned.data.status,
        assigned.data.user.role,
        assigned.data.operatorRole.name
      ],
      ["OPERATOR", "transport", "ACTIVE", "STAFF", "Transport desk"]
    );
    t.deskAssignment = assigned.data;

    /* Granted: view routes, print rosters, assign students */
    assert.equal(await status("GET", `${T}/routes`, desk), 200);
    assert.equal(await status("GET", `${T}/routes/${world.r1.id}`, desk), 200);
    assert.equal(await status("GET", roster, desk), 200);

    const vehicle = (await post(`${T}/vehicles`, { registrationNumber: "KA09OP0001", capacity: 5 })).data;
    t.deskRoute = (
      await post(`${T}/routes`, { name: "Desk Loop", vehicleId: vehicle.id, stops: [{ name: "Gate 2" }] })
    ).data;
    const free = await h.pool.query(
      `SELECT e.student_id FROM student_enrollments e
         JOIN academic_years y ON y.id = e.academic_year_id AND y.is_current
        WHERE e.tenant_id = $1 AND e.is_active AND e.status = 'ACTIVE'
          AND NOT EXISTS (SELECT 1 FROM transport_assignments a
                           WHERE a.student_id = e.student_id AND a.is_active AND a.status = 'ACTIVE')
        LIMIT 1`,
      [h.tenant.id]
    );
    const seat = await post(
      `${T}/assignments`,
      { studentId: free.rows[0].student_id, routeId: t.deskRoute.id, stopId: t.deskRoute.stops[0].id },
      as(desk)
    );
    assert.equal(seat.data.routeId, t.deskRoute.id);
    t.deskSeat = seat.data;
    /* Seat changes come with assigning */
    assert.equal(await status("POST", `${T}/assignments/${seat.data.id}/end`, desk, {}), 200);

    /* Not granted: 403 on everything else in the module, and outside it */
    for (const [method, url, body] of [
      ["GET", `${T}/assignments`],
      ["GET", `${T}/assignments/${seat.data.id}`],
      ["GET", `${T}/vehicles`],
      ["POST", `${T}/vehicles`, { registrationNumber: "KA09OP0002", capacity: 5 }],
      ["PATCH", `${T}/routes/${world.r1.id}`, { name: "Renamed" }],
      ["DELETE", `${T}/routes/${t.deskRoute.id}`],
      ["GET", `${HS}/hostels`],
      ["GET", `${I}/items`],
      ["GET", `${AC}/operator-roles`],
      ["GET", `${AC}/permissions`],
      ["POST", `${AC}/assignments`, { operatorRoleId: t.desk.id, userId: world.office.userId }]
    ]) {
      assert.equal(await status(method, url, desk, body), 403, `${method} ${url}`);
    }
    /* Their own role still works */
    assert.equal(await status("GET", "/api/v1/administration/settings", desk), 200);

    /* What they hold, and where it comes from */
    const mine = await get(`${AC}/me/access?module=transport`, as(desk));
    assert.equal(mine.message, "You have access to 1 module");
    assert.deepEqual(keysOf(mine.data).sort(), [
      "transport.assignments.manage",
      "transport.roster.read",
      "transport.routes.read"
    ]);
    assert.deepEqual(mine.data.modules[0].resources[0].permissions[0].sources, [
      {
        type: "OPERATOR",
        assignmentId: t.deskAssignment.id,
        operatorRoleId: t.desk.id,
        operatorRoleName: "Transport desk",
        validFrom: null,
        validTo: null
      }
    ]);
    assert.equal(mine.data.modules[0].owner, false);
    const everything = await get(`${AC}/me/access`, as(desk));
    assert.ok(
      everything.data.modules.some(m => m.module === "administration"),
      "STAFF permissions by role"
    );
    assert.deepEqual(
      everything.data.assignments.map(a => [a.kind, a.status]),
      [["OPERATOR", "ACTIVE"]]
    );

    /* The role now has a holder */
    assert.equal((await get(`${AC}/operator-roles/${t.desk.id}`)).data.holders, 1);
  });

  it("refuses accounts that cannot be operators and overlapping assignments", async () => {
    const assign = (body, token = h.tokens.transportManager) =>
      request("POST", `${AC}/assignments`, { as: token, body: { operatorRoleId: t.desk.id, ...body } });

    const twice = await assign({ userId: t.deskUser.userId, validFrom: tomorrow });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.message, "Fdesk Ldesk already holds Transport desk (Transport) with no end date");

    const student = await assign({ userId: world.s1.userId });
    assert.equal(student.status, 422);
    assert.equal(
      student.body.message,
      "Fstudent1 Lstudent1 has a student account; module access is for staff accounts only"
    );
    assert.equal(
      (await assign({ userId: h.admin.id })).body.message,
      "Ada Admin is an administrator and already has full access"
    );
    assert.equal(
      (await assign({ userId: world.transportManager.userId })).body.message,
      "FtransportManager LtransportManager is the Transport module's administrator (TRANSPORT_MANAGER) and already owns it"
    );
    assert.equal((await assign({ userId: uuid() })).body.message, "userId does not refer to an active user");
    assert.equal(
      (await assign({ operatorRoleId: uuid(), userId: world.office.userId })).body.message,
      "operatorRoleId does not refer to an existing operator role"
    );
    assert.equal((await assign({ userId: world.office.userId, module: "transport" })).status, 400);
    assert.equal((await assign({ operatorRoleId: undefined, userId: world.office.userId })).status, 400);
    assert.equal((await assign({ userId: world.office.userId, validFrom: tomorrow, validTo: today })).status, 400);
    const past = await assign({ userId: world.office.userId, validTo: addDays(today, -1) });
    assert.equal(past.status, 422);
    assert.match(past.body.message, /is in the past/);
    /* Another module's owner cannot hand out this module's roles */
    assert.equal((await assign({ userId: world.office.userId }, h.tokens.hostelManager)).status, 403);
  });

  it("approval-type actions stay with the owner even for a stock operator", async () => {
    t.clerkUser = await staffMember("clerk");
    await post(
      `${AC}/assignments`,
      { operatorRoleId: t.clerk.id, userId: t.clerkUser.userId },
      as(h.tokens.inventoryManager)
    );
    const item = (
      await post(`${I}/items`, { sku: "OPS-01", name: "Duster", categoryId: world.stationery.id, unit: "PCS" })
    ).data;
    const move = body => request("POST", `${I}/items/${item.id}/movements`, { as: t.clerkUser.token, body });

    const receipt = await move({ type: "RECEIPT", quantity: 10, unitCost: 25 });
    assert.equal(receipt.status, 201);
    assert.equal(
      receipt.body.message,
      `Received 10 PCS of Duster. 10 PCS in stock (${receipt.body.data.movementNumber})`
    );
    assert.equal((await move({ type: "ADJUSTMENT", quantityChange: -2, reason: "Damaged" })).status, 403);
    assert.equal((await get(`${I}/items/${item.id}`, as(t.clerkUser.token))).data.stockOnHand, 10);
    /* The owner can */
    await post(
      `${I}/items/${item.id}/movements`,
      { type: "ADJUSTMENT", quantityChange: -2, reason: "Damaged" },
      as(h.tokens.inventoryManager)
    );
  });
});

describe("access: validity dates", () => {
  it("an assignment counts only between its dates", async () => {
    t.printer = (
      await post(
        `${AC}/operator-roles`,
        { module: "transport", name: "Roster printer", permissions: ["transport.roster.read"] },
        as(h.tokens.transportManager)
      )
    ).data;
    t.temp = await staffMember("temp");
    const roster = `${T}/routes/${world.r1.id}/roster`;

    const scheduled = await post(
      `${AC}/assignments`,
      { operatorRoleId: t.printer.id, userId: t.temp.userId, validFrom: tomorrow, validTo: addDays(today, 30) },
      as(h.tokens.transportManager)
    );
    assert.equal(scheduled.data.status, "SCHEDULED");
    assert.equal(
      scheduled.message,
      `Ftemp Ltemp now holds Roster printer (Transport) from ${tomorrow} until ${addDays(today, 30)} (scheduled)`
    );
    assert.equal(await status("GET", roster, t.temp.token), 403, "not before validFrom");

    /* Bringing the start forward takes effect at once */
    const started = await patch(
      `${AC}/assignments/${scheduled.data.id}`,
      { validFrom: today },
      as(h.tokens.transportManager)
    );
    assert.equal(started.data.status, "ACTIVE");
    assert.equal(started.message, `Ftemp Ltemp: Roster printer (Transport), from ${today} until ${addDays(today, 30)}`);
    assert.equal(await status("GET", roster, t.temp.token), 200);

    /* A later, non-overlapping period of the same role is allowed; an overlapping one is not */
    const later = await post(
      `${AC}/assignments`,
      {
        operatorRoleId: t.printer.id,
        userId: t.temp.userId,
        validFrom: addDays(today, 60),
        validTo: addDays(today, 90)
      },
      as(h.tokens.transportManager)
    );
    assert.equal(later.data.status, "SCHEDULED");
    const overlap = await request("PATCH", `${AC}/assignments/${later.data.id}`, {
      as: h.tokens.transportManager,
      body: { validFrom: addDays(today, 10) }
    });
    assert.equal(overlap.status, 409);
    assert.equal(
      overlap.body.message,
      `Ftemp Ltemp already holds Roster printer (Transport) from ${today} until ${addDays(today, 30)}`
    );
    await patch(
      `${AC}/assignments/${later.data.id}`,
      { validTo: addDays(today, -1) },
      as(h.tokens.transportManager),
      422
    );

    /* Once validTo has passed (dates moved back in the table, as if time went by), access ends */
    await h.pool.query("UPDATE access_assignments SET valid_from = $2, valid_to = $3 WHERE id = $1", [
      started.data.id,
      addDays(today, -40),
      addDays(today, -1)
    ]);
    const { accessGrants } = await import("../../src/modules/administration/access/index.js");
    await accessGrants.invalidate(h.tenant.id);
    assert.equal(await status("GET", roster, t.temp.token), 403, "not after validTo");

    const expired = await get(
      `${AC}/assignments?userId=${t.temp.userId}&status=EXPIRED`,
      as(h.tokens.transportManager)
    );
    assert.deepEqual(
      expired.data.map(a => a.id),
      [started.data.id]
    );
    const upcoming = await get(
      `${AC}/assignments?userId=${t.temp.userId}&status=SCHEDULED`,
      as(h.tokens.transportManager)
    );
    assert.deepEqual(
      upcoming.data.map(a => a.id),
      [later.data.id]
    );
  });

  it("the database refuses overlapping assignments of one role", async () => {
    const insert = (from, to) =>
      h.pool.query(
        `INSERT INTO access_assignments (tenant_id, kind, module, operator_role_id, user_id, valid_from, valid_to)
         VALUES ($1, 'OPERATOR', 'transport', $2, $3, $4, $5)`,
        [h.tenant.id, t.printer.id, t.temp.userId, from, to]
      );
    const error = await insert(addDays(today, 80), null).catch(e => e);
    assert.equal(error.code, "23P01");
    assert.equal(error.constraint, "access_assignments_operator_no_overlap");
    const mismatch = await h.pool
      .query(
        `INSERT INTO operator_roles (tenant_id, module, name, permissions) VALUES ($1, 'transport', 'Odd', '{hostel.rooms.read}')`,
        [h.tenant.id]
      )
      .catch(e => e);
    assert.equal(mismatch.constraint, "operator_roles_permissions_module_chk");
  });
});

describe("access: module owners", () => {
  it("an owner manages operators of their own module only", async () => {
    const hostelRole = (body, token) =>
      request("POST", `${AC}/assignments`, { as: token, body: { operatorRoleId: t.wardenDesk.id, ...body } });
    assert.equal((await hostelRole({ userId: world.office.userId }, h.tokens.transportManager)).status, 403);
    assert.equal(await status("DELETE", `${AC}/assignments/${t.deskAssignment.id}`, h.tokens.hostelManager), 403);
    assert.equal(
      await status("PATCH", `${AC}/assignments/${t.deskAssignment.id}`, h.tokens.hostelManager, { note: "x" }),
      403
    );
    assert.equal(await status("GET", `${AC}/assignments?module=transport`, h.tokens.hostelManager), 403);
    assert.equal(await status("GET", `${AC}/assignments/${t.deskAssignment.id}`, h.tokens.hostelManager), 403);

    const ownList = await get(`${AC}/assignments`, as(h.tokens.hostelManager));
    assert.ok(ownList.data.every(a => a.module === "hostel"));
    const transportList = await get(`${AC}/assignments?module=transport&kind=OPERATOR`, as(h.tokens.transportManager));
    assert.ok(transportList.data.length >= 3 && transportList.data.every(a => a.module === "transport"));

    /* Only ADMIN makes owners */
    const owner = await request("POST", `${AC}/assignments`, {
      as: h.tokens.hostelManager,
      body: { kind: "OWNER", module: "hostel", userId: world.office.userId }
    });
    assert.equal(owner.status, 403);
    assert.equal(await h.modules.AuditLog.countDocuments({ permission: "administration.access.manageOwners" }), 0);
  });

  it("ADMIN makes an office account the owner of the hostel module", async () => {
    t.hostelOwner = await staffMember("hostelowner");
    const owner = t.hostelOwner.token;
    assert.equal(await status("GET", `${HS}/hostels`, owner), 403);

    const made = await post(`${AC}/assignments`, {
      kind: "OWNER",
      module: "hostel",
      userId: t.hostelOwner.userId,
      validTo: addDays(today, 365)
    });
    assert.equal(
      made.message,
      `Fhostelowner Lhostelowner is now an owner of the Hostel module until ${addDays(today, 365)}`
    );
    assert.deepEqual([made.data.kind, made.data.operatorRoleId, made.data.status], ["OWNER", null, "ACTIVE"]);
    t.ownership = made.data;
    await post(`${AC}/assignments`, { kind: "OWNER", module: "hostel", userId: t.hostelOwner.userId }, {}, 409);
    await post(`${AC}/assignments`, { kind: "OWNER", userId: t.hostelOwner.userId }, {}, 400);
    await post(
      `${AC}/assignments`,
      { kind: "OWNER", module: "hostel", operatorRoleId: t.wardenDesk.id, userId: t.hostelOwner.userId },
      {},
      400
    );
    await post(`${AC}/assignments`, { kind: "OWNER", module: "hostel", userId: world.hostelManager.userId }, {}, 422);

    /* Everything the hostel manager can do */
    assert.equal(await status("GET", `${HS}/hostels`, owner), 200);
    const hostel = await post(`${HS}/hostels`, { name: "Day Scholars Annex", residentGender: "COED" }, as(owner));
    assert.equal(hostel.message, `Hostel Day Scholars Annex (${hostel.data.code}) created`);
    assert.equal(
      await status("GET", `${HS}/bed-availability?hostelId=${hostel.data.id}&fromDate=${today}`, owner),
      200
    );
    /* ... and runs the module's operators */
    const role = await post(
      `${AC}/operator-roles`,
      { module: "hostel", name: "Night warden", permissions: ["hostel.allocations.read"] },
      as(owner)
    );
    await post(`${AC}/assignments`, { operatorRoleId: role.data.id, userId: world.office.userId }, as(owner));
    await patch(`${AC}/operator-roles/${t.wardenDesk.id}`, { description: "Day desk" }, as(owner));
    assert.ok((await get(`${AC}/permissions?module=hostel`, as(owner))).data.length === 1);

    /* ... but no other module, no ownerships, and their own role is unchanged */
    assert.equal(await status("GET", `${T}/routes`, owner), 403);
    assert.equal(
      await status("POST", `${AC}/operator-roles`, owner, {
        module: "transport",
        name: "Y",
        permissions: ["transport.routes.read"]
      }),
      403
    );
    assert.equal(
      await status("POST", `${AC}/assignments`, owner, {
        kind: "OWNER",
        module: "hostel",
        userId: world.office.userId
      }),
      403
    );
    assert.equal(await status("DELETE", `${AC}/assignments/${t.ownership.id}`, owner), 403);
    assert.equal(await status("GET", `${AC}/operator-roles?module=transport`, owner), 403);
    assert.equal(await status("GET", "/api/v1/administration/settings", owner), 200);

    /* Their effective access, as ADMIN and the hostel manager see it */
    const access = await get(`${AC}/users/${t.hostelOwner.userId}/access`);
    assert.equal(access.message, `Fhostelowner Lhostelowner has access to ${access.data.modules.length} modules`);
    const hostelAccess = access.data.modules.find(m => m.module === "hostel");
    assert.equal(hostelAccess.owner, true);
    const manageBeds = hostelAccess.resources
      .find(r => r.resource === "allocations")
      .permissions.find(p => p.action === "manage");
    assert.deepEqual(
      manageBeds.sources.map(s => [s.type, s.assignmentId]),
      [["OWNER", t.ownership.id]]
    );
    assert.ok(keysOf(access.data).includes("hostel.access.manage"));
    assert.ok(!keysOf(access.data).includes("hostel.myHostel.read"), "self-service follows the role");
    const seenByManager = await get(`${AC}/users/${t.hostelOwner.userId}/access`, as(h.tokens.hostelManager));
    assert.deepEqual(
      seenByManager.data.modules.map(m => m.module),
      ["hostel"]
    );
    await get(`${AC}/users/${t.hostelOwner.userId}/access?module=transport`, as(h.tokens.hostelManager), 403);
    await get(`${AC}/users/${uuid()}/access`, {}, 404);
    await get(`${AC}/users/${t.hostelOwner.userId}/access`, as(h.tokens.office), 403);

    /* Hostel notices reach owners by assignment too */
    const { accessService } = await import("../../src/modules/administration/access/index.js");
    const { ALLOCATION_PERMISSIONS } =
      await import("../../src/modules/hostel/allocations/permissions/allocation.permissions.js");
    const managers = await h.inSchool(() =>
      accessService.usersGranted({ tenantId: h.tenant.id }, ALLOCATION_PERMISSIONS.manage)
    );
    assert.deepEqual(managers, [t.hostelOwner.userId]);

    /* Recorded in the audit trail under the stricter permission */
    const audit = await h.modules.AuditLog.findOne({ permission: "administration.access.manageOwners" }).lean();
    assert.equal(audit.entityId, t.ownership.id);
  });

  it("an HR owner by assignment can cancel approved leave; an HR operator cannot approve", async () => {
    const hrOwner = await staffMember("hrowner");
    await post(`${AC}/assignments`, { kind: "OWNER", module: "hr", userId: hrOwner.userId });
    const clerk = await staffMember("hrclerk");
    const role = (
      await post(
        `${AC}/operator-roles`,
        { module: "hr", name: "Attendance clerk", permissions: ["hr.staffAttendance.read", "hr.leaveRequests.read"] },
        as(h.tokens.hrManager)
      )
    ).data;
    await post(`${AC}/assignments`, { operatorRoleId: role.id, userId: clerk.userId }, as(h.tokens.hrManager));
    const applied = await request("POST", `${HR}/leave-requests`, {
      as: h.tokens.hrManager,
      body: { leaveTypeId: world.cl.id, fromDate: "2027-02-16", toDate: "2027-02-16", reason: "Family" }
    });
    assert.equal(applied.status, 201, JSON.stringify(applied.body));
    const leave = applied.body.data;

    assert.equal(await status("GET", `${HR}/leave-requests/${leave.id}`, clerk.token), 200);
    assert.equal(
      await status("POST", `${HR}/leave-requests/${leave.id}/decision`, clerk.token, { decision: "APPROVED" }),
      403
    );
    const cancelByClerk = await request("POST", `${HR}/leave-requests/${leave.id}/cancellation`, {
      as: clerk.token,
      body: {}
    });
    assert.equal(cancelByClerk.status, 403, "can see it, so is told why");
    assert.equal(cancelByClerk.body.message, "Only the applicant or an HR administrator can cancel a leave request");

    await post(`${HR}/leave-requests/${leave.id}/decision`, { decision: "APPROVED" }, as(hrOwner.token), 200);
    const cancelled = await post(
      `${HR}/leave-requests/${leave.id}/cancellation`,
      { reason: "Exam duty" },
      as(hrOwner.token),
      200
    );
    assert.equal(cancelled.data.status, "CANCELLED");
  });
});

describe("access: revocation and changes take effect at once", () => {
  it("revoking an assignment or editing a role applies on the next request", async () => {
    const desk = t.deskUser.token;
    const roster = `${T}/routes/${world.r1.id}/roster`;
    assert.equal(await status("GET", roster, desk), 200, "cached grants");

    /* Narrow the role: the roster goes on the next request */
    await patch(
      `${AC}/operator-roles/${t.desk.id}`,
      { permissions: ["transport.routes.read", "transport.assignments.manage"] },
      as(h.tokens.transportManager)
    );
    assert.equal(await status("GET", roster, desk), 403);
    assert.equal(await status("GET", `${T}/routes`, desk), 200);

    /* Revoke: everything goes on the next request */
    const revoked = await del(`${AC}/assignments/${t.deskAssignment.id}`, as(h.tokens.transportManager));
    assert.equal(revoked.message, "Fdesk Ldesk no longer holds Transport desk (Transport)");
    assert.equal(revoked.data.status, "REVOKED");
    assert.equal(revoked.data.revoker.firstName, "FtransportManager");
    assert.equal(await status("GET", `${T}/routes`, desk), 403);
    assert.equal(await status("DELETE", `${AC}/assignments/${t.deskAssignment.id}`, h.tokens.transportManager), 409);
    assert.equal(
      await status("PATCH", `${AC}/assignments/${t.deskAssignment.id}`, h.tokens.transportManager, { note: "x" }),
      409
    );
    const history = await get(`${AC}/assignments?status=REVOKED&module=transport`, as(h.tokens.transportManager));
    assert.deepEqual(
      history.data.map(a => a.id),
      [t.deskAssignment.id]
    );

    /* Revoking an ownership is ADMIN's */
    await del(`${AC}/assignments/${t.ownership.id}`, as(h.tokens.hostelManager), 403);
    const unowned = await del(`${AC}/assignments/${t.ownership.id}`);
    assert.equal(unowned.message, "Fhostelowner Lhostelowner is no longer an owner of the Hostel module");
    assert.equal(await status("GET", `${HS}/hostels`, t.hostelOwner.token), 403);
    assert.equal(await status("GET", `${AC}/operator-roles`, t.hostelOwner.token), 403);
  });

  it("a role is removed only once nobody holds it", async () => {
    const held = await request("DELETE", `${AC}/operator-roles/${t.clerk.id}`, { as: h.tokens.inventoryManager });
    assert.equal(held.status, 409);
    assert.equal(
      held.body.message,
      "Store clerk is held by 1 user(s), now or from a later date; revoke those assignments before removing it"
    );
    const removed = await del(`${AC}/operator-roles/${t.desk.id}`, as(h.tokens.transportManager));
    assert.equal(removed.message, "Operator role Transport desk removed");
    await get(`${AC}/operator-roles/${t.desk.id}`, {}, 404);
    /* Its history stays */
    const history = await get(`${AC}/assignments/${t.deskAssignment.id}`, as(h.tokens.transportManager));
    assert.equal(history.data.operatorRole.name, "Transport desk");
    /* Names can be reused */
    await post(`${AC}/operator-roles`, {
      module: "transport",
      name: "Transport desk",
      permissions: ["transport.routes.read"]
    });
  });

  it("assigning and removing a role serialize on the role's row lock", async () => {
    const role = (
      await post(`${AC}/operator-roles`, {
        module: "transport",
        name: "Race desk",
        permissions: ["transport.routes.read"]
      })
    ).data;
    const racer = await staffMember("racer");
    const lockRole = ["SELECT id FROM operator_roles WHERE id = $1 FOR UPDATE", [role.id]];

    /* Two identical assignments: exactly one */
    const twins = await raceBehindLock(...lockRole, [
      () => request("POST", `${AC}/assignments`, { body: { operatorRoleId: role.id, userId: racer.userId } }),
      () => request("POST", `${AC}/assignments`, { body: { operatorRoleId: role.id, userId: racer.userId } })
    ]);
    assert.deepEqual(twins.map(r => r.status).sort(), [201, 409]);
    const winner = twins.find(r => r.status === 201).body.data;

    /* Removing the role while someone is being assigned it: exactly one wins */
    await del(`${AC}/assignments/${winner.id}`);
    const other = await staffMember("racer2");
    const [removal, assignment] = await raceBehindLock(...lockRole, [
      () => request("DELETE", `${AC}/operator-roles/${role.id}`),
      () => request("POST", `${AC}/assignments`, { body: { operatorRoleId: role.id, userId: other.userId } })
    ]);
    const outcome = [removal.status, assignment.status];
    assert.ok(
      (outcome[0] === 200 && outcome[1] === 422) || (outcome[0] === 409 && outcome[1] === 201),
      `exactly one wins: ${outcome}`
    );
    const live = await h.pool.query(
      `SELECT count(*) FROM access_assignments a JOIN operator_roles r ON r.id = a.operator_role_id
        WHERE a.operator_role_id = $1 AND a.is_active AND a.revoked_at IS NULL AND NOT r.is_active`,
      [role.id]
    );
    assert.equal(Number(live.rows[0].count), 0, "no live assignment of a removed role");
  });

  it("writes are audited with the permission used", async () => {
    const roleWrites = await h.modules.AuditLog.countDocuments({
      tenantId: h.tenant.id,
      permission: "administration.access.manage",
      path: { $regex: "/operator-roles" }
    });
    assert.ok(roleWrites >= 8);
    const revoke = await h.modules.AuditLog.findOne({
      method: "DELETE",
      entityId: t.deskAssignment.id
    }).lean();
    assert.equal(revoke.userId, world.transportManager.userId);
  });
});
