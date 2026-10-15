import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, request, get, post, patch, person, tokenFor } from "../helpers/harness.js";

const U = "/api/v1/users";

describe("users: staff, teachers, accounts", () => {
  it("creates privileged staff with generated codes", async () => {
    const principal = await post(`${U}/staff`, {
      role: "PRINCIPAL",
      user: person("principal"),
      profile: { designation: "Principal", joiningDate: "2020-04-01" }
    });
    assert.match(principal.data.employeeCode, /^STF20-0{5}1$/);
    assert.equal(principal.data.user.role, "PRINCIPAL");
    assert.ok(!("passwordHash" in principal.data.user));
    world.principal = principal.data;

    world.accountant = (await post(`${U}/staff`, { role: "ACCOUNTANT", user: person("accountant") })).data;
    world.office = (await post(`${U}/staff`, { role: "STAFF", user: person("office") })).data;

    h.tokens.principal = tokenFor(world.principal.userId, "PRINCIPAL");
    h.tokens.accountant = tokenFor(world.accountant.userId, "ACCOUNTANT");
    h.tokens.office = tokenFor(world.office.userId, "STAFF");
  });

  it("only allows privileged roles on staff accounts", async () => {
    await post(`${U}/staff`, { role: "TEACHER", user: person("x") }, {}, 400);
    const forbidden = await request("POST", `${U}/staff`, {
      as: h.tokens.principal,
      body: { role: "STAFF", user: person("y") }
    });
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.message, "You do not have permission to perform this action");

    const byRole = await get(`${U}/staff?role=PRINCIPAL`);
    assert.equal(byRole.meta.total, 1);
  });

  it("creates teachers", async () => {
    const teacher = await post(`${U}/teachers`, {
      user: person("teacher"),
      profile: { joiningDate: "2024-06-01", experienceYears: 5 }
    });
    assert.match(teacher.data.employeeCode, /^TCHR24-0{5}1$/);
    world.teacher = teacher.data;
    h.tokens.teacher = tokenFor(world.teacher.userId, "TEACHER");

    world.teacher2 = (await post(`${U}/teachers`, { user: person("teacher2") })).data;
    h.tokens.teacher2 = tokenFor(world.teacher2.userId, "TEACHER");
  });

  it("manages accounts without exposing secrets or privileged fields", async () => {
    const teachers = await get(`${U}?role=TEACHER`);
    assert.equal(teachers.meta.total, 2);
    assert.ok(teachers.data.every(user => !("passwordHash" in user)));

    const updated = await patch(`${U}/${world.teacher.userId}`, {
      phone: "+91 98765 43210",
      tenantId: h.otherTenant.id,
      role: "ADMIN"
    });
    assert.equal(updated.data.role, "TEACHER");
    assert.equal(updated.data.tenantId, h.tenant.id);
    assert.equal(updated.data.phone, "+91 98765 43210");

    const self = await request("DELETE", `${U}/${h.admin.id}`);
    assert.equal(self.status, 422);
    assert.equal(self.body.error.code, "UNPROCESSABLE_ENTITY");

    const teacherListing = await request("GET", U, { as: h.tokens.teacher });
    assert.equal(teacherListing.status, 403);
  });

  it("rejects bad input with field-level details", async () => {
    const res = await request("POST", `${U}/teachers`, { body: { user: { firstName: "", email: "nope" } } });
    assert.equal(res.status, 400);
    const fields = res.body.error.details.map(d => `${d.field} ${d.message}`);
    assert.ok(fields.includes("user.firstName must not be empty"));
    assert.ok(fields.includes("user.email must be a valid email"));
    assert.ok(fields.includes("user.lastName is required"));
  });
});
