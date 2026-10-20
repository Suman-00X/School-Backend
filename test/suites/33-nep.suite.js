import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, request, get, patch } from "../helpers/harness.js";

/* NEP 2020 options a school opts into (academics/nep-policy): the Holistic Progress Card
   (academics/holistic-progress) and the UDISE+ / APAAR student files
   (reports/government-exports). Uses Class 1-A (Foundational stage) and the Mid Term.
   Leaves everything switched on for the API matrix. */

const A = "/api/v1/academics";
const U = "/api/v1/users";
const POLICY = `${A}/nep-policy`;
const GOV = "/api/v1/reports/government-exports";

const t = {};
const inYear = () => ({ headers: { "x-academic-year-id": world.exam.academicYearId } });
const card = (studentId = world.s1.id) => `${A}/holistic-progress/exams/${world.exam.id}/students/${studentId}`;
const sheet = () => `${A}/holistic-progress/exams/${world.exam.id}/sections/${world.s1A.id}`;

describe("NEP policy", () => {
  it("starts with everything off; teachers can read it, only management changes it", async () => {
    const policy = (await get(POLICY)).data;
    assert.equal(policy.holisticProgressCard, false);
    assert.equal(policy.udiseExport, false);
    assert.equal(policy.apaarExport, false);
    assert.deepEqual(policy.hpcStages, ["FOUNDATIONAL", "PREPARATORY", "MIDDLE"]);
    assert.equal(policy.stages.length, 4);

    assert.equal((await request("GET", POLICY, { as: h.tokens.teacher })).status, 200);
    const byTeacher = await request("PATCH", POLICY, { as: h.tokens.teacher, body: { holisticProgressCard: true } });
    assert.equal(byTeacher.status, 403);
  });

  it("keeps the features closed while off (409, after 404s)", async () => {
    const off = await request("GET", card());
    assert.equal(off.status, 409);
    assert.match(off.body.message, /not opted for the Holistic Progress Card/);
    assert.equal((await request("GET", `${GOV}/udise`, inYear())).status, 409);
    assert.equal((await request("GET", `${GOV}/apaar`, inYear())).status, 409);
    /* An unknown student is still 404 */
    const unknown = await request("GET", card("7d0e5f3c-3b1a-4c2e-9f4d-2a6b8c1d0e9f"));
    assert.equal(unknown.status, 404);
  });

  it("needs a UDISE code for the UDISE+ export and a stage for the card", async () => {
    const noCode = await request("PATCH", POLICY, { body: { udiseExport: true } });
    assert.equal(noCode.status, 422);
    assert.match(noCode.body.message, /11-digit UDISE code/);
    const badCode = await request("PATCH", POLICY, { body: { udiseCode: "12345" } });
    assert.equal(badCode.status, 400);
    const noStage = await request("PATCH", POLICY, { body: { holisticProgressCard: true, hpcStages: [] } });
    assert.equal(noStage.status, 422);
  });

  it("opts in, by the principal", async () => {
    const res = await patch(
      POLICY,
      { holisticProgressCard: true, hpcStages: ["MIDDLE", "PREPARATORY"], udiseExport: true, apaarExport: true, udiseCode: "09123456789" },
      { as: h.tokens.principal }
    );
    /* Stored in school order */
    assert.deepEqual(res.data.hpcStages, ["PREPARATORY", "MIDDLE"]);
    assert.equal(res.data.udiseCode, "09123456789");
    /* The code can't be cleared while the export needs it */
    assert.equal((await request("PATCH", POLICY, { body: { udiseCode: null } })).status, 422);
  });
});

