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

describe("year archiving", () => {
  const inYear = id => ({ headers: { "x-academic-year-id": id } });

  it("archives only finished, non-current years", async () => {
    world.y0 = (
      await post(`${A}/academic-years`, { yearName: "2025-26", startDate: "2025-06-01", endDate: "2026-03-31" })
    ).data;
    world.s1APrev = (await post(`${A}/sections`, { classId: world.c1.id, sectionName: "A" }, inYear(world.y0.id))).data;

    const current = await request("POST", `${A}/academic-years/${world.y2.id}/archival`);
    assert.equal(current.status, 422);
    assert.match(current.body.message, /is the current year/);
    const unfinished = await request("POST", `${A}/academic-years/${world.y1.id}/archival`);
    assert.equal(unfinished.status, 422);
    assert.equal(unfinished.body.message, "2026-27 ends on 2027-03-31. Archive it after it has ended.");
    await post(`${A}/academic-years/${world.y0.id}/archival`, {}, { as: h.tokens.principal }, 403);

    const archived = await post(`${A}/academic-years/${world.y0.id}/archival`, {}, {}, 200);
    assert.equal(archived.message, "Academic year 2025-26 archived. Its records are now read-only.");
    assert.ok(archived.data.archivedAt);
    await post(`${A}/academic-years/${world.y0.id}/archival`, {}, {}, 409);
  });

  it("makes every academic record of an archived year read-only", async () => {
    const viaHeader = await request("POST", `${A}/sections`, {
      body: { classId: world.c2.id, sectionName: "A" },
      ...inYear(world.y0.id)
    });
    assert.equal(viaHeader.status, 409);
    assert.equal(viaHeader.body.message, "Academic year 2025-26 is archived and read-only");

    /* Paths without the header are stopped by the database trigger */
    const viaId = await request("PATCH", `${A}/sections/${world.s1APrev.id}`, { body: { capacity: 30 } });
    assert.equal(viaId.status, 409);
    assert.equal(viaId.body.message, "Academic year 2025-26 is archived and read-only");
    assert.equal(viaId.body.error.code, "CONFLICT");

    const year = await request("PATCH", `${A}/academic-years/${world.y0.id}`, { body: { description: "x" } });
    assert.equal(year.status, 409);
    assert.match(year.body.message, /Restore it first/);
    const makeCurrent = await request("PATCH", `${A}/academic-years/${world.y0.id}`, { body: { isCurrent: true } });
    assert.equal(makeCurrent.status, 409);
    assert.equal((await get(`${A}/academic-years/current`)).data.id, world.y2.id, "rolled back");

    const sections = await get(`${A}/sections`, inYear(world.y0.id));
    assert.equal(sections.meta.total, 1, "reads still work");
  });

  it("restores an archived year", async () => {
    const restored = await request("DELETE", `${A}/academic-years/${world.y0.id}/archival`);
    assert.equal(restored.status, 200);
    assert.equal(restored.body.message, "Academic year 2025-26 restored and editable again");
    assert.equal(restored.body.data.archivedAt, null);
    await patch(`${A}/sections/${world.s1APrev.id}`, { capacity: 30 });
    await request("DELETE", `${A}/academic-years/${world.y0.id}/archival`).then(r => assert.equal(r.status, 409));
  });
});

describe("operations", () => {
  it("exposes Prometheus metrics by route template, behind a token", async () => {
    assert.equal((await request("GET", "/metrics", { as: null })).status, 404);
    assert.equal(
      (await request("GET", "/metrics", { as: null, headers: { authorization: "Bearer wrong" } })).status,
      404
    );

    const res = await request("GET", "/metrics", { as: null, headers: { authorization: "Bearer test-metrics-token" } });
    assert.equal(res.status, 200);
    const text = res.buffer.toString();
    assert.match(text, /# TYPE school_http_requests_total counter/);
    assert.match(
      text,
      /school_http_requests_total\{method="POST",route="\/api\/v1\/academics\/sections",status="201"\} \d+/
    );
    assert.match(
      text,
      /school_http_request_duration_seconds_bucket\{method="GET",route="\/api\/v1\/academics\/academic-years\/:academicYearId",le="0\.1"\} \d+/
    );
    assert.match(text, /school_jobs_total\{job="communication\.deliver",outcome="completed"\} \d+/);
    assert.match(text, /school_pg_pool_connections\{state="total"\} \d+/);
    assert.doesNotMatch(text, /route="\/api\/v1\/academics\/sections\/[0-9a-f]{8}-/, "never raw ids");
  });
});
