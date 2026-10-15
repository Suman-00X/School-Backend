import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, request, get, settleJobs } from "../helpers/harness.js";

const A = "/api/v1/academics";
const U = "/api/v1/users";
const ME = "/api/v1/me";

describe("teacher record-level scope", () => {
  it("limits rosters and the student directory to the teacher's sections", async () => {
    const students = await get(`${U}/students`, { as: h.tokens.teacher });
    assert.deepEqual(students.data.map(s => s.id).sort(), [world.s1.id, world.s2.id].sort());
    await get(`${U}/students/${world.s3.id}`, { as: h.tokens.teacher }, 404);
    await get(`${A}/enrollments?sectionId=${world.s2A.id}`, { as: h.tokens.teacher }, 403);
    await get(`${A}/attendance/summary?sectionId=${world.s1A.id}`, { as: h.tokens.student1 }, 403);
  });
});

describe("portal (/me)", () => {
  it("returns the signed-in profile", async () => {
    const me = await get(ME, { as: h.tokens.student1 });
    assert.equal(me.data.role, "STUDENT");
    assert.equal(me.data.profile.id, world.s1.id);
    assert.equal(me.data.account.email, "student1@test.school");

    const staff = await get(ME, { as: h.tokens.principal });
    assert.match(staff.data.profile.employeeCode, /^STF/);
  });

  it("shows students only themselves and parents only their children", async () => {
    const self = await get(`${ME}/students`, { as: h.tokens.student1 });
    assert.deepEqual(
      self.data.map(s => s.id),
      [world.s1.id]
    );
    assert.equal(self.data[0].current.section, "Class 1-A");

    const children = await get(`${ME}/students`, { as: h.tokens.mother });
    assert.deepEqual(children.data.map(s => s.id).sort(), [world.s1.id, world.s2.id].sort());

    await get(`${ME}/students/${world.s2.id}/attendance`, { as: h.tokens.student1 }, 404);
    await get(`${ME}/students/${world.s3.id}/attendance`, { as: h.tokens.mother }, 404);
    await get(`${ME}/students`, { as: h.tokens.teacher }, 403);
  });

  it("shows attendance, timetable, calendar and published report cards", async () => {
    const attendance = await get(`${ME}/students/${world.s2.id}/attendance?from=2026-07-06&to=2026-07-11`, {
      as: h.tokens.mother
    });
    assert.equal(attendance.data.percentage, 10);

    const timetable = await get(`${ME}/students/${world.s1.id}/timetable`, { as: h.tokens.student1 });
    assert.equal(timetable.data.section.name, "Class 1-A");

    const calendar = await get(`${ME}/calendar?from=2026-07-01&to=2026-07-31`, { as: h.tokens.mother });
    assert.equal(calendar.meta.total, 2);

    const cards = await get(`${ME}/students/${world.s1.id}/report-cards`, { as: h.tokens.student1 });
    assert.equal(cards.data.reports.length, 1, "only the published Mid Term");
    assert.equal(cards.data.reports[0].exam.examName, "Mid Term");
  });

  it("gives teachers their timetable and sections", async () => {
    const timetable = await get(`${ME}/teaching/timetable`, { as: h.tokens.teacher });
    assert.equal(timetable.data.weeklyLessons, 2);
    const sections = await get(`${ME}/teaching/sections`, { as: h.tokens.teacher });
    assert.deepEqual(
      sections.data.map(s => [s.section, s.isClassTeacher]),
      [["Class 1-A", true]]
    );
  });
});

describe("CSV student import", () => {
  const upload = (csv, as = h.tokens.office) => {
    const form = new FormData();
    form.append("file", new Blob([csv], { type: "text/csv" }), "students.csv");
    return request("POST", "/api/v1/administration/imports/students", { as, form });
  };

  it("offers a template", async () => {
    const template = await request("GET", "/api/v1/administration/imports/students/template", { as: h.tokens.office });
    assert.equal(template.status, 200);
    assert.match(template.buffer.toString(), /^firstName,lastName,email/);
  });

  it("imports good rows and reports bad ones", async () => {
    const csv = [
      "First Name,Last Name,Email,Admission Number,Class Name,Section Name,Parent First Name,Parent Last Name,Parent Email,Parent Relation",
      "Ira,Shah,ira@test.school,ADM-100,Class 1,a,Neel,Shah,neel@test.school,father",
      "Kabir,Rao,kabir@test.school,ADM-101,Class 1,A,Meera,Rao,mother@test.school,MOTHER",
      "Bad,Email,not-an-email,ADM-102,Class 1,A,,,,",
      "No,Section,nosection@test.school,ADM-103,Class 9,Z,,,,",
      "Dup,Admission,dup@test.school,ADM-1,Class 1,A,,,,"
    ].join("\n");

    const accepted = await upload(csv);
    assert.equal(accepted.status, 202);
    assert.equal(accepted.body.message, "Import accepted: 5 row(s) queued");
    assert.match(accepted.headers.get("location"), /\/api\/v1\/administration\/imports\/[0-9a-f]{24}$/);

    await settleJobs();
    const job = await get(`/api/v1/administration/imports/${accepted.body.data.id}`, { as: h.tokens.office });
    assert.equal(job.data.status, "COMPLETED");
    assert.equal(job.data.succeeded, 2);
    assert.equal(job.data.failed, 3);
    assert.deepEqual(
      job.data.rowErrors.map(e => e.row),
      [4, 5, 6]
    );
    assert.match(job.data.rowErrors[0].message, /email must be a valid email/);
    assert.match(job.data.rowErrors[1].message, /No section Class 9-Z/);
    assert.match(job.data.rowErrors[2].message, /already exists/);

    /* Kabir joined his existing mother */
    const children = await get(`${ME}/students`, { as: h.tokens.mother });
    assert.equal(children.data.length, 3);

    const list = await get("/api/v1/administration/imports", { as: h.tokens.office });
    assert.equal(list.meta.total, 1);
    assert.equal(list.data[0].rowErrors, undefined);
  });

  it("rejects unreadable uploads up front", async () => {
    const missingColumns = await upload("name,age\nx,1\n");
    assert.equal(missingColumns.status, 422);
    assert.match(missingColumns.body.message, /missing required column/);

    const noFile = await request("POST", "/api/v1/administration/imports/students", {
      as: h.tokens.office,
      form: new FormData()
    });
    assert.equal(noFile.status, 400);

    const teacher = await upload("firstName\nx\n", h.tokens.teacher);
    assert.equal(teacher.status, 403);
  });
});