describe("Holistic Progress Card", () => {
  it("is refused for a class whose stage the policy leaves out", async () => {
    const res = await request("GET", card());
    assert.equal(res.status, 409);
    assert.match(res.body.message, /not used for Class 1: the NEP policy has it for Preparatory, Middle/);
    await patch(POLICY, { hpcStages: ["FOUNDATIONAL", "PREPARATORY", "MIDDLE"] });
  });

  it("lists the section with the exam's subjects and the Foundational levels", async () => {
    const res = (await get(sheet())).data;
    assert.equal(res.stage.stage, "FOUNDATIONAL");
    assert.deepEqual(
      res.stage.levels.map(l => l.label),
      ["Stream", "Mountain", "Sky"]
    );
    const subjectIds = res.subjects.map(s => s.id);
    assert.ok(subjectIds.includes(world.math.id) && subjectIds.includes(world.english.id));
    assert.ok(res.students.some(s => s.studentId === world.s1.id));
    assert.equal(res.summary.complete, 0);
    t.subjects = res.subjects;
  });

  it("saves a student's card and shows it beside the result and attendance", async () => {
    const body = {
      subjects: [
        { subjectId: world.math.id, awareness: "PROFICIENT", sensitivity: "BEGINNER", creativity: "ADVANCED", selfAssessment: "PROFICIENT", peerAssessment: "PROFICIENT", remark: "Counts confidently to 100" },
        ...t.subjects
          .filter(s => s.id !== world.math.id)
          .map(s => ({ subjectId: s.id, awareness: "BEGINNER", sensitivity: "BEGINNER", creativity: "BEGINNER" }))
      ],
      interests: "Drawing and football",
      strengths: "Curious, helps classmates",
      areasToImprove: "Reading aloud",
      teacherRemark: "A cheerful term",
      parentFeedback: "Reads at home every night"
    };
    const saved = (await request("PUT", card(), { body })).body.data;
    const math = saved.subjects.find(s => s.subject.id === world.math.id);
    assert.equal(math.entry.creativity, "ADVANCED");
    assert.equal(math.entry.remark, "Counts confidently to 100");
    assert.equal(saved.interests, "Drawing and football");
    assert.equal(saved.school.udiseCode, "09123456789");
    assert.ok(saved.attendance && typeof saved.attendance.workingDays === "number");
    assert.ok("academic" in saved);

    const list = (await get(sheet())).data;
    const row = list.students.find(s => s.studentId === world.s1.id);
    assert.equal(row.complete, true);
    assert.equal(list.summary.complete, 1);

    /* PUT replaces: a second save without reflections clears them */
    const again = (await request("PUT", card(), { body: { subjects: body.subjects } })).body.data;
    assert.equal(again.parentFeedback, null);
    await request("PUT", card(), { body });
  });

  it("rejects subjects the section doesn't sit, repeats and unknown levels", async () => {
    const other = await request("PUT", card(), {
      body: { subjects: [{ subjectId: "7d0e5f3c-3b1a-4c2e-9f4d-2a6b8c1d0e9f", awareness: "BEGINNER" }] }
    });
    assert.equal(other.status, 422);
    const twice = await request("PUT", card(), {
      body: { subjects: [{ subjectId: world.math.id }, { subjectId: world.math.id }] }
    });
    assert.equal(twice.status, 400);
    const level = await request("PUT", card(), { body: { subjects: [{ subjectId: world.math.id, awareness: "EXPERT" }] } });
    assert.equal(level.status, 400);
  });

  it("prints a PDF", async () => {
    const res = await request("GET", `${card()}/pdf`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/pdf");
    assert.equal(res.buffer.subarray(0, 4).toString(), "%PDF");
  });

  it("is for the section's class teacher among teachers; office staff read only", async () => {
    const section = (await get(`${A}/sections/${world.s1A.id}`)).data;
    if (section.classTeacherId !== world.teacher2.id)
      assert.equal((await request("GET", card(), { as: h.tokens.teacher2 })).status, 403);
    if (section.classTeacherId === world.teacher.id)
      assert.equal((await request("GET", card(), { as: h.tokens.teacher })).status, 200);
    assert.equal((await request("GET", card(), { as: h.tokens.office })).status, 200);
    const write = await request("PUT", card(), { as: h.tokens.office, body: { subjects: [] } });
    assert.equal(write.status, 403);
  });
});

describe("UDISE+ and APAAR files", () => {
  it("takes PEN, APAAR id and consent on the student profile (unique per school)", async () => {
    const bad = await request("PATCH", `${U}/students/${world.s1.id}`, { body: { pen: "12" } });
    assert.equal(bad.status, 400);
    const res = await patch(`${U}/students/${world.s1.id}`, {
      pen: "20240000001",
      apaarId: "123456789012",
      apaarConsentOn: "2026-07-01",
      motherTongue: "Hindi"
    });
    assert.equal(res.data.apaarId, "123456789012");
    const taken = await request("PATCH", `${U}/students/${world.s2.id}`, { body: { pen: "20240000001" } });
    assert.equal(taken.status, 409);
    await patch(`${U}/students/${world.s2.id}`, { pen: "20240000002", apaarConsentOn: "2026-07-02" });
    /* null clears */
    assert.equal((await patch(`${U}/students/${world.s2.id}`, { pen: null })).data.pen, null);
  });

  it("reports readiness", async () => {
    const res = (await get(`${GOV}/readiness?sectionId=${world.s1A.id}`, inYear())).data;
    assert.ok(res.students >= 2);
    assert.equal(res.udiseCode, "09123456789");
    assert.ok(res.apaar.generated >= 1);
    assert.ok(res.apaar.consentGiven >= 1);
    assert.ok(res.missing.some(m => m.key === "pen"));
    assert.ok(Array.isArray(res.gaps));
  });

  it("downloads the UDISE+ file with the exam's result, and the APAAR pending list", async () => {
    const udise = await request("GET", `${GOV}/udise?format=csv&sectionId=${world.s1A.id}&examId=${world.exam.id}`, inYear());
    assert.equal(udise.status, 200, udise.buffer.toString().slice(0, 300));
    const csv = udise.buffer.toString();
    /* The DCF 2025-26 layout: field numbers as headers, codes as values */
    assert.match(csv, /^\uFEFFAcademic Year,UDISE Code of School,Grade\/Class,Section,Section Roll No\.,Student National Code \(PEN\),4\.1\.1 Name of the Student/);
    assert.match(csv, /4\.5\.1 \(a\) Result/);
    assert.match(csv, /4\.5\.2 No\. of Days Child Attended School/);
    assert.match(csv, /09123456789/);
    assert.match(csv, /20240000001/);
    /* Mother tongue "Hindi" -> language code 04; what is missing in the last column */
    assert.match(csv, /,04,/);
    assert.match(csv, /4\.1\.3 Date of Birth \(DD\/MM\/YYYY\)/);
    assert.match(csv, /Date of birth missing/);

    const xlsx = await request("GET", `${GOV}/udise?sectionId=${world.s1A.id}`, inYear());
    assert.equal(xlsx.status, 200);
    assert.equal(xlsx.buffer.subarray(0, 2).toString(), "PK");

    const pending = (await request("GET", `${GOV}/apaar?format=csv&pending=true&sectionId=${world.s1A.id}`, inYear())).buffer.toString();
    assert.doesNotMatch(pending, /123456789012/);
    assert.match(pending, /Consent given, id pending|Consent pending/);
    /* The APAAR portal's mandatory fields, in its order */
    assert.match(pending, /PEN \(UDISE\+ Student ID\),Student Name \(as in UDISE\+\),Date of Birth \(DD\/MM\/YYYY\),Gender,Mobile Number,Mother's Name,Father's Name,Name as per Aadhaar,Aadhaar Number/);
    const all = (await request("GET", `${GOV}/apaar?format=csv&sectionId=${world.s1A.id}`, inYear())).buffer.toString();
    assert.match(all, /APAAR id generated/);
  });

  it("is for the school office, not teachers", async () => {
    assert.equal((await request("GET", `${GOV}/readiness`, { as: h.tokens.teacher, ...inYear() })).status, 403);
    assert.equal((await request("GET", `${GOV}/readiness`, { as: h.tokens.office, ...inYear() })).status, 200);
  });
});
