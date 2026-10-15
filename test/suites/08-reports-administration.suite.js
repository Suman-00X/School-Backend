import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, request, get, patch } from "../helpers/harness.js";

const R = "/api/v1/reports";
const ADM = "/api/v1/administration";

const download = async (url, as = h.tokens.admin) => {
  const res = await request("GET", url, { as });
  assert.equal(res.status, 200, `${url} -> ${res.status} ${res.buffer.toString().slice(0, 300)}`);
  return res;
};

describe("reports: dashboards", () => {
  it("summarises the school on one screen", async () => {
    const { data } = await get(`${R}/dashboards/overview`);
    assert.equal(data.headcounts.students, 5);
    assert.equal(data.headcounts.teachers, 2);
    assert.equal(data.headcounts.staff, 3);
    assert.equal(data.headcounts.sections, 2);
    assert.equal(data.fees.collectedThisYear, 9400);
    assert.ok(data.fees.outstanding > 0);
    assert.ok(data.fees.overdueInvoices >= 2);
    assert.equal(data.currency, "INR");

    await get(`${R}/dashboards/overview`, { as: h.tokens.teacher }, 403);
    await get(`${R}/dashboards/overview`, { as: h.tokens.accountant });
    await get(`${R}/dashboards/attendance`, { as: h.tokens.accountant }, 403);
  });

  it("analyses attendance by section, by day and by student", async () => {
    const { data } = await get(`${R}/dashboards/attendance?from=2026-07-06&to=2026-07-11&threshold=75&minDays=1`);
    const oneA = data.bySection.find(s => s.sectionId === world.s1A.id);
    /* P + L + A + H over 4 marks = 2.5 / 4 */
    assert.equal(oneA.percentage, 62.5);
    assert.deepEqual(
      data.trend.map(d => [d.date, d.percentage]),
      [
        ["2026-07-06", 50],
        ["2026-07-07", 75]
      ]
    );
    assert.deepEqual(
      data.lowAttendance.map(s => [s.studentId, s.percentage]),
      [[world.s2.id, 25]]
    );
  });

  it("analyses fee collection and lists defaulters", async () => {
    const { data } = await get(`${R}/dashboards/fees?from=2026-01-01&to=2027-12-31`, { as: h.tokens.accountant });
    const byMethod = Object.fromEntries(data.collections.byMethod.map(m => [m.method, m.amount]));
    assert.deepEqual(byMethod, { ONLINE: 8400, CASH: 1000 });
    assert.equal(data.byClass.find(c => c.className === "Class 1").collected, 9400);
    assert.equal(data.defaulters.length, 2);
    assert.ok(data.defaulters.every(d => d.overdue > 0 && d.oldestDueDate === "2026-07-15"));
  });

  it("analyses an exam across sections", async () => {
    const { data } = await get(`${R}/dashboards/academics?examId=${world.exam.id}`);
    assert.equal(data.overall.passPercentage, 50);
    assert.equal(data.toppers[0].studentId, world.s1.id);
    assert.equal(data.toppers[0].percentage, 90);
    assert.ok(data.bySubject.some(s => s.subject.subjectCode === "MA01" && s.averageMarks === 90));
  });
});

