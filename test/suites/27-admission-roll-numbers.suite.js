import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, request, get, post, patch, del, settleJobs } from "../helpers/harness.js";

/* Admission numbers are generated (ADM26-0001); roll numbers follow the school's rule
   (alphabetical, or last year's published final result) when they are assigned. Class 11
   (sections A and B) in 2026-27 is promoted into Class 12 in 2027-28. */

const A = "/api/v1/academics";
const U = "/api/v1/users";
const ASSIGN = `${A}/enrollments/roll-number-assignments`;

const t = {};
const inYear = year => ({ headers: { "x-academic-year-id": year.id } });
const serial = admissionNumber => Number(admissionNumber.split("-")[1]);

const admit = async (key, { firstName, middleName, lastName }, section, year = world.y1, profile = {}) => {
  t[key] = (
    await post(`${U}/students`, {
      user: { firstName, middleName, lastName, email: `${key}@rolls.test.school` },
      profile,
      parents: [],
      enrollment: { academicYearId: year.id, sectionId: section.id }
    })
  ).data;
  return t[key];
};

const roster = async (section, year = world.y1) =>
  (await get(`${A}/enrollments?sectionId=${section.id}&limit=100`, inYear(year))).data;

const names = rows =>
  rows.map(row => `${row.student.user.firstName} ${row.student.user.lastName} ${row.rollNumber} ${row.status}`);

describe("admission numbers", () => {
  it("are generated per admitting year; one sent by the client is ignored", async () => {
    t.c11 = (await post(`${A}/classes`, { className: "Class 11" })).data;
    t.c12 = (await post(`${A}/classes`, { className: "Class 12" })).data;
    t.s11A = (await post(`${A}/sections`, { classId: t.c11.id, sectionName: "A" })).data;
    t.s11B = (await post(`${A}/sections`, { classId: t.c11.id, sectionName: "B" })).data;
    t.s12A = (await post(`${A}/sections`, { classId: t.c12.id, sectionName: "A" }, inYear(world.y2))).data;
    t.s12B = (await post(`${A}/sections`, { classId: t.c12.id, sectionName: "B" }, inYear(world.y2))).data;
    t.s11ANext = (await post(`${A}/sections`, { classId: t.c11.id, sectionName: "A" }, inYear(world.y2))).data;

    /* Admitted out of alphabetical order, with case, accents, a middle name and namesakes */
    const zara = await admit("zara", { firstName: "Zara", lastName: "Khan" }, t.s11A, world.y1, {
      admissionNumber: "MANUAL-1"
    });
    assert.match(zara.admissionNumber, /^ADM26-\d{4}$/);
    assert.equal(zara.enrollment.rollNumber, "11A-001");
    const first = serial(zara.admissionNumber);

    await admit("emileD", { firstName: "Émile", lastName: "Dubois" }, t.s11A);
    await admit("aarav", { firstName: "aarav", lastName: "Shah" }, t.s11A);
    await admit("aaravK", { firstName: "Aarav", middleName: "K", lastName: "Mehta" }, t.s11A);
    await admit("emileA", { firstName: "emile", lastName: "Adams" }, t.s11A);
    await admit("ravi1", { firstName: "Ravi", lastName: "Kumar" }, t.s11A);
    await admit("ravi2", { firstName: "Ravi", lastName: "Kumar" }, t.s11A);
    assert.deepEqual(
      ["emileD", "aarav", "aaravK", "emileA", "ravi1", "ravi2"].map(key => serial(t[key].admissionNumber)),
      [first + 1, first + 2, first + 3, first + 4, first + 5, first + 6]
    );
    assert.equal(t.ravi2.enrollment.rollNumber, "11A-007");

    /* Another year has its own series */
    const next = await admit("nextYear", { firstName: "Nila", lastName: "Das" }, t.s11ANext, world.y2);
    assert.equal(next.admissionNumber, "ADM27-0001");
    assert.equal(next.enrollment.rollNumber, "11A-001");
  });

  it("cannot be changed afterwards", async () => {
    const changed = await patch(`${U}/students/${t.zara.id}`, { admissionNumber: "X-1", bloodGroup: "O+" });
    assert.equal(changed.data.admissionNumber, t.zara.admissionNumber);
    assert.equal(changed.data.bloodGroup, "O+");
    /* Nothing else to change: the admission number alone is not an update */
    const only = await request("PATCH", `${U}/students/${t.zara.id}`, { body: { admissionNumber: "X-1" } });
    assert.equal(only.status, 400);
  });

  it("skips a number already held by older data", async () => {
    const yearCount = (
      await h.pool.query("SELECT seq FROM serial_counters WHERE tenant_id = $1 AND scope = $2", [
        h.tenant.id,
        "ADMISSION-26"
      ])
    ).rows[0].seq;
    const taken = `ADM26-${String(yearCount + 1).padStart(4, "0")}`;
    /* A student admitted before numbers were generated already holds the next one */
    await h.pool.query("UPDATE students SET admission_number = $1 WHERE id = $2", [taken, t.ravi2.id]);
    const yash = await admit("yash", { firstName: "Yash", lastName: "Verma" }, t.s11B);
    assert.equal(serial(yash.admissionNumber), yearCount + 2);
    await h.pool.query("UPDATE students SET admission_number = $1 WHERE id = $2", [
      t.ravi2.admissionNumber,
      t.ravi2.id
    ]);
  });

  it("are generated for CSV imports; an admission-number column is ignored", async () => {
    const before = serial(t.yash.admissionNumber);
    const form = new FormData();
    form.append(
      "file",
      new Blob(
        [
          "First Name,Last Name,Email,Admission No,Class,Section\nBela,Roy,bela@rolls.test.school,OLD-77,Class 11,B\nArjun,Nair,arjun@rolls.test.school,OLD-78,Class 11,B"
        ],
        { type: "text/csv" }
      ),
      "rolls.csv"
    );
    const uploaded = await request("POST", "/api/v1/administration/imports/students", { as: h.tokens.office, form });
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.data.columns.find(c => c.header === "Admission No").mapped, false);
    await post(`/api/v1/administration/imports/${uploaded.body.data.id}/start`, {}, { as: h.tokens.office }, 202);
    await settleJobs();
    const job = await get(`/api/v1/administration/imports/${uploaded.body.data.id}`, { as: h.tokens.office });
    assert.equal(job.data.succeeded, 2);

    const { rows } = await h.pool.query(
      `SELECT u.email, s.admission_number FROM students s JOIN users u ON u.id = s.user_id
       WHERE u.email IN ('bela@rolls.test.school', 'arjun@rolls.test.school') ORDER BY s.admission_number`
    );
    assert.deepEqual(
      rows.map(row => [row.email, serial(row.admission_number), row.admission_number.slice(0, 6)]),
      [
        ["bela@rolls.test.school", before + 1, "ADM26-"],
        ["arjun@rolls.test.school", before + 2, "ADM26-"]
      ]
    );
    /* Template and field list no longer offer the field */
    const template = await request("GET", "/api/v1/administration/imports/students/template", { as: h.tokens.office });
    assert.doesNotMatch(template.buffer.toString(), /admissionNumber/);
  });
});

