import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, get, patch, post, request } from "../helpers/harness.js";

/* The onboarding portal: operators create schools with their first administrator and the
   modules the school uses; a school sees and uses only its switched-on modules */
describe("platform: onboarding schools with modules", () => {
  const state = {};
  const as = () => state.operatorToken;
  const lastEmailTo = address => h.modules.outbox.email.filter(m => m.to === address).at(-1);

  const onboarding = (overrides = {}) => ({
    school: {
      name: "Green Valley School",
      code: "gvs",
      address: "12 Lake Road, Pune",
      contactEmail: "office@gvs.school",
      contactPhone: "+91 20 1234 5678",
      timezone: "Asia/Kolkata",
      currency: "INR",
      country: "IN",
      ...overrides.school
    },
    admin: {
      firstName: "Asha",
      lastName: "Rao",
      email: "Principal@GVS.school",
      phone: "+91 98765 43210",
      ...overrides.admin
    },
    modules: overrides.modules ?? ["library", "finance"]
  });

  it("signs an operator in, and refuses a wrong password", async () => {
    const { operatorService } = await import("../../src/modules/platform/operators/index.js");
    await operatorService.create({ name: "Ops Person", email: "ops@platform.test", password: "Operator-Pass-1" });

    const wrong = await request("POST", "/api/v1/platform/auth/login", {
      as: null,
      body: { email: "ops@platform.test", password: "nope" }
    });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.message, "The email or password is incorrect");

    const session = await post(
      "/api/v1/platform/auth/login",
      { email: "OPS@platform.test", password: "Operator-Pass-1" },
      { as: null }
    );
    assert.equal(session.data.operator.email, "ops@platform.test");
    state.operatorToken = session.data.accessToken;
    const me = await get("/api/v1/platform/auth/me", { as: as() });
    assert.equal(me.data.name, "Ops Person");
  });

  it("keeps operator and school tokens apart", async () => {
    assert.equal((await request("GET", "/api/v1/platform/schools", { as: null })).status, 401);
    /* A school administrator's token opens nothing on the platform... */
    assert.equal((await request("GET", "/api/v1/platform/schools", { as: h.tokens.admin })).status, 401);
    /* ...and an operator's token opens nothing in a school */
    assert.equal((await request("GET", "/api/v1/academics/academic-years", { as: as() })).status, 401);
  });

  it("lists the modules a school can be given, core ones always on", async () => {
    const { data } = await get("/api/v1/platform/modules", { as: as() });
    const byKey = Object.fromEntries(data.map(m => [m.key, m]));
    assert.equal(byKey.academics.core, true);
    assert.equal(byKey.administration.core, true);
    for (const key of [
      "finance",
      "library",
      "transport",
      "hostel",
      "hr",
      "inventory",
      "communication",
      "reports",
      "files"
    ]) {
      assert.equal(byKey[key].core, false, key);
      assert.ok(byKey[key].description);
    }
  });

  it("checks whether a school code is free", async () => {
    assert.equal(
      (await get("/api/v1/platform/schools/code-availability?code=tst", { as: as() })).data.available,
      false
    );
    assert.equal((await get("/api/v1/platform/schools/code-availability?code=gvs", { as: as() })).data.available, true);
  });

  it("refuses unknown modules and missing school details", async () => {
    const unknown = await request("POST", "/api/v1/platform/schools", {
      as: as(),
      body: onboarding({ modules: ["teleport"] })
    });
    assert.equal(unknown.status, 400);
    const missing = await request("POST", "/api/v1/platform/schools", {
      as: as(),
      body: { ...onboarding(), school: { name: "No Details", code: "NOD" } }
    });
    assert.equal(missing.status, 400);
  });

  it("onboards a school: its databases, profile, modules and first administrator", async () => {
    const { data, message } = await post("/api/v1/platform/schools", onboarding(), { as: as() });
    const { school, invitation } = data;
    state.schoolId = school.id;
    assert.match(message, /Green Valley School is ready/);
    assert.equal(school.code, "GVS");
    assert.equal(school.status, "ACTIVE");
    assert.deepEqual(school.profile, {
      address: "12 Lake Road, Pune",
      contactEmail: "office@gvs.school",
      contactPhone: "+91 20 1234 5678",
      description: null,
      timezone: "Asia/Kolkata",
      currency: "INR",
      country: "IN"
    });
    /* Core modules always, plus the chosen ones in catalogue order */
    assert.deepEqual(school.modules, ["academics", "users", "administration", "portal", "finance", "library"]);
    assert.equal(school.moduleStates.find(m => m.key === "transport").enabled, false);

    assert.equal(school.admins.length, 1);
    assert.equal(school.admins[0].email, "principal@gvs.school");
    assert.equal(school.admins[0].invitationPending, true);

    /* Emailed, and returned for the operator to pass on */
    assert.equal(invitation.emailed, true);
    assert.match(invitation.link, /\/set-password\?token=.+&school=GVS$/);
    const mail = lastEmailTo("principal@gvs.school");
    assert.ok(mail.text.includes(invitation.link));
    state.inviteToken = decodeURIComponent(/token=([^&]+)/.exec(invitation.link)[1]);

    const { rows } = await h.platformPool.query("SELECT enabled_modules FROM platform_tenants WHERE code = 'GVS'");
    assert.deepEqual(rows[0].enabled_modules, ["finance", "library"]);

    const duplicate = await request("POST", "/api/v1/platform/schools", { as: as(), body: onboarding() });
    assert.equal(duplicate.status, 409);
  });

  it("lists and finds schools", async () => {
    const { data } = await get("/api/v1/platform/schools?search=green", { as: as() });
    assert.deepEqual(
      data.map(s => s.code),
      ["GVS"]
    );
    const all = await get("/api/v1/platform/schools", { as: as() });
    assert.ok(
      all.data.some(s => s.code === "TST" && s.modules.includes("transport")),
      "older schools have every module"
    );
    assert.ok(all.data.every(s => !("databaseUrl" in s) && !("databaseName" in s)));
  });

  it("lets the administrator in, with only the school's modules", async () => {
    await post(
      "/api/v1/auth/password-resets",
      { token: state.inviteToken, password: "Green-Valley-1" },
      { as: null },
      200
    );
    const session = await post(
      "/api/v1/auth/login",
      { email: "principal@gvs.school", password: "Green-Valley-1" },
      { as: null }
    );
    state.adminToken = session.data.accessToken;

    const access = await get("/api/v1/administration/access/me/access", { as: state.adminToken });
    assert.deepEqual(access.data.enabledModules, ["finance", "library"]);
    const shown = access.data.modules.map(m => m.module);
    for (const module of ["academics", "users", "administration", "finance", "library"])
      assert.ok(shown.includes(module), module);
    for (const module of ["transport", "hostel", "hr", "inventory", "communication", "reports", "files"]) {
      assert.ok(!shown.includes(module), module);
    }

    assert.equal((await request("GET", "/api/v1/library/books", { as: state.adminToken })).status, 200);
    const refused = await request("GET", "/api/v1/transport/vehicles", { as: state.adminToken });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.message, "This module is not switched on for your school");

    /* Role editors offer only the school's modules */
    const catalogue = await get("/api/v1/administration/access/permissions", { as: state.adminToken });
    assert.ok(!catalogue.data.some(m => m.module === "transport"));
  });

  it("switches modules on and off; the school follows at once", async () => {
    const res = await request("PUT", `/api/v1/platform/schools/${state.schoolId}/modules`, {
      as: as(),
      body: { modules: ["transport"] }
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data.modules, ["academics", "users", "administration", "portal", "transport"]);

    assert.equal((await request("GET", "/api/v1/transport/vehicles", { as: state.adminToken })).status, 200);
    assert.equal((await request("GET", "/api/v1/library/books", { as: state.adminToken })).status, 403);
    /* Fee pages elsewhere (reports) belong to finance too */
    assert.equal((await request("GET", "/api/v1/reports/dashboards/fees", { as: state.adminToken })).status, 403);
    const access = await get("/api/v1/administration/access/me/access", { as: state.adminToken });
    assert.deepEqual(access.data.enabledModules, ["transport"]);

    /* An older school (every module) is unaffected */
    assert.equal((await request("GET", "/api/v1/library/books", { as: h.tokens.admin })).status, 200);
  });

  it("does not invite an administrator who already has a password", async () => {
    const detail = await get(`/api/v1/platform/schools/${state.schoolId}`, { as: as() });
    const [admin] = detail.data.admins;
    assert.equal(admin.invitationPending, false);
    const again = await request("POST", `/api/v1/platform/schools/${state.schoolId}/admins/${admin.id}/invitations`, {
      as: as()
    });
    assert.equal(again.status, 422);
  });

  it("suspends a school and reactivates it", async () => {
    const suspended = await patch(
      `/api/v1/platform/schools/${state.schoolId}/status`,
      { status: "SUSPENDED" },
      { as: as() }
    );
    assert.equal(suspended.data.status, "SUSPENDED");
    assert.equal(suspended.data.profile, null);
    assert.equal((await request("GET", "/api/v1/academics/academic-years", { as: state.adminToken })).status, 403);

    const active = await patch(`/api/v1/platform/schools/${state.schoolId}/status`, { status: "ACTIVE" }, { as: as() });
    assert.equal(active.data.status, "ACTIVE");
    assert.equal((await request("GET", "/api/v1/academics/academic-years", { as: state.adminToken })).status, 200);
  });
});