describe("reports: exports", () => {
  it("exports the student roster as Excel and CSV", async () => {
    const xlsx = await download(`${R}/exports/students`);
    assert.equal(xlsx.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    assert.equal(xlsx.buffer.subarray(0, 2).toString(), "PK");
    assert.match(xlsx.headers.get("content-disposition"), /students-2026-27\.xlsx/);

    const csv = (await download(`${R}/exports/students?format=csv`)).buffer.toString();
    const lines = csv.trim().split("\r\n");
    assert.ok(csv.startsWith("\uFEFF"), "BOM so Excel reads UTF-8");
    assert.match(lines[0], /^Class,Section,Roll no\.,Student code/);
    assert.equal(lines.length, 6, "header + 5 students");
    assert.ok(lines.some(l => l.includes("Fmother Lmother")));
  });

  it("exports an attendance register grid", async () => {
    const csv = (
      await download(`${R}/exports/attendance?format=csv&sectionId=${world.s1A.id}&from=2026-07-06&to=2026-07-08`)
    ).buffer.toString();
    const [header, ...rows] = csv.trim().split("\r\n");
    assert.match(header, /Roll no\.,Student,07-06,07-07,07-08$/);
    assert.ok(rows.some(r => /Fstudent1 Lstudent1,P,L,$/.test(r)));
    const tooLong = await request(
      "GET",
      `${R}/exports/attendance?sectionId=${world.s1A.id}&from=2026-06-01&to=2026-09-30`
    );
    assert.equal(tooLong.status, 422);
  });

  it("exports fees and results", async () => {
    const collections = (
      await download(`${R}/exports/fee-collections?format=csv&from=2026-01-01&to=2027-12-31`, h.tokens.accountant)
    ).buffer.toString();
    assert.match(collections, /RCPT26-000001/);
    const defaulters = (
      await download(`${R}/exports/fee-defaulters?format=csv`, h.tokens.accountant)
    ).buffer.toString();
    assert.equal(defaulters.trim().split("\r\n").length, 3);
    const results = (
      await download(`${R}/exports/results?format=csv&examId=${world.exam.id}&sectionId=${world.s1A.id}`)
    ).buffer.toString();
    assert.match(results, /MA01 \(\/100\)/);
    /* Papers in display-code order: EN01 then MA01 */
    assert.match(results, /Fstudent2 Lstudent2,12,AB,12,8,E,FAIL,2/);
  });

  it("renders report cards as PDF, publishing rules included", async () => {
    const staff = await download(`/api/v1/academics/report-cards/students/${world.s1.id}/pdf?examId=${world.exam.id}`);
    assert.equal(staff.buffer.subarray(0, 4).toString(), "%PDF");
    const portal = await download(
      `/api/v1/me/students/${world.s1.id}/report-cards/pdf?examId=${world.exam.id}`,
      h.tokens.student1
    );
    assert.equal(portal.headers.get("content-type"), "application/pdf");
    await get(
      `/api/v1/me/students/${world.s1.id}/report-cards/pdf?examId=${world.finalExam.id}`,
      { as: h.tokens.student1 },
      404
    );
  });
});

describe("administration: settings and audit log", () => {
  it("updates the school profile", async () => {
    const settings = await get(`${ADM}/settings`, { as: h.tokens.principal });
    assert.equal(settings.data.timezone, "Asia/Kolkata");

    const bad = await request("PATCH", `${ADM}/settings`, { body: { timezone: "Mars/Olympus" } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.message, "Invalid request: timezone must be an IANA time zone such as Asia/Kolkata");

    const updated = await patch(`${ADM}/settings`, {
      name: "Test Public School",
      currency: "inr",
      contactEmail: "office@test.school"
    });
    assert.equal(updated.data.name, "Test Public School");
    assert.equal(updated.data.currency, "INR");
    assert.equal((await get(`${ADM}/settings`)).data.name, "Test Public School");
    await patch(`${ADM}/settings`, { name: "x" }, { as: h.tokens.principal }, 403);
  });

  it("browses the audit log", async () => {
    const finance = await get(`${ADM}/audit-logs?permission=finance.&limit=100`);
    assert.ok(finance.meta.total > 5);
    assert.ok(finance.data.every(e => e.permission.startsWith("finance.")));

    const aboutStudent = await get(`${ADM}/audit-logs?entityId=${world.s1.id}`);
    assert.equal(aboutStudent.data[0].permission, "users.students.admit");
    const entry = await get(`${ADM}/audit-logs/${aboutStudent.data[0].id}`);
    assert.equal(entry.data.entityId, world.s1.id);

    await get(`${ADM}/audit-logs`, { as: h.tokens.principal }, 403);
  });
});
