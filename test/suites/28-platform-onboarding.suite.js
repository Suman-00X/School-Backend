import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, get, post, request } from "../helpers/harness.js";

/* The admin console: system admins (who own the platform) onboard schools with their first
   administrator, the number of students and the modules the school uses; a school sees and
   uses only its switched-on modules */
describe("platform: the admin console onboards schools with modules", () => {
  const state = {};
  const lastEmailTo = address => h.modules.outbox.email.filter(m => m.to === address).at(-1);

  /* A browser call: the session cookie, and the header every change must carry */
  const consoleCall = (method, url, { body, cookie = state.cookie, xhr = true } = {}) =>
    request(method, `/api/v1/platform${url}`, {
      as: null,
      body,
      headers: { ...(cookie && { cookie }), ...(xhr && { "x-requested-with": "XMLHttpRequest" }) }
    });
  const ok = async (method, url, options, status = 200) => {
    const res = await consoleCall(method, url, options);
    assert.equal(res.status, status, `${method} ${url} -> ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body;
  };

  const onboarding = (overrides = {}) => ({
    school: {
      name: "Green Valley School",
      code: "gvs",
      studentCount: 850,
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

  it("signs a system admin in with an httpOnly session cookie, never a token in the answer", async () => {
    const { systemAdminService } = await import("../../src/modules/platform/system-admins/index.js");
    await systemAdminService.create({
      name: "Platform Owner",
      email: "owner@platform.test",
      password: "Owner-Pass-12"
    });

    const wrong = await consoleCall("POST", "/auth/login", {
      body: { email: "owner@platform.test", password: "nope" }
    });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.message, "The email or password is incorrect");

    /* Another site cannot sign a browser in: the XHR header is required */
    const forged = await consoleCall("POST", "/auth/login", {
      xhr: false,
      body: { email: "owner@platform.test", password: "Owner-Pass-12" }
    });
    assert.equal(forged.status, 403);

    const res = await consoleCall("POST", "/auth/login", {
      body: { email: "OWNER@platform.test", password: "Owner-Pass-12" }
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.systemAdmin.email, "owner@platform.test");
    assert.ok(!JSON.stringify(res.body).includes("eyJ"), "no token in the body");
    const setCookie = res.headers.get("set-cookie");
    assert.match(setCookie, /^system_admin_session=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.match(setCookie, /Path=\/api\/v1\/platform/);
    state.cookie = setCookie.split(";")[0];

    const me = await ok("GET", "/auth/me");
    assert.equal(me.data.name, "Platform Owner");
  });

  it("keeps system admin sessions and school tokens apart", async () => {
    assert.equal((await consoleCall("GET", "/schools", { cookie: null })).status, 401);
    /* A school administrator's token opens nothing on the platform... */
    assert.equal((await request("GET", "/api/v1/platform/schools", { as: h.tokens.admin })).status, 401);
    /* ...and the console cookie opens nothing in a school */
    const school = await request("GET", "/api/v1/academics/academic-years", {
      as: null,
      headers: { cookie: state.cookie }
    });
    assert.equal(school.status, 401);
    /* A change without the XHR header is refused even with the cookie */
    assert.equal((await consoleCall("POST", "/schools", { xhr: false, body: onboarding() })).status, 403);
  });

  it("lists the modules a school can be given, core ones always on", async () => {
    const { data } = await ok("GET", "/modules");
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
    assert.equal((await ok("GET", "/schools/code-availability?code=tst")).data.available, false);
    assert.equal((await ok("GET", "/schools/code-availability?code=gvs")).data.available, true);
  });

  it("refuses unknown modules, a missing student count and missing school details", async () => {
    assert.equal((await consoleCall("POST", "/schools", { body: onboarding({ modules: ["teleport"] }) })).status, 400);
    const noCount = onboarding();
    delete noCount.school.studentCount;
    const missingCount = await consoleCall("POST", "/schools", { body: noCount });
    assert.equal(missingCount.status, 400);
    assert.ok(missingCount.body.error.details.some(d => d.field === "school.studentCount"));
    const missing = await consoleCall("POST", "/schools", {
      body: { ...onboarding(), school: { name: "No Details", code: "NOD", studentCount: 10 } }
    });
    assert.equal(missing.status, 400);
  });

  it("onboards a school: its databases, profile, students, modules and first administrator", async () => {
    const { data, message } = await ok("POST", "/schools", { body: onboarding() }, 201);
    const { school, invitation } = data;
    state.schoolId = school.id;
    assert.match(message, /Green Valley School is ready/);
    assert.equal(school.code, "GVS");
    assert.equal(school.status, "ACTIVE");
    assert.equal(school.studentCount, 850);
    assert.equal(school.enrolledStudents, 0);
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

    /* Emailed, and returned for the system admin to pass on */
    assert.equal(invitation.emailed, true);
    assert.match(invitation.link, /\/set-password\?token=.+&school=GVS$/);
    assert.ok(lastEmailTo("principal@gvs.school").text.includes(invitation.link));
    state.inviteToken = decodeURIComponent(/token=([^&]+)/.exec(invitation.link)[1]);

    const { rows } = await h.platformPool.query(
      "SELECT enabled_modules, student_count FROM platform_tenants WHERE code = 'GVS'"
    );
    assert.deepEqual(rows[0], { enabled_modules: ["finance", "library"], student_count: 850 });

    assert.equal((await consoleCall("POST", "/schools", { body: onboarding() })).status, 409);
  });

  it("lists tenants with search, status and module filters, sorting and pages", async () => {
    await ok(
      "POST",
      "/schools",
      {
        body: onboarding({
          school: { name: "Hill Top Academy", code: "HTA", studentCount: 1200, contactEmail: "office@hta.school" },
          admin: { email: "head@hta.school" },
          modules: ["transport"]
        })
      },
      201
    );

    const search = await ok("GET", "/schools?search=green");
    assert.deepEqual(
      search.data.map(s => s.code),
      ["GVS"]
    );
    assert.equal(search.meta.total, 1);

    /* Older schools (every module) count as having the module */
    const withLibrary = await ok("GET", "/schools?module=library&sort=name&limit=100");
    assert.deepEqual(
      withLibrary.data.map(s => s.code),
      ["GVS", "OTH", "TST"]
    );
    const withTransport = await ok("GET", "/schools?module=transport&sort=name&limit=100");
    assert.deepEqual(
      withTransport.data.map(s => s.code),
      ["HTA", "OTH", "TST"]
    );

    const byStudents = await ok("GET", "/schools?sort=students&limit=2");
    assert.deepEqual(
      byStudents.data.map(s => [s.code, s.studentCount]),
      [
        ["HTA", 1200],
        ["GVS", 850]
      ]
    );
    assert.equal(byStudents.meta.total, 4);
    assert.equal(byStudents.meta.totalPages, 2);
    assert.deepEqual(byStudents.meta.statusCounts, { ACTIVE: 4, SUSPENDED: 0 });
    const page2 = await ok("GET", "/schools?sort=students&limit=2&page=2");
    assert.deepEqual(
      page2.data.map(s => s.studentCount),
      [null, null]
    );

    assert.ok(byStudents.data.every(s => !("databaseUrl" in s) && !("databaseName" in s)));
    assert.equal((await consoleCall("GET", "/schools?sort=size")).status, 400);
  });

  it("changes the number of students a school is charged for", async () => {
    const { data } = await ok("PATCH", `/schools/${state.schoolId}`, { body: { studentCount: 900 } });
    assert.equal(data.studentCount, 900);
    assert.equal((await consoleCall("PATCH", `/schools/${state.schoolId}`, { body: { studentCount: 0 } })).status, 400);
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
    for (const module of ["academics", "users", "administration", "finance", "library"]) {
      assert.ok(shown.includes(module), module);
    }
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
    const { data } = await ok("PUT", `/schools/${state.schoolId}/modules`, { body: { modules: ["transport"] } });
    assert.deepEqual(data.modules, ["academics", "users", "administration", "portal", "transport"]);

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
    const detail = await ok("GET", `/schools/${state.schoolId}`);
    const [admin] = detail.data.admins;
    assert.equal(admin.invitationPending, false);
    assert.equal((await consoleCall("POST", `/schools/${state.schoolId}/admins/${admin.id}/invitations`)).status, 422);
  });

  it("suspends a school and reactivates it", async () => {
    const suspended = await ok("PATCH", `/schools/${state.schoolId}/status`, { body: { status: "SUSPENDED" } });
    assert.equal(suspended.data.status, "SUSPENDED");
    assert.equal(suspended.data.profile, null);
    assert.equal((await request("GET", "/api/v1/academics/academic-years", { as: state.adminToken })).status, 403);
    assert.deepEqual(
      (await ok("GET", "/schools?status=SUSPENDED")).data.map(s => s.code),
      ["GVS"]
    );

    const active = await ok("PATCH", `/schools/${state.schoolId}/status`, { body: { status: "ACTIVE" } });
    assert.equal(active.data.status, "ACTIVE");
    assert.equal((await request("GET", "/api/v1/academics/academic-years", { as: state.adminToken })).status, 200);
  });

  it("signing out ends the session, even for a copy of the cookie", async () => {
    const res = await consoleCall("POST", "/auth/logout");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("set-cookie"), /system_admin_session=;/);
    /* The old cookie value no longer works */
    assert.equal((await consoleCall("GET", "/auth/me")).status, 401);
  });

  it("sends a browser on the API host to the console in the web app", async () => {
    const res = await fetch(`${h.base}/adminConsole`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.match(res.headers.get("location"), /\/adminConsole$/);
  });
});