describe("roll numbers", () => {
  it("follow a school rule, alphabetical by default", async () => {
    const policy = await get(`${A}/enrollments/policy`, { as: h.tokens.teacher });
    assert.equal(policy.data.rollNumberOrder, "ALPHABETICAL");
    await patch(`${A}/enrollments/policy`, { rollNumberOrder: "RESULT_RANK" }, { as: h.tokens.office }, 403);
    await patch(`${A}/enrollments/policy`, { rollNumberOrder: "BY_HEIGHT" }, { as: h.tokens.principal }, 400);
  });

  it("previews, then assigns a section alphabetically", async () => {
    const preview = await post(ASSIGN, { sectionId: t.s11A.id, dryRun: true }, { as: h.tokens.principal }, 200);
    assert.equal(preview.data.rule, "ALPHABETICAL");
    assert.equal(preview.data.dryRun, true);
    assert.match(
      preview.message,
      /^Preview: 7 student\(s\) in 1 section\(s\) alphabetically; \d roll number\(s\) would change/
    );
    const [section] = preview.data.sections;
    assert.deepEqual(
      section.order.map(row => [row.name, row.rollNumber]),
      [
        ["aarav Shah", "11A-001"],
        ["Aarav K Mehta", "11A-002"],
        ["emile Adams", "11A-003"],
        ["Émile Dubois", "11A-004"],
        ["Ravi Kumar", "11A-005"],
        ["Ravi Kumar", "11A-006"],
        ["Zara Khan", "11A-007"]
      ]
    );
    /* Namesakes: the lower admission number first */
    assert.deepEqual(
      section.order.slice(4, 6).map(row => row.studentId),
      [t.ravi1.id, t.ravi2.id]
    );
    assert.equal(section.order[6].currentRollNumber, "11A-001");
    /* Nothing saved */
    assert.equal((await roster(t.s11A))[0].studentId, t.zara.id);

    await post(ASSIGN, { sectionId: t.s11A.id }, { as: h.tokens.teacher }, 403);
    await post(ASSIGN, { sectionId: t.s11A.id }, { as: h.tokens.office }, 403);
    await post(ASSIGN, {}, { as: h.tokens.principal }, 400);
    await post(ASSIGN, { sectionId: t.s11A.id, all: true }, { as: h.tokens.principal }, 400);
    const elsewhere = await request("POST", ASSIGN, { body: { sectionId: t.s12A.id } });
    assert.equal(elsewhere.status, 422);
    assert.equal(elsewhere.body.message, "The section does not belong to academic year 2026-27");

    const assigned = await post(ASSIGN, { sectionId: t.s11A.id }, { as: h.tokens.principal }, 200);
    assert.equal(assigned.data.sections[0].order, undefined);
    assert.equal(assigned.data.sections[0].students, 7);
    assert.equal(assigned.data.sections[0].nextRollNumber, "11A-008");
    assert.match(
      assigned.message,
      /^Roll numbers assigned: 7 student\(s\) in 1 section\(s\) alphabetically; \d changed$/
    );
    assert.deepEqual(names(await roster(t.s11A)), [
      "aarav Shah 11A-001 ACTIVE",
      "Aarav Mehta 11A-002 ACTIVE",
      "emile Adams 11A-003 ACTIVE",
      "Émile Dubois 11A-004 ACTIVE",
      "Ravi Kumar 11A-005 ACTIVE",
      "Ravi Kumar 11A-006 ACTIVE",
      "Zara Khan 11A-007 ACTIVE"
    ]);
    /* Running it again changes nothing */
    const again = await post(ASSIGN, { sectionId: t.s11A.id }, { as: h.tokens.principal }, 200);
    assert.equal(again.data.totals.changed, 0);
  });

  it("gives a late joiner the next number, without renumbering anyone", async () => {
    const late = await admit("aadya", { firstName: "Aadya", lastName: "Bose" }, t.s11A);
    assert.equal(late.enrollment.rollNumber, "11A-008");
    assert.equal((await roster(t.s11A))[0].studentId, t.aarav.id);
  });

  it("numbers students who left after the ones still in the section", async () => {
    const zara = (await roster(t.s11A)).find(row => row.studentId === t.zara.id);
    await patch(`${A}/enrollments/${zara.id}`, { status: "LEFT" });
    const assigned = await post(ASSIGN, { classId: t.c11.id }, {}, 200);
    assert.deepEqual(
      assigned.data.sections.map(s => [s.sectionName, s.students, s.left, s.nextRollNumber]),
      [
        ["Class 11-A", 7, 1, "11A-009"],
        ["Class 11-B", 3, 0, "11B-004"]
      ]
    );
    assert.deepEqual(names(await roster(t.s11A)), [
      "Aadya Bose 11A-001 ACTIVE",
      "aarav Shah 11A-002 ACTIVE",
      "Aarav Mehta 11A-003 ACTIVE",
      "emile Adams 11A-004 ACTIVE",
      "Émile Dubois 11A-005 ACTIVE",
      "Ravi Kumar 11A-006 ACTIVE",
      "Ravi Kumar 11A-007 ACTIVE",
      "Zara Khan 11A-008 LEFT"
    ]);

    /* The whole year, previewed */
    const year = await post(ASSIGN, { all: true, dryRun: true }, {}, 200);
    const sections = (await get(`${A}/sections?limit=100`)).meta.total;
    assert.equal(year.data.totals.sections, sections);
    assert.equal(year.data.academicYear.yearName, "2026-27");
  });

  it("numbers a new year's section by the rule in a bulk promotion", async () => {
    const promoted = await post(`${A}/enrollments/promotions/bulk`, {
      fromSectionId: t.s11B.id,
      toAcademicYearId: world.y2.id,
      toSectionId: t.s12B.id
    });
    assert.equal(promoted.data.promoted, 3);
    assert.deepEqual(names(await roster(t.s12B, world.y2)), [
      "Arjun Nair 12B-001 ACTIVE",
      "Bela Roy 12B-002 ACTIVE",
      "Yash Verma 12B-003 ACTIVE"
    ]);
  });

  it("ranks by last year's published final result; students without one follow alphabetically", async () => {
    const as = h.tokens.principal;
    const changed = await patch(`${A}/enrollments/policy`, { rollNumberOrder: "RESULT_RANK" }, { as });
    assert.equal(changed.data.rollNumberOrder, "RESULT_RANK");
    assert.equal(changed.message, "Roll numbers will be assigned by last year's result");

    /* 2026-27: a FINAL exam for 11-A, published. Émile has no mark (incomplete), Zara left. */
    const subject = (await post(`${A}/subjects`, { subjectName: "Economics", subjectCode: "EC11" })).data;
    await post(`${A}/section-subjects`, { sectionId: t.s11A.id, subjectId: subject.id });
    const exam = (await post(`${A}/exams`, { examName: "Class 11 Annual", examType: "FINAL" })).data;
    const paper = (
      await post(`${A}/exams/${exam.id}/papers`, {
        sectionId: t.s11A.id,
        subjectId: subject.id,
        maxMarks: 100,
        passMarks: 33
      })
    ).data;
    const marks = { aadya: 55, aarav: 90, aaravK: 72, emileA: 90, ravi1: 40, ravi2: 61, zara: 99 };
    await post(
      `${A}/marks/bulk`,
      {
        marks: Object.entries(marks).map(([key, marksObtained]) => ({
          studentId: t[key].id,
          examPaperId: paper.id,
          marksObtained
        }))
      },
      {},
      200
    );
    await post(`${A}/exams/${exam.id}/result-publication`, {}, { as }, 200);

    /* Into an empty section: numbered best first */
    await post(`${A}/enrollments/promotions/bulk`, {
      fromSectionId: t.s11A.id,
      toAcademicYearId: world.y2.id,
      toSectionId: t.s12A.id
    });
    const expected = [
      "aarav Shah 12A-001 ACTIVE",
      "emile Adams 12A-002 ACTIVE",
      "Aarav Mehta 12A-003 ACTIVE",
      "Ravi Kumar 12A-004 ACTIVE",
      "Aadya Bose 12A-005 ACTIVE",
      "Ravi Kumar 12A-006 ACTIVE",
      "Émile Dubois 12A-007 ACTIVE"
    ];
    assert.deepEqual(names(await roster(t.s12A, world.y2)), expected);
    assert.equal((await roster(t.s12A, world.y2))[3].studentId, t.ravi2.id);

    /* New admissions take the next numbers */
    const zed = await admit("zed", { firstName: "Zed", lastName: "Ali" }, t.s12A, world.y2);
    const aaron = await admit("aaron", { firstName: "Aaron", lastName: "Paul" }, t.s12A, world.y2);
    assert.deepEqual([zed.enrollment.rollNumber, aaron.enrollment.rollNumber], ["12A-008", "12A-009"]);
    assert.deepEqual([zed.admissionNumber, aaron.admissionNumber], ["ADM27-0002", "ADM27-0003"]);

    /* Assigned again: the ranked ones, then everyone without a result, alphabetically */
    const preview = await post(ASSIGN, { sectionId: t.s12A.id, dryRun: true }, { as, ...inYear(world.y2) }, 200);
    assert.equal(preview.data.previousAcademicYear.yearName, "2026-27");
    const [section] = preview.data.sections;
    assert.deepEqual([section.ranked, section.unranked], [6, 3]);
    assert.deepEqual(
      section.order.map(row => [row.name, row.rollNumber, row.previousResult?.percentage ?? null]),
      [
        ["aarav Shah", "12A-001", 90],
        ["emile Adams", "12A-002", 90],
        ["Aarav K Mehta", "12A-003", 72],
        ["Ravi Kumar", "12A-004", 61],
        ["Aadya Bose", "12A-005", 55],
        ["Ravi Kumar", "12A-006", 40],
        ["Aaron Paul", "12A-007", null],
        ["Émile Dubois", "12A-008", null],
        ["Zed Ali", "12A-009", null]
      ]
    );
    assert.equal(section.order[0].previousResult.source, "Class 11 Annual");

    const assigned = await post(ASSIGN, { sectionId: t.s12A.id }, { as, ...inYear(world.y2) }, 200);
    assert.equal(assigned.data.totals.changed, 3);
    assert.match(assigned.message, /by last year's result; 3 changed$/);
    assert.deepEqual(names(await roster(t.s12A, world.y2)).slice(6), [
      "Aaron Paul 12A-007 ACTIVE",
      "Émile Dubois 12A-008 ACTIVE",
      "Zed Ali 12A-009 ACTIVE"
    ]);

    await patch(`${A}/enrollments/policy`, { rollNumberOrder: "ALPHABETICAL" }, { as });
  });

  it("refuses an archived year", async () => {
    const as = h.tokens.otherAdmin;
    const [old] = (await get(`${A}/academic-years?limit=100`, { as })).data.filter(y => y.yearName === "2020-21");
    await post(`${A}/academic-years/${old.id}/archival`, {}, { as }, 200);
    const refused = await request("POST", ASSIGN, { as, body: { all: true }, ...inYear(old) });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.message, "Academic year 2020-21 is archived and read-only");
    await del(`${A}/academic-years/${old.id}/archival`, { as });
  });
});
