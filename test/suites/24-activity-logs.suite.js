import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, patch, person, tokenFor, uuid } from "../helpers/harness.js";

const AC = "/api/v1/administration/access";
const LOG = "/api/v1/administration/audit-logs";
const T = "/api/v1/transport";
/* Log days are UTC days */
const utcToday = new Date().toISOString().slice(0, 10);

/* Values shared by the tests below */
const t = {};
const as = token => ({ as: token });
const status = async (method, url, token) => (await request(method, url, { as: token })).status;

/* The audit trail is written just after the response */
const settled = async (filter, count = 1) => {
  for (let i = 0; i < 100; i++) {
    if ((await h.modules.AuditLog.countDocuments({ tenantId: h.tenant.id, ...filter })) >= count) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(`fewer than ${count} audit entries for ${JSON.stringify(filter)}`);
};

describe("activity logs: what each entry records", () => {
  it("module, action, the response's message and a snapshot of who did it", async () => {
    const added = await post(
      `${T}/vehicles`,
      { registrationNumber: "KA05AL0001", capacity: 30 },
      as(h.tokens.transportManager)
    );
    t.vehicle = added.data;
    t.added = added.message;
    t.renamed = (await patch(`${T}/vehicles/${t.vehicle.id}`, { make: "Tata" }, as(h.tokens.transportManager))).message;
    await settled({ entityId: t.vehicle.id }, 2);

    const entry = await h.modules.AuditLog.findOne({ entityId: t.vehicle.id, method: "POST" }).lean();
    assert.deepEqual(
      [entry.module, entry.permission, entry.action, entry.summary, entry.actor],
      [
        "transport",
        "transport.vehicles.manage",
        "Add, edit and retire vehicles",
        "Vehicle KA05AL0001 added (30 seats)",
        { name: "FtransportManager LtransportManager", role: "TRANSPORT_MANAGER" }
      ]
    );

    /* The snapshot keeps the name at the time */
    const owner = world.transportOwner;
    const route = await post(`${T}/vehicles`, { registrationNumber: "KA05AL0002", capacity: 12 }, as(owner.token));
    t.ownerVehicle = route.data;
    await settled({ entityId: t.ownerVehicle.id });
    await patch(`/api/v1/users/${owner.userId}`, { firstName: "Renamed" });
    await settled({ entityId: owner.userId, method: "PATCH" });
    const before = await h.modules.AuditLog.findOne({ entityId: t.ownerVehicle.id }).lean();
    assert.deepEqual(before.actor, { name: "Ftrowner Ltrowner", role: "STAFF" });

    /* Sign-ins stay in their own events, under "auth" */
    const login = await h.modules.AuditLog.findOne({ permission: "auth.login" }).lean();
    assert.equal(login.module, "auth");
  });
});

describe("activity logs: the central log", () => {
  it("filters by module, user, permission, record, method, dates and words", async () => {
    const list = async query => (await get(`${LOG}?limit=100&${query}`)).data;

    const transport = await list("module=transport");
    assert.ok(transport.length >= 3 && transport.every(e => e.module === "transport"));

    const byManager = await list(`module=transport&userId=${world.transportManager.userId}`);
    assert.ok(byManager.length >= 2 && byManager.every(e => e.userId === world.transportManager.userId));

    assert.ok(
      (await list("permission=transport.vehicles.manage")).every(e => e.permission === "transport.vehicles.manage")
    );
    assert.ok((await list("permission=transport.")).every(e => e.permission.startsWith("transport.")));

    const vehicle = await list(`entityId=${t.vehicle.id}`);
    assert.deepEqual(
      vehicle.map(e => e.summary),
      [t.renamed, t.added],
      "newest first"
    );
    assert.deepEqual(
      (await list(`entityId=${t.vehicle.id}&method=PATCH`)).map(e => e.summary),
      [t.renamed]
    );

    assert.equal((await list(`entityId=${t.vehicle.id}&from=${utcToday}&to=${utcToday}`)).length, 2);
    assert.equal((await list(`entityId=${t.vehicle.id}&from=${addDays(utcToday, 1)}`)).length, 0);
    assert.equal((await list(`entityId=${t.vehicle.id}&to=${addDays(utcToday, -1)}`)).length, 0);

    /* Words in the summary, any casing; regular-expression characters are literal */
    const search = words => list(`search=${encodeURIComponent(words)}`);
    assert.deepEqual(
      (await search("ka05al0001 ADDED")).map(e => e.entityId),
      [t.vehicle.id]
    );
    assert.equal((await search("AL0001 added (30 seats)")).length, 1);
    assert.equal((await search(".*")).length, 0);

    /* Who can read it: ADMIN only */
    await get(LOG, as(h.tokens.transportManager), 403);
    await get(LOG, as(h.tokens.principal), 403);
    await get(`${LOG}?module=Not-a-module`, {}, 400);
    await get(`${LOG}?search=`, {}, 400);
  });
});

describe("activity logs: each module's tab", () => {
  it("shows the module's entries, with the same filters", async () => {
    const tab = await get(`${T}/activity?limit=100`, as(h.tokens.transportManager));
    assert.equal(tab.message, "Transport activity retrieved successfully");
    assert.ok(tab.data.length >= 3 && tab.data.every(e => e.module === "transport"));
    assert.ok(!tab.data.some(e => e.permission?.startsWith("auth.")), "no sign-ins");

    const filtered = async query => (await get(`${T}/activity?${query}`, as(h.tokens.transportManager))).data;
    assert.deepEqual(
      (await filtered(`entityId=${t.vehicle.id}&method=POST`)).map(e => e.summary),
      [t.added]
    );
    assert.deepEqual(
      (await filtered(`userId=${world.transportOwner.userId}`)).map(e => e.entityId),
      [t.ownerVehicle.id]
    );
    assert.ok((await filtered("permission=transport.vehicles.manage")).length >= 3);
    assert.equal((await filtered(`entityId=${t.vehicle.id}&from=${addDays(utcToday, 1)}`)).length, 0);
    assert.equal((await filtered(`entityId=${t.vehicle.id}&to=${utcToday}`)).length, 2);
    assert.deepEqual(
      (await filtered("search=ka05al0002")).map(e => e.entityId),
      [t.ownerVehicle.id]
    );
    /* The module is fixed: another module's entries never show */
    assert.ok((await filtered("module=hostel&limit=100")).every(e => e.module === "transport"));
    assert.equal((await filtered("permission=hostel.")).length, 0);

    /* One entry, only from its own module */
    const entry = await get(`${T}/activity/${tab.data[0].id}`, as(h.tokens.transportManager));
    assert.equal(entry.data.module, "transport");
    const hostelEntry = (await get("/api/v1/hostel/activity?limit=1")).data[0];
    await get(`${T}/activity/${hostelEntry.id}`, {}, 404);
    await get(`${T}/activity/not-an-id`, {}, 400);

    /* Read-only */
    assert.equal(await status("POST", `${T}/activity`, h.tokens.admin), 404);
    assert.equal(await status("DELETE", `${T}/activity/${tab.data[0].id}`, h.tokens.admin), 404);
    assert.equal(await status("GET", "/api/v1/auth/activity", h.tokens.admin), 404, "sign-ins have no module tab");
  });

  it("ADMIN reads every module's, an owner their own, nobody else", async () => {
    const operator = (await post("/api/v1/users/staff", { role: "STAFF", user: person("actop") })).data;
    const operatorToken = tokenFor(operator.userId, "STAFF");
    const role = (
      await post(
        `${AC}/operator-roles`,
        { module: "transport", name: "Activity desk", permissions: ["transport.routes.read"] },
        as(h.tokens.transportManager)
      )
    ).data;
    await post(
      `${AC}/assignments`,
      { operatorRoleId: role.id, userId: operator.userId },
      as(h.tokens.transportManager)
    );
    /* Owner-only: an operator role cannot carry it */
    const refused = await request("POST", `${AC}/operator-roles`, {
      as: h.tokens.transportManager,
      body: { module: "transport", name: "Log reader", permissions: ["transport.activity.read"] }
    });
    assert.equal(refused.status, 422);

    for (const module of [
      "users",
      "academics",
      "administration",
      "finance",
      "communication",
      "reports",
      "files",
      "hostel",
      "library",
      "hr",
      "transport",
      "inventory"
    ]) {
      assert.equal(await status("GET", `/api/v1/${module}/activity`, h.tokens.admin), 200, module);
    }
    const cases = [
      ["the module's built-in owner", h.tokens.transportManager, 200],
      ["an owner by assignment", world.transportOwner.token, 200],
      ["another module's owner", h.tokens.hostelManager, 403],
      ["an operator of the module", operatorToken, 403],
      ["office staff", h.tokens.office, 403],
      ["the principal", h.tokens.principal, 403],
      ["a student", h.tokens.student1, 403]
    ];
    for (const [who, token, expected] of cases) {
      assert.equal(await status("GET", `${T}/activity`, token), expected, who);
    }
    assert.equal(await status("GET", "/api/v1/hostel/activity", h.tokens.hostelManager), 200);
    assert.equal(await status("GET", "/api/v1/academics/activity", h.tokens.principal), 403);
    assert.equal(await status("GET", `/api/v1/transport/activity/${uuid()}`, h.tokens.office), 403);
  });
});
