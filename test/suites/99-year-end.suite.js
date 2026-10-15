import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, request, get, post, patch } from "../helpers/harness.js";

const A = "/api/v1/academics";

/* Runs last: promotion closes this year's enrollments */
describe("year end", () => {
  it("promotes one student", async () => {
    const promo = {
      studentId: world.s1.id,
      fromAcademicYearId: world.y1.id,
      toAcademicYearId: world.y2.id,
      toSectionId: world.s2ANext.id
    };
    const promoted = await post(`${A}/enrollments/promotions`, promo);
    assert.equal(promoted.data.admissionType, "PROMOTED");
    await post(`${A}/enrollments/promotions`, promo, {}, 409);
    await post(`${A}/enrollments/promotions`, { ...promo, toAcademicYearId: world.y1.id }, {}, 400);
    await post(`${A}/enrollments/promotions`, promo, { as: h.tokens.accountant }, 403);
  });

  it("promotes a whole section with repeat and leave overrides", async () => {
    world.s1ANext = (
      await post(
        `${A}/sections`,
        { classId: world.c1.id, sectionName: "A" },
        { headers: { "x-academic-year-id": world.y2.id } }
      )
    ).data;

    const roster = (await get(`${A}/enrollments?sectionId=${world.s1A.id}&limit=100`)).data;
    const active = roster.filter(e => e.status === "ACTIVE" && e.studentId !== world.s1.id);
    const [repeater, leaver, ...rest] = active.map(e => e.studentId);

    const result = await post(`${A}/enrollments/promotions/bulk`, {
      fromSectionId: world.s1A.id,
      toAcademicYearId: world.y2.id,
      toSectionId: world.s2ANext.id,
      overrides: [
        { studentId: repeater, action: "REPEAT", toSectionId: world.s1ANext.id },
        { studentId: leaver, action: "LEAVE" }
      ]
    });
    assert.equal(result.data.promoted, rest.length);
    assert.equal(result.data.repeated, 1);
    assert.equal(result.data.left, 1);
    assert.match(result.message, /^Section promoted: /);

    const repeatRoster = await get(`${A}/enrollments?sectionId=${world.s1ANext.id}`, {
      headers: { "x-academic-year-id": world.y2.id }
    });
    assert.deepEqual(
      repeatRoster.data.map(e => [e.studentId, e.admissionType]),
      [[repeater, "REPEAT"]]
    );

    const again = await post(`${A}/enrollments/promotions/bulk`, {
      fromSectionId: world.s1A.id,
      toAcademicYearId: world.y2.id,
      toSectionId: world.s2ANext.id
    });
    assert.equal(again.data.promoted, 0, "nobody is still active in the old section");

    await post(
      `${A}/enrollments/promotions/bulk`,
      {
        fromSectionId: world.s1A.id,
        toAcademicYearId: world.y2.id,
        toSectionId: world.s2ANext.id,
        overrides: [{ studentId: repeater, action: "REPEAT" }]
      },
      {},
      400
    );
  });

  it("switches the current academic year", async () => {
    await patch(`${A}/academic-years/${world.y2.id}`, { isCurrent: true });
    assert.equal((await get(`${A}/academic-years/current`)).data.id, world.y2.id);
    const current = await h.pool.query("SELECT count(*) FROM academic_years WHERE is_current AND tenant_id = $1", [
      h.tenant.id
    ]);
    assert.equal(Number(current.rows[0].count), 1);
  });

  it("recorded every write in the audit trail", async () => {
    await request("DELETE", `/api/v1/users/${world.accountant.userId}`);
    await new Promise(resolve => setTimeout(resolve, 300));
    const { AuditLog } = h.modules;

    const admission = await AuditLog.findOne({ permission: "users.students.admit" }).lean();
    assert.equal(admission.entityId, world.s1.id);
    assert.equal(admission.statusCode, 201);

    const unlink = await AuditLog.findOne({ permission: "users.students.manageParents", method: "DELETE" }).lean();
    assert.equal(unlink.entityId, world.motherId);

    assert.equal(await AuditLog.countDocuments({ method: "GET" }), 0);
    assert.ok((await AuditLog.countDocuments({ tenantId: h.tenant.id })) > 40);
  });
});
