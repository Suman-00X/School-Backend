import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, todayIn } from "../../src/common/utils/date.util.js";
import { roundTo } from "../../src/modules/academics/shared/utils/rounding.util.js";
import { h, world, request, get, post, patch, del, person, tokenFor, uuid } from "../helpers/harness.js";

/* Result policies (D-09) and published report snapshots (D-10).
   Class 10 (sections A and B) sits Term 1 (Physics split into theory + practical,
   Art graded without marks) and Term 2; the Annual scheme weighs them 40/60. */

const A = "/api/v1/academics";
const ME = "/api/v1/me";
const R = "/api/v1/reports";

/* Values shared by the tests below */
const t = {};

const lockWaiters = async () =>
  Number(
    (
      await h.pool.query(
        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
      )
    ).rows[0].count
  );

const pdfOk = async (url, as = h.tokens.admin) => {
  const res = await request("GET", url, { as });
  assert.equal(res.status, 200, `${url} -> ${res.status} ${res.buffer.toString().slice(0, 300)}`);
  assert.equal(res.buffer.subarray(0, 4).toString(), "%PDF");
  return res;
};

const sheetOf = (examId, sectionId, as) => get(`${A}/report-cards/sections/${sectionId}?examId=${examId}`, { as });
const rowOf = (sheet, key) => sheet.data.students.find(s => s.studentId === t[key].id);
const lineOf = (row, code) => [...row.subjects, ...row.coScholastic].find(l => l.subject.subjectCode === code);

describe("results: setup for Class 10", () => {
  it("creates subjects, sections, students and grade scales from templates", async () => {
    const subjects = (
      await post(`${A}/subjects/bulk`, {
        subjects: [
          { subjectName: "Physics", subjectCode: "PH" },
          { subjectName: "Chemistry", subjectCode: "CH" },
          { subjectName: "Biology", subjectCode: "BI" },
          { subjectName: "Computer Science", subjectCode: "CS" },
          { subjectName: "Art", subjectCode: "AR" }
        ]
      })
    ).data;
    for (const s of subjects) t[s.subjectCode] = s;

    t.c10 = (await post(`${A}/classes`, { className: "Class 10", classOrder: 10 })).data;
    t.s10A = (await post(`${A}/sections`, { classId: t.c10.id, sectionName: "A" })).data;
    t.s10B = (await post(`${A}/sections`, { classId: t.c10.id, sectionName: "B" })).data;
    for (const section of [t.s10A, t.s10B]) {
      for (const s of subjects) await post(`${A}/section-subjects`, { sectionId: section.id, subjectId: s.id });
    }
    /* teacher2 teaches Chemistry in 10-A only; ct10 is 10-A's class teacher (D-11: report cards are theirs) */
    await post(`${A}/teacher-assignments`, {
      teacherId: world.teacher2.id,
      sectionId: t.s10A.id,
      subjectId: t.CH.id
    });
    t.ct10 = (await post("/api/v1/users/teachers", { user: person("ct10") })).data;
    h.tokens.ct10 = tokenFor(t.ct10.userId, "TEACHER");
    await patch(`${A}/sections/${t.s10A.id}`, { classTeacherId: t.ct10.id });

    const admit = async (key, section) => {
      const student = (
        await post("/api/v1/users/students", {
          user: person(`r${key}`),
          parents: [],
          enrollment: { academicYearId: world.y1.id, sectionId: section.id }
        })
      ).data;
      t[key] = student;
      h.tokens[`r${key}`] = tokenFor(student.userId, "STUDENT");
    };
    for (const key of ["ana", "bo", "cy", "di", "gu"]) await admit(key, t.s10A);
    for (const key of ["ed", "fi"]) await admit(key, t.s10B);

    const templates = await get(`${A}/grade-scales/templates`, { as: h.tokens.teacher });
    assert.ok(
      ["CBSE_9_POINT", "CBSE_CO_SCHOLASTIC", "IB_1_7", "US_LETTER_4_0", "UGC_10_POINT"].every(k =>
        templates.data.some(x => x.key === k)
      )
    );

    const cbse = await post(`${A}/grade-scales`, { templateKey: "CBSE_9_POINT" });
    assert.equal(cbse.message, "Grade scale CBSE 9-point (A1-E2) created with 9 bands");
    t.cbse = cbse.data;
    t.coScale = (await post(`${A}/grade-scales`, { templateKey: "CBSE_CO_SCHOLASTIC", name: "Co-scholastic" })).data;
    t.ib = (await post(`${A}/grade-scales`, { templateKey: "IB_1_7" })).data;
    assert.equal(t.ib.bands.find(b => b.grade === "7").gradePoint, 7);

    const both = await request("POST", `${A}/grade-scales`, {
      body: {
        templateKey: "IB_1_7",
        name: "x",
        bands: [
          { grade: "A", minPercent: 50, maxPercent: 100 },
          { grade: "B", minPercent: 0, maxPercent: 50 }
        ]
      }
    });
    assert.equal(both.status, 400);
    assert.equal(both.body.message, "Invalid request: bands send either bands or templateKey");
    const overlap = await request("POST", `${A}/grade-scales`, {
      body: {
        name: "Overlapping",
        bands: [
          { grade: "A", minPercent: 40, maxPercent: 100 },
          { grade: "B", minPercent: 0, maxPercent: 50 }
        ]
      }
    });
    assert.equal(overlap.status, 422);
    assert.equal(overlap.body.message, "Bands must not overlap: B ends at 50% but A starts at 40%");
  });

  it("splits papers into components and grades Art without marks", async () => {
    t.term1 = (await post(`${A}/exams`, { examName: "Term 1", examType: "INTERNAL", startDate: "2026-09-14" })).data;
    t.term2 = (await post(`${A}/exams`, { examName: "Term 2", examType: "FINAL", startDate: "2026-12-07" })).data;
    const paper = (exam, body, status = 201) => post(`${A}/exams/${exam.id}/papers`, body, {}, status);

    const graded = await request("POST", `${A}/exams/${t.term1.id}/papers`, {
      body: { sectionId: t.s10A.id, subjectId: t.AR.id, gradingType: "GRADE", maxMarks: 50 }
    });
    assert.equal(graded.status, 400);
    assert.equal(
      graded.body.message,
      "Invalid request: maxMarks must not be sent for a GRADE paper (it is graded without marks)"
    );
    await paper(t.term1, { sectionId: t.s10A.id, subjectId: t.CH.id }, 400);

    t.p1 = {};
    for (const section of [t.s10A, t.s10B]) {
      const p = (t.p1[section.sectionName] = {});
      p.PHT = (
        await paper(t.term1, {
          sectionId: section.id,
          subjectId: t.PH.id,
          component: "THEORY",
          maxMarks: 70,
          passMarks: 23
        })
      ).data;
      p.PHP = (
        await paper(t.term1, {
          sectionId: section.id,
          subjectId: t.PH.id,
          component: "PRACTICAL",
          maxMarks: 30,
          passMarks: 10
        })
      ).data;
      for (const code of ["CH", "BI", "CS"]) {
        p[code] = (
          await paper(t.term1, { sectionId: section.id, subjectId: t[code].id, maxMarks: 100, passMarks: 33 })
        ).data;
      }
      p.AR = (await paper(t.term1, { sectionId: section.id, subjectId: t.AR.id, gradingType: "GRADE" })).data;
    }
    assert.equal(t.p1.A.PHT.displayCode, "PH430-A-INTERNAL-TH");
    assert.equal(t.p1.A.AR.maxMarks, null);

    const again = await request("POST", `${A}/exams/${t.term1.id}/papers`, {
      body: { sectionId: t.s10A.id, subjectId: t.PH.id, component: "THEORY", maxMarks: 70 }
    });
    assert.equal(again.status, 409);
    assert.equal(again.body.message, "This exam already has a theory paper for Physics in the section");
    const whole = await request("POST", `${A}/exams/${t.term1.id}/papers`, {
      body: { sectionId: t.s10A.id, subjectId: t.PH.id, maxMarks: 100 }
    });
    assert.equal(whole.status, 409);
    const mixed = await request("POST", `${A}/exams/${t.term1.id}/papers`, {
      body: { sectionId: t.s10A.id, subjectId: t.PH.id, component: "ORAL", gradingType: "GRADE" }
    });
    assert.equal(mixed.status, 422);
    assert.equal(
      mixed.body.message,
      "Physics's other components are marked out of marks; every component must be graded the same way"
    );
    const noMarks = await request("PATCH", `${A}/exams/${t.term1.id}/papers/${t.p1.A.AR.id}`, {
      body: { maxMarks: 20 }
    });
    assert.equal(noMarks.status, 422);

    t.p2 = {};
    for (const section of [t.s10A, t.s10B]) {
      const p = (t.p2[section.sectionName] = {});
      for (const code of ["PH", "CH", "BI", "CS"]) {
        p[code] = (
          await paper(t.term2, { sectionId: section.id, subjectId: t[code].id, maxMarks: 100, passMarks: 33 })
        ).data;
      }
      p.AR = (await paper(t.term2, { sectionId: section.id, subjectId: t.AR.id, gradingType: "GRADE" })).data;
    }
  });
});

describe("results: policies", () => {
  it("validates a policy with readable 400 and 422 messages", async () => {
    const create = body => request("POST", `${A}/result-policies`, { body });
    const cases = [
      [
        { name: "x", gradingMode: "GPA" },
        400,
        "Invalid request: gpaScale is required for a GPA policy (the highest grade point, e.g. 4, 5 or 10)"
      ],
      [
        { name: "x", graceMaxPerSubject: 5, graceMaxTotal: 3 },
        400,
        "Invalid request: graceMaxPerSubject cannot exceed graceMaxTotal"
      ],
      [
        { name: "x", gradingMode: "PASS_FAIL", rankingMethod: "DENSE" },
        400,
        "Invalid request: rankingMethod must be NONE for a pass/fail policy"
      ],
      [{ name: "x", percentageDecimals: 6 }, 400, "Invalid request: percentageDecimals must be at most 4"],
      [
        { name: "x", subjects: [{ subjectId: t.AR.id, category: "CO_SCHOLASTIC", isMandatory: true }] },
        400,
        "Invalid request: subjects.0.isMandatory cannot be true for a co-scholastic subject (it never counts toward the result)"
      ],
      [
        { name: "x", gradingMode: "GPA", gpaScale: 4, gradeScaleId: t.cbse.id },
        422,
        "Grade scale CBSE 9-point (A1-E2) has grade points up to 10, above this policy's 4-point GPA scale"
      ],
      [
        { name: "x", gradingMode: "GPA", gpaScale: 10, gradeScaleId: t.coScale.id },
        422,
        "Grade scale Co-scholastic has no grade point for A, B, C; GPA needs one on every passing band"
      ],
      [
        {
          name: "x",
          bestOfSubjects: 1,
          subjects: [
            { subjectId: t.PH.id, isMandatory: true },
            { subjectId: t.CH.id, isMandatory: true }
          ]
        },
        422,
        "2 mandatory subjects cannot fit in the best 1 subjects counted"
      ],
      [{ name: "x", gradeScaleId: uuid() }, 422, "gradeScaleId does not refer to an existing grade scale"],
      [
        { name: "x", subjects: [{ subjectId: uuid() }] },
        422,
        "One or more subject rules name a subject that does not exist"
      ]
    ];
    for (const [body, status, message] of cases) {
      const res = await create(body);
      assert.equal(res.status, status, JSON.stringify(body));
      assert.equal(res.body.message, message);
    }
    assert.equal(
      (await request("POST", `${A}/result-policies`, { as: h.tokens.teacher, body: { name: "x" } })).status,
      403
    );
  });

  it("creates a board policy: GPA, credits, best of 3, grace, compartment, dense class ranks", async () => {
    const board = await post(`${A}/result-policies`, {
      name: "Board Secondary",
      gradingMode: "GPA",
      gpaScale: 10,
      gradeScaleId: t.cbse.id,
      coScholasticScaleId: t.coScale.id,
      graceMaxPerSubject: 3,
      graceMaxTotal: 5,
      maxCompartmentSubjects: 1,
      bestOfSubjects: 3,
      medicalTreatment: "EXCLUDE",
      rankingMethod: "DENSE",
      rankScope: "BOTH",
      showRankToStudents: false,
      percentageDecimals: 1,
      subjects: [
        { subjectId: t.PH.id, credits: 4, isMandatory: true },
        { subjectId: t.CH.id, credits: 4 },
        { subjectId: t.BI.id, credits: 3 },
        { subjectId: t.CS.id, credits: 2 },
        { subjectId: t.AR.id, category: "CO_SCHOLASTIC" }
      ]
    });
    assert.equal(board.message, "Result policy Board Secondary created (GPA (10-point))");
    assert.equal(board.data.subjects.length, 5);
    assert.equal(board.data.exemptTreatment, "EXCLUDE");
    t.board = board.data;

    const passFail = await post(`${A}/result-policies`, { name: "Pass/fail tests", gradingMode: "PASS_FAIL" });
    assert.equal(passFail.data.rankingMethod, "NONE", "pass/fail turns ranking off");
    t.passFail = passFail.data;
    const ranked = await request("PATCH", `${A}/result-policies/${t.passFail.id}`, {
      body: { rankingMethod: "DENSE" }
    });
    assert.equal(ranked.status, 422);
    assert.equal(ranked.body.message, "A pass/fail policy cannot rank students: set rankingMethod to NONE");

    const dup = await request("POST", `${A}/result-policies`, { body: { name: "Board Secondary" } });
    assert.equal(dup.status, 409);
    assert.equal((await get(`${A}/result-policies?gradingMode=GPA`, { as: h.tokens.teacher })).meta.total, 1);
  });

  it("resolves the policy: exam + class, exam, class, school default, built-in", async () => {
    const resolve = query => get(`${A}/result-policies/resolution?${query}`);
    const before = await resolve(`examId=${t.term1.id}&sectionId=${t.s10A.id}`);
    assert.equal(before.data.source, "BUILT_IN");
    assert.equal(before.message, "Standard (built-in) applies: the built-in standard rules (no policy set)");

    const toClass = await post(`${A}/result-policy-assignments`, { policyId: t.board.id, classId: t.c10.id });
    assert.equal(toClass.message, "Result policy Board Secondary assigned to Class 10 (every exam)");
    const twice = await request("POST", `${A}/result-policy-assignments`, {
      body: { policyId: t.passFail.id, classId: t.c10.id }
    });
    assert.equal(twice.status, 409);
    assert.equal(
      twice.body.message,
      "Class 10 (every exam) already uses result policy Board Secondary. Change that assignment instead."
    );
    assert.equal(
      (await request("POST", `${A}/result-policy-assignments`, { body: { policyId: t.board.id } })).status,
      400
    );

    t.weekly = (await post(`${A}/exams`, { examName: "Weekly Test", startDate: "2026-08-03" })).data;
    const toExam = await post(`${A}/result-policy-assignments`, { policyId: t.passFail.id, examId: t.weekly.id });
    assert.equal(toExam.message, "Result policy Pass/fail tests assigned to Weekly Test (every class)");

    assert.equal((await resolve(`examId=${t.term1.id}&classId=${t.c10.id}`)).data.source, "CLASS");
    const examWins = await resolve(`examId=${t.weekly.id}&classId=${t.c10.id}`);
    assert.deepEqual([examWins.data.source, examWins.data.policy.name], ["EXAM", "Pass/fail tests"]);

    const both = await post(`${A}/result-policy-assignments`, {
      policyId: t.board.id,
      examId: t.weekly.id,
      classId: t.c10.id
    });
    assert.equal(both.message, "Result policy Board Secondary assigned to Weekly Test for Class 10");
    assert.equal((await resolve(`examId=${t.weekly.id}&classId=${t.c10.id}`)).data.source, "EXAM_CLASS");
    assert.equal((await resolve(`examId=${t.weekly.id}&classId=${world.c1.id}`)).data.source, "EXAM");
    const moved = await patch(`${A}/result-policy-assignments/${both.data.id}`, { policyId: t.passFail.id });
    assert.equal(moved.message, "Weekly Test for Class 10 now uses result policy Pass/fail tests");
    assert.equal(
      (await del(`${A}/result-policy-assignments/${both.data.id}`)).message,
      "Result policy Pass/fail tests no longer applies to Weekly Test for Class 10"
    );

    /* A school default applies to everything without an assignment */
    const fallback = await post(`${A}/result-policies`, {
      name: "School rules",
      isDefault: true,
      overallMinPercent: 33
    });
    assert.equal((await resolve(`examId=${world.exam.id}&classId=${world.c1.id}`)).data.source, "SCHOOL_DEFAULT");
    await patch(`${A}/result-policies/${fallback.data.id}`, { isDefault: false });
    assert.equal((await resolve(`examId=${world.exam.id}&classId=${world.c1.id}`)).data.source, "BUILT_IN");
    await del(`${A}/result-policies/${fallback.data.id}`);

    const inUse = await request("DELETE", `${A}/result-policies/${t.board.id}`);
    assert.equal(inUse.status, 409);
    assert.match(inUse.body.message, /^Result policy Board Secondary is assigned to 1 exam or class target\(s\)/);
  });
});

describe("results: marks under a policy", () => {
  it("takes grades alone for Art and absence reasons", async () => {
    const mark = body => request("POST", `${A}/marks`, { body });
    const withMarks = await mark({ studentId: t.ana.id, examPaperId: t.p1.A.AR.id, marksObtained: 40 });
    assert.equal(withMarks.status, 422);
    assert.equal(
      withMarks.body.message,
      "AR430-A-INTERNAL is graded without marks: send a grade instead of marksObtained"
    );
    const offScale = await mark({ studentId: t.ana.id, examPaperId: t.p1.A.AR.id, grade: "Z" });
    assert.equal(offScale.status, 422);
    assert.equal(offScale.body.message, "Grade Z is not on the Co-scholastic scale (A, B, C)");
    const gradeOnly = await mark({ studentId: t.ana.id, examPaperId: t.p1.A.CH.id, grade: "A1" });
    assert.equal(gradeOnly.status, 422);
    assert.match(gradeOnly.body.message, /^CH430-A-INTERNAL is marked out of 100: send marksObtained/);
    const reasonOnly = await mark({ studentId: t.ana.id, examPaperId: t.p1.A.CH.id, absenceReason: "MEDICAL" });
    assert.equal(reasonOnly.status, 400);
  });

  it("records Term 1 and Term 2 marks", async () => {
    /* [theory, practical, chemistry, biology, computer, art] */
    const term1 = {
      ana: [60, 28, 91, 85, 95, "A"],
      gu: [60, 28, 91, 85, 95, "B"],
      bo: [21, 25, 70, 64, 30, "B"],
      cy: [50, 20, 20, 72, 81, "A"],
      di: [40, 22, 55, "MEDICAL", 60, "C"],
      ed: [65, 29, 91, 88, 92, "A"],
      fi: [15, 15, 40, 50, 45, "B"]
    };
    const entry = (student, paper, value) =>
      value === "MEDICAL" || value === "EXEMPT"
        ? { studentId: student.id, examPaperId: paper.id, isAbsent: true, absenceReason: value }
        : typeof value === "string"
          ? { studentId: student.id, examPaperId: paper.id, grade: value, remarks: "Creative work" }
          : { studentId: student.id, examPaperId: paper.id, marksObtained: value };
    const marks1 = Object.entries(term1).flatMap(([key, values]) => {
      const p = t.p1[["ed", "fi"].includes(key) ? "B" : "A"];
      return [p.PHT, p.PHP, p.CH, p.BI, p.CS, p.AR].map((paper, i) => entry(t[key], paper, values[i]));
    });
    assert.equal((await post(`${A}/marks/bulk`, { marks: marks1 }, {}, 200)).data.created, 42);

    /* [physics, chemistry, biology, computer, art] */
    const term2 = {
      ana: [90, 95, 80, 85, "A"],
      gu: [90, 95, 80, "EXEMPT", "A"],
      bo: [50, 60, 70, 40, "B"],
      cy: [75, 30, 70, 85, "A"],
      di: [70, 60, 65, 70, "B"],
      ed: [95, 95, 90, 95, "A"],
      fi: [40, 45, 50, 50, "C"]
    };
    const marks2 = Object.entries(term2).flatMap(([key, values]) => {
      const p = t.p2[["ed", "fi"].includes(key) ? "B" : "A"];
      return [p.PH, p.CH, p.BI, p.CS, p.AR].map((paper, i) => entry(t[key], paper, values[i]));
    });
    assert.equal((await post(`${A}/marks/bulk`, { marks: marks2 }, {}, 200)).data.created, 35);

    /* An exemption is always left out: Gu's three other subjects fill the best 3 */
    const gu = rowOf(await sheetOf(t.term2.id, t.s10A.id), "gu");
    const computer = lineOf(gu, "CS");
    assert.deepEqual(
      [computer.status, computer.grade, computer.counted, computer.passed],
      ["EXEMPT", "EX", false, null]
    );
    assert.deepEqual([gu.result, gu.totalMax, gu.percentage], ["PASS", 300, 88.3]);
  });
});

describe("results: report cards under the board policy", () => {
  it("computes GPA, best of 3, grace, medical exclusion and dense section and class ranks", async () => {
    const sheet = await sheetOf(t.term1.id, t.s10A.id);
    assert.equal(sheet.data.policy.name, "Board Secondary");
    assert.equal(sheet.data.policy.source, "CLASS");
    assert.equal(sheet.data.classSize, 7);

    const ana = rowOf(sheet, "ana");
    /* Physics 88 (mandatory) + best two of CS 95, CH 91, BI 85 -> 274 / 300 */
    assert.deepEqual(
      [ana.totalObtained, ana.totalMax, ana.percentage, ana.grade, ana.gpa, ana.result],
      [274, 300, 91.3, "A1", 9.6, "PASS"]
    );
    assert.equal(lineOf(ana, "BI").counted, false);
    assert.deepEqual(
      lineOf(ana, "PH").components.map(c => [c.component, c.marksObtained]),
      [
        ["THEORY", 60],
        ["PRACTICAL", 28]
      ]
    );
    const art = lineOf(ana, "AR");
    assert.deepEqual(
      [art.category, art.grade, art.remark, art.teacherRemarks],
      ["CO_SCHOLASTIC", "A", "Outstanding", "Creative work"]
    );
    assert.equal(
      ana.subjects.some(l => l.subject.subjectCode === "AR"),
      false,
      "Art never counts toward the percentage"
    );

    /* Bo: theory 21 of 23 needed -> 2 grace marks turn the compartment into a pass */
    const bo = rowOf(sheet, "bo");
    const physics = lineOf(bo, "PH");
    assert.deepEqual(
      [physics.marksObtained, physics.graceMarks, physics.marksAwarded, physics.grade, physics.passed],
      [46, 2, 48, "C2", true]
    );
    assert.equal(physics.components.find(c => c.component === "THEORY").graceMarks, 2);
    assert.deepEqual([bo.result, bo.graceTotal, bo.percentage, bo.gpa], ["PASS", 2, 60.7, 6.27]);
    assert.equal(lineOf(bo, "CS").counted, false, "the failed computer paper is outside the best 3");

    /* Cy fails chemistry, but it is not among the best 3 */
    const cy = rowOf(sheet, "cy");
    assert.deepEqual(
      [cy.result, cy.gpa, lineOf(cy, "CH").passed, lineOf(cy, "CH").counted],
      ["PASS", 7.78, false, false]
    );

    /* Di's medical absence is left out of the result */
    const di = rowOf(sheet, "di");
    const biology = lineOf(di, "BI");
    assert.deepEqual(
      [biology.status, biology.absenceReason, biology.counted, biology.grade],
      ["ABSENT", "MEDICAL", false, "AB"]
    );
    assert.deepEqual([di.percentage, di.gpa, di.result], [59, 6.4, "PASS"]);

    /* Dense ranks by GPA: Ana and Gu tie at 9.6 */
    const ranks = Object.fromEntries(["ana", "gu", "cy", "di", "bo"].map(k => [k, rowOf(sheet, k).rank]));
    assert.deepEqual(ranks, { ana: 1, gu: 1, cy: 2, di: 3, bo: 4 });
    assert.deepEqual(
      ["ana", "gu", "cy", "di", "bo"].map(k => rowOf(sheet, k).classRank),
      [2, 2, 3, 4, 5]
    );

    const other = await sheetOf(t.term1.id, t.s10B.id);
    const fi = rowOf(other, "fi");
    /* Theory 15 needs 8 grace marks (limit 3): one failed subject -> compartment */
    assert.deepEqual(
      [fi.result, fi.compartmentSubjects.map(s => s.subjectName), fi.graceTotal],
      ["COMPARTMENT", ["Physics"], 0]
    );
    assert.deepEqual([rowOf(other, "ed").classRank, rowOf(other, "ed").gpa], [1, 10]);
    assert.equal(other.data.statistics.compartment, 1);
  });

  it("limits teachers to their sections and grades pass/fail exams without ranks", async () => {
    await sheetOf(t.term1.id, t.s10A.id, h.tokens.ct10);
    const denied = await request("GET", `${A}/report-cards/sections/${t.s10B.id}?examId=${t.term1.id}`, {
      as: h.tokens.ct10
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.message, "You can only do this for sections you teach");
    /* D-11: a subject teacher of the section does not see its report cards */
    for (const url of [
      `${A}/report-cards/sections/${t.s10A.id}?examId=${t.term1.id}`,
      `${A}/report-cards/students/${t.ana.id}?examId=${t.term1.id}`,
      `${A}/report-cards/students/${t.ana.id}/pdf?examId=${t.term1.id}`
    ]) {
      const subjectTeacher = await request("GET", url, { as: h.tokens.teacher2 });
      assert.equal(subjectTeacher.status, 403, url);
      assert.equal(subjectTeacher.body.message, "Only the class teacher of this section can see its report cards");
    }
    await get(`${A}/report-cards/students/${t.ana.id}?examId=${t.term1.id}`, { as: h.tokens.ct10 });

    const paper = (
      await post(`${A}/exams/${t.weekly.id}/papers`, {
        sectionId: t.s10A.id,
        subjectId: t.CH.id,
        maxMarks: 100,
        passMarks: 33
      })
    ).data;
    await post(
      `${A}/marks/bulk`,
      {
        marks: [
          { studentId: t.ana.id, examPaperId: paper.id, marksObtained: 80 },
          { studentId: t.bo.id, examPaperId: paper.id, marksObtained: 20 },
          { studentId: t.cy.id, examPaperId: paper.id, isAbsent: true },
          { studentId: t.di.id, examPaperId: paper.id, marksObtained: 50 },
          { studentId: t.gu.id, examPaperId: paper.id, marksObtained: 33 }
        ]
      },
      { as: h.tokens.teacher2 },
      200
    );
    const weekly = await sheetOf(t.weekly.id, t.s10A.id);
    assert.equal(weekly.data.policy.source, "EXAM");
    assert.equal(weekly.data.display.marks, false);
    assert.deepEqual(
      ["ana", "bo", "cy", "di", "gu"].map(k => [
        rowOf(weekly, k).result,
        rowOf(weekly, k).rank,
        rowOf(weekly, k).grade
      ]),
      [
        ["PASS", null, null],
        ["FAIL", null, null],
        ["FAIL", null, null],
        ["PASS", null, null],
        ["PASS", null, null]
      ]
    );
  });

  it("shows the policy on the staff report card and PDF", async () => {
    const card = await get(`${A}/report-cards/students/${t.bo.id}?examId=${t.term1.id}`);
    const report = card.data.reports[0];
    assert.deepEqual(
      [report.rank, report.classRank, report.graceTotal, report.policy.name],
      [4, 5, 2, "Board Secondary"]
    );
    assert.equal(report.display.rankToStudents, false);
    await pdfOk(`${A}/report-cards/students/${t.bo.id}/pdf?examId=${t.term1.id}`);
  });

  it("previews another policy on real marks without saving anything", async () => {
    const before = Number((await h.pool.query("SELECT count(*) FROM result_publications")).rows[0].count);
    const strict = await post(
      `${A}/report-cards/previews`,
      { examId: t.term1.id, sectionId: t.s10A.id, policy: { name: "Every subject counts", gradeScaleId: t.cbse.id } },
      {},
      200
    );
    /* No best-of, no grace: Bo (theory, computer), Cy (chemistry) fail; Di's medical absence is a fail */
    assert.deepEqual(strict.data.summary.preview, { PASS: 2, COMPARTMENT: 0, FAIL: 3, INCOMPLETE: 0 });
    assert.deepEqual(strict.data.summary.current, { PASS: 5, COMPARTMENT: 0, FAIL: 0, INCOMPLETE: 0 });
    assert.equal(strict.data.summary.resultChanged, 3);
    assert.equal(
      strict.message,
      "Preview of Every subject counts on Term 1: 3 of 5 results would change (nothing was saved)"
    );
    const cyChange = strict.data.changes.find(c => c.studentId === t.cy.id);
    /* Ranked by percentage now (competition): Ana and Gu 89.75, Cy 60.75 */
    assert.deepEqual([cyChange.current.result, cyChange.preview.result, cyChange.preview.rank], ["PASS", "FAIL", 3]);

    const saved = await post(`${A}/report-cards/previews`, { examId: t.term1.id, policyId: t.passFail.id }, {}, 200);
    assert.equal(saved.data.sections.length, 2);
    assert.ok(saved.data.sections.every(s => s.students.every(row => row.rank === null)));

    assert.equal((await request("POST", `${A}/report-cards/previews`, { body: { examId: t.term1.id } })).status, 400);
    const bad = await request("POST", `${A}/report-cards/previews`, {
      body: { examId: t.term1.id, policy: { gradingMode: "GPA", gpaScale: 4, gradeScaleId: t.cbse.id } }
    });
    assert.equal(bad.status, 422);
    const teacher = await request("POST", `${A}/report-cards/previews`, {
      as: h.tokens.teacher2,
      body: { examId: t.term1.id, policyId: t.passFail.id }
    });
    assert.equal(teacher.status, 403);
    assert.equal(Number((await h.pool.query("SELECT count(*) FROM result_publications")).rows[0].count), before);
  });

  it("rounds by the policy's mode", () => {
    assert.deepEqual(
      [
        roundTo(2.345, 2),
        roundTo(2.345, 2, "HALF_EVEN"),
        roundTo(2.341, 2, "UP"),
        roundTo(2.349, 2, "DOWN"),
        roundTo(1.005, 2)
      ],
      [2.35, 2.34, 2.35, 2.34, 1.01]
    );
  });
});

describe("results: publication and report snapshots", () => {
  it("publishes Term 1 as version 1 and families see the snapshot (ranks hidden)", async () => {
    const published = await post(`${A}/exams/${t.term1.id}/result-publication`, {}, { as: h.tokens.principal }, 200);
    assert.equal(published.message, "Term 1 results published (version 1, 7 report cards)");
    assert.deepEqual([published.data.publication.version, published.data.publication.changedCount], [1, null]);

    const cards = await get(`${ME}/students/${t.bo.id}/report-cards`, { as: h.tokens.rbo });
    assert.equal(cards.data.reports.length, 1);
    const report = cards.data.reports[0];
    assert.deepEqual(
      [report.kind, report.exam.examName, report.version, report.result, report.gpa, report.graceTotal],
      ["EXAM", "Term 1", 1, "PASS", 6.27, 2]
    );
    assert.deepEqual([report.rank, report.classRank], [null, null], "the policy hides ranks from families");
    assert.equal(report.policy.gradingMode, "GPA");
    assert.equal(report.subjects.find(s => s.subject.subjectCode === "CS").marksObtained, 30);
    await pdfOk(`${ME}/students/${t.bo.id}/report-cards/pdf?examId=${t.term1.id}`, h.tokens.rbo);
    await get(`${ME}/students/${t.bo.id}/report-cards?examId=${t.term2.id}`, { as: h.tokens.rbo }, 404);
    await get(`${ME}/students/${t.ana.id}/report-cards`, { as: h.tokens.rbo }, 404);
  });

  it("compares live results with the published version after a mark changes", async () => {
    await post(`${A}/marks`, { studentId: t.bo.id, examPaperId: t.p1.A.CS.id, marksObtained: 34 }, {}, 200);

    const portal = await get(`${ME}/students/${t.bo.id}/report-cards?examId=${t.term1.id}`, { as: h.tokens.rbo });
    assert.equal(
      portal.data.reports[0].subjects.find(s => s.subject.subjectCode === "CS").marksObtained,
      30,
      "frozen"
    );

    const comparison = await get(`${A}/exams/${t.term1.id}/result-publication/comparison`);
    assert.equal(comparison.message, "Live results compared with version 1: 1 changed, 6 unchanged");
    const bo = comparison.data.students.find(s => s.studentId === t.bo.id);
    assert.equal(bo.status, "CHANGED");
    assert.deepEqual(
      bo.changes.find(c => c.field === "CS.marksObtained"),
      { field: "CS.marksObtained", published: 30, live: 34 }
    );
    const scoped = await get(`${A}/exams/${t.term1.id}/result-publication/comparison`, { as: h.tokens.ct10 });
    assert.equal(scoped.data.summary.students, 5, "class teachers compare their own sections only");
    const subjectTeacher = await get(`${A}/exams/${t.term1.id}/result-publication/comparison`, {
      as: h.tokens.teacher2
    });
    assert.equal(subjectTeacher.data.summary.students, 0, "a subject teacher sees no report cards");
    await get(
      `${A}/exams/${t.term1.id}/result-publication/comparison?sectionId=${t.s10A.id}`,
      { as: h.tokens.teacher2 },
      403
    );
  });

  it("re-publishes as version 2 and keeps version 1", async () => {
    const revised = await post(`${A}/exams/${t.term1.id}/result-publication/versions`, {});
    assert.equal(revised.message, "Term 1 results re-published as version 2 (1 report card changed)");
    const versions = await get(`${A}/exams/${t.term1.id}/result-publication/versions`, { as: h.tokens.teacher2 });
    assert.deepEqual(
      versions.data.map(v => [v.version, v.status, v.reportCount, v.changedCount]),
      [
        [2, "CURRENT", 7, 1],
        [1, "SUPERSEDED", 7, null]
      ]
    );
    assert.equal(versions.data[0].publisher.firstName, "Ada");

    const portal = await get(`${ME}/students/${t.bo.id}/report-cards`, { as: h.tokens.rbo });
    assert.deepEqual(
      [
        portal.data.reports[0].version,
        portal.data.reports[0].subjects.find(s => s.subject.subjectCode === "CS").marksObtained
      ],
      [2, 34]
    );
    const unpublished = await request("POST", `${A}/exams/${t.term2.id}/result-publication/versions`);
    assert.equal(unpublished.status, 409);
    assert.equal(unpublished.body.message, "Results for Term 2 are not published. Publish them first.");
    assert.equal(
      (await request("POST", `${A}/exams/${t.term1.id}/result-publication/versions`, { as: h.tokens.teacher })).status,
      403
    );
  });

  it("withdraws: hidden from families, kept for staff; publishing again adds version 3", async () => {
    const withdrawn = await del(`${A}/exams/${t.term1.id}/result-publication`);
    assert.equal(
      withdrawn.message,
      "Term 1 results withdrawn: version 2 is hidden from students and parents and kept on record"
    );
    assert.deepEqual((await get(`${ME}/students/${t.bo.id}/report-cards`, { as: h.tokens.rbo })).data.reports, []);
    await get(`${ME}/students/${t.bo.id}/report-cards/pdf?examId=${t.term1.id}`, { as: h.tokens.rbo }, 404);

    const kept = await get(`${A}/report-cards/snapshots?examId=${t.term1.id}&studentId=${t.bo.id}`);
    assert.deepEqual(
      kept.data.map(s => [s.version, s.publicationStatus, s.integrity]),
      [
        [2, "WITHDRAWN", "VERIFIED"],
        [1, "SUPERSEDED", "VERIFIED"]
      ]
    );

    const again = await post(`${A}/exams/${t.term1.id}/result-publication`, {}, {}, 200);
    assert.equal(again.data.publication.version, 3);
    assert.equal(again.data.publication.changedCount, 0);
    assert.equal(
      (await get(`${ME}/students/${t.bo.id}/report-cards`, { as: h.tokens.rbo })).data.reports[0].version,
      3
    );
  });

  it("lets staff open any version, within the teacher's sections, and never edits a snapshot", async () => {
    const list = await get(`${A}/report-cards/snapshots?examId=${t.term1.id}&version=3&limit=100`, {
      as: h.tokens.ct10
    });
    assert.equal(list.meta.total, 5, "ct10 is class teacher of 10-A only");
    const mine = list.data[0];
    const full = await get(`${A}/report-cards/snapshots/${mine.id}`, { as: h.tokens.ct10 });
    assert.equal(full.data.policy.name, "Board Secondary");
    assert.equal(typeof full.data.report.rank, "number", "staff see the rank");
    await pdfOk(`${A}/report-cards/snapshots/${mine.id}/pdf`, h.tokens.ct10);

    /* The Chemistry teacher of 10-A: no snapshots (D-11) */
    const subjectTeacher = await get(`${A}/report-cards/snapshots?examId=${t.term1.id}`, { as: h.tokens.teacher2 });
    assert.equal(subjectTeacher.meta.total, 0);
    await get(`${A}/report-cards/snapshots?sectionId=${t.s10A.id}`, { as: h.tokens.teacher2 }, 403);
    await get(`${A}/report-cards/snapshots/${mine.id}`, { as: h.tokens.teacher2 }, 403);
    await get(`${A}/report-cards/snapshots/${mine.id}/pdf`, { as: h.tokens.teacher2 }, 403);

    const edSnapshot = (await get(`${A}/report-cards/snapshots?examId=${t.term1.id}&studentId=${t.ed.id}&version=3`))
      .data[0];
    assert.equal(
      (await request("GET", `${A}/report-cards/snapshots/${edSnapshot.id}`, { as: h.tokens.ct10 })).status,
      403
    );
    await get(`${A}/report-cards/snapshots/0123456789abcdef01234567`, {}, 404);
    await get(`${A}/report-cards/snapshots/not-an-id`, {}, 400);

    const ReportSnapshot = h.model("ReportSnapshot");
    await assert.rejects(
      ReportSnapshot.updateOne({ _id: mine.id }, { $set: { "report.result": "FAIL" } }),
      /write-once/
    );
    await assert.rejects(ReportSnapshot.replaceOne({ _id: mine.id }, { tenantId: "x" }), /write-once/);
    await assert.rejects(ReportSnapshot.deleteMany({ _id: mine.id }), /write-once/);
    assert.equal((await ReportSnapshot.findById(mine.id).lean()).report.result, mine.report.result);
  });

  it("publishes an exam exactly once when two requests race", async () => {
    /* Hold the exam's row lock so both requests queue on it inside their transactions */
    const holder = await h.pool.connect();
    let results;
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM exams WHERE id = $1 FOR UPDATE", [t.term2.id]);
      const pending = Promise.all([1, 2].map(() => request("POST", `${A}/exams/${t.term2.id}/result-publication`)));
      for (let i = 0; i < 200 && (await lockWaiters()) < 2; i++) await new Promise(r => setTimeout(r, 10));
      assert.equal(await lockWaiters(), 2, "both requests wait on the exam lock");
      await holder.query("COMMIT");
      results = await pending;
    } finally {
      holder.release(true);
    }
    assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
    assert.equal(
      results.find(r => r.status === 409).body.message,
      "Results for Term 2 are already published. To publish changes, add a new version."
    );
    const versions = await get(`${A}/exams/${t.term2.id}/result-publication/versions`);
    assert.deepEqual(
      versions.data.map(v => v.version),
      [1]
    );
    const ReportSnapshot = h.model("ReportSnapshot");
    assert.equal(await ReportSnapshot.countDocuments({ tenantId: h.tenant.id, sourceId: t.term2.id }), 7);
  });

  it("recovers from snapshots left behind by a publication that never committed", async () => {
    const ReportSnapshot = h.model("ReportSnapshot");
    /* What a crash between the Mongo insert and the PostgreSQL commit leaves behind */
    await ReportSnapshot.collection.insertOne({
      tenantId: h.tenant.id,
      kind: "EXAM",
      sourceId: t.term2.id,
      studentId: crypto.randomUUID(),
      version: 2,
      publicationId: crypto.randomUUID(),
      publishedAt: new Date()
    });
    const revised = await post(`${A}/exams/${t.term2.id}/result-publication/versions`, {});
    assert.match(revised.message, /^Term 2 results re-published as version 2/);
    /* The orphan stays in MongoDB (nothing is ever deleted) but nobody sees it */
    const listed = await get(`${A}/report-cards/snapshots?examId=${t.term2.id}&version=2&limit=100`);
    assert.equal(listed.meta.total, 7);
    assert.ok(listed.data.every(snapshot => snapshot.integrity === "VERIFIED"));
  });

  it("never ranks or averages students whose marks are incomplete", async () => {
    const { assignRanks, statisticsOf } =
      await import("../../src/modules/academics/result-policies/services/resultEngine.service.js");
    const policy = {
      rankingMethod: "COMPETITION",
      gradingMode: "MARKS",
      rankFailedStudents: false,
      percentageDecimals: 2
    };
    const rows = [
      { result: "INCOMPLETE", percentage: 45, subjects: [] },
      { result: "PASS", percentage: 40, subjects: [] }
    ];
    assignRanks(policy, rows);
    assert.deepEqual(
      rows.map(r => r.rank),
      [null, 1]
    );
    const stats = statisticsOf(policy, rows);
    assert.equal(stats.highestPercentage, 40);
    assert.equal(stats.incomplete, 1);
  });

  it("analyses the exam with compartments on the dashboard and in exports", async () => {
    const { data } = await get(`${R}/dashboards/academics?examId=${t.term1.id}`);
    assert.deepEqual([data.overall.passed, data.overall.compartment, data.overall.failed], [6, 1, 0]);
    assert.deepEqual([data.toppers[0].studentId, data.toppers[0].gpa], [t.ed.id, 10]);
    assert.ok(data.bySection.every(s => s.policy.name === "Board Secondary"));

    const csv = (
      await request("GET", `${R}/exports/results?format=csv&examId=${t.term1.id}&sectionId=${t.s10A.id}`)
    ).buffer.toString();
    const [header, ...rows] = csv.trim().split("\r\n");
    assert.equal(
      header,
      "Roll no.,Student,AR,BI (/100),CH (/100),CS (/100),PH (/100),Total,%,Grade,Result,Rank,GPA,Grace,Class rank"
    );
    assert.ok(rows.some(r => r.endsWith("Frbo Lrbo,B,64,70,34,46+2,182,60.7,C1,PASS,4,6.27,2,5")));
  });
});

describe("results: weighted assessment schemes", () => {
  it("validates weights and exams", async () => {
    const create = body => request("POST", `${A}/assessment-schemes`, { body });
    const unbalanced = await create({
      name: "x",
      exams: [
        { examId: t.term1.id, weight: 40 },
        { examId: t.term2.id, weight: 50 }
      ]
    });
    assert.equal(unbalanced.status, 400);
    assert.equal(unbalanced.body.message, "Invalid request: exams weights must add up to 100");
    const repeated = await create({
      name: "x",
      exams: [
        { examId: t.term1.id, weight: 50 },
        { examId: t.term1.id, weight: 50 }
      ]
    });
    assert.equal(repeated.status, 400);
    const nextYear = (
      await post(`${A}/exams`, { examName: "Next year test" }, { headers: { "x-academic-year-id": world.y2.id } })
    ).data;
    const otherYear = await create({
      name: "x",
      exams: [
        { examId: t.term1.id, weight: 50 },
        { examId: nextYear.id, weight: 50 }
      ]
    });
    assert.equal(otherYear.status, 422);
    assert.equal(
      otherYear.body.message,
      "Next year test belongs to another academic year; a scheme combines exams of one year"
    );
    assert.equal(
      (
        await request("POST", `${A}/assessment-schemes`, {
          as: h.tokens.teacher,
          body: { name: "x", exams: [{ examId: t.term1.id, weight: 100 }] }
        })
      ).status,
      403
    );
  });

  it("combines Term 1 (40%) and Term 2 (60%) with GPA and CGPA", async () => {
    const created = await post(`${A}/assessment-schemes`, {
      name: "Annual",
      exams: [
        { examId: t.term1.id, weight: 40 },
        { examId: t.term2.id, weight: 60 }
      ]
    });
    assert.equal(created.message, "Assessment scheme Annual created: Term 1 40% + Term 2 60%");
    t.annual = created.data;

    const sheet = await get(`${A}/assessment-schemes/${t.annual.id}/results?sectionId=${t.s10A.id}`);
    assert.equal(sheet.data.policy.source, "CLASS");
    const ana = sheet.data.students.find(s => s.studentId === t.ana.id);
    /* Physics 0.4 x 88 + 0.6 x 90 = 89.2; Chemistry 93.4; Computer 89 (best 3) */
    assert.deepEqual(
      ana.subjects.map(l => [l.subject.subjectCode, l.percentage, l.counted]),
      [
        ["BI", 82, false],
        ["CH", 93.4, true],
        ["CS", 89, true],
        ["PH", 89.2, true]
      ]
    );
    assert.deepEqual(
      ana.subjects.find(l => l.subject.subjectCode === "PH").exams.map(e => [e.examName, e.weight, e.percentage]),
      [
        ["Term 1", 40, 88],
        ["Term 2", 60, 90]
      ]
    );
    /* CGPA: every subject's grade points of both terms, credit-weighted: 241 / 26 */
    assert.deepEqual([ana.percentage, ana.grade, ana.gpa, ana.cgpa, ana.result], [90.5, "A2", 9.4, 9.27, "PASS"]);
    assert.equal(ana.coScholastic[0].grade, "A");

    const di = sheet.data.students.find(s => s.studentId === t.di.id);
    const biology = di.subjects.find(l => l.subject.subjectCode === "BI");
    assert.deepEqual(
      [biology.percentage, biology.exams.map(e => [e.status, e.percentage])],
      [
        65,
        [
          ["ABSENT", null],
          ["PRESENT", 65]
        ]
      ],
      "the medical absence drops Term 1 and Term 2 carries the whole weight"
    );
    assert.equal(di.percentage, 65.9);

    const denied = await request("GET", `${A}/assessment-schemes/${t.annual.id}/results?sectionId=${t.s10B.id}`, {
      as: h.tokens.teacher2
    });
    assert.equal(denied.status, 403);
    /* Weighted report cards are the class teacher's too (D-11) */
    await get(`${A}/assessment-schemes/${t.annual.id}/results?sectionId=${t.s10A.id}`, { as: h.tokens.ct10 });
    await get(`${A}/assessment-schemes/${t.annual.id}/results?sectionId=${t.s10A.id}`, { as: h.tokens.teacher2 }, 403);
    await get(`${A}/assessment-schemes/${t.annual.id}/students/${t.ana.id}/pdf`, { as: h.tokens.teacher2 }, 403);
    const card = await get(`${A}/assessment-schemes/${t.annual.id}/students/${t.ana.id}`);
    assert.deepEqual([card.data.report.kind, card.data.report.cgpa], ["SCHEME", 9.27]);
    await pdfOk(`${A}/assessment-schemes/${t.annual.id}/students/${t.ana.id}/pdf`);

    const preview = await post(`${A}/assessment-schemes/${t.annual.id}/previews`, { policyId: t.passFail.id }, {}, 200);
    assert.ok(preview.data.sections.every(s => s.students.every(row => row.gpa === null)));
  });

  it("publishes the scheme; families see both report cards", async () => {
    const published = await post(`${A}/assessment-schemes/${t.annual.id}/result-publication`, {}, {}, 200);
    assert.equal(published.message, "Annual results published (version 1, 7 report cards)");
    await post(`${A}/assessment-schemes/${t.annual.id}/result-publication`, {}, {}, 409);

    const cards = await get(`${ME}/students/${t.ana.id}/report-cards`, { as: h.tokens.rana });
    assert.deepEqual(
      cards.data.reports.map(r => [r.kind, r.kind === "EXAM" ? r.exam.examName : r.scheme.name]).sort(),
      [
        ["EXAM", "Term 1"],
        ["EXAM", "Term 2"],
        ["SCHEME", "Annual"]
      ]
    );
    const annual = cards.data.reports.find(r => r.kind === "SCHEME");
    assert.deepEqual([annual.cgpa, annual.rank], [9.27, null]);
    await pdfOk(`${ME}/students/${t.ana.id}/report-cards/pdf?schemeId=${t.annual.id}`, h.tokens.rana);
    await get(`${ME}/students/${t.ana.id}/report-cards/pdf`, { as: h.tokens.rana }, 400);

    const comparison = await get(`${A}/assessment-schemes/${t.annual.id}/result-publication/comparison`);
    assert.equal(comparison.data.summary.changed, 0);
    const busy = await request("DELETE", `${A}/assessment-schemes/${t.annual.id}`);
    assert.equal(busy.status, 409);
    assert.equal(busy.body.message, "Annual has published results. Withdraw them before removing the scheme.");
    const withdrawn = await del(`${A}/assessment-schemes/${t.annual.id}/result-publication`);
    assert.match(withdrawn.message, /^Annual results withdrawn: version 1 is hidden/);
    assert.equal(
      (await get(`${A}/assessment-schemes/${t.annual.id}/result-publication/versions`)).data[0].status,
      "WITHDRAWN"
    );
    await post(`${A}/assessment-schemes/${t.annual.id}/result-publication`, {}, {}, 200);
  });
});

describe("results: tamper-proof report snapshots", () => {
  const currentTerm1 = async () => {
    const versions = await get(`${A}/exams/${t.term1.id}/result-publication/versions`);
    return versions.data.find(v => v.status === "CURRENT").version;
  };
  const integrity = async version =>
    (await get(`${A}/exams/${t.term1.id}/result-publication/versions/${version}/integrity`)).data;

  it("verifies a published version end to end", async () => {
    const version = await currentTerm1();
    const report = await get(`${A}/exams/${t.term1.id}/result-publication/versions/${version}/integrity`);
    assert.equal(report.data.intact, true);
    assert.equal(report.message, `Version ${version} is intact: all 7 report card(s) match their seals`);
    await get(
      `${A}/exams/${t.term1.id}/result-publication/versions/${version}/integrity`,
      { as: h.tokens.teacher2 },
      403
    );
    await get(`${A}/exams/${t.term1.id}/result-publication/versions/99/integrity`, {}, 404);
  });

  it("detects a report card edited directly in the database and never shows it", async () => {
    const ReportSnapshot = h.model("ReportSnapshot");
    const version = await currentTerm1();
    const target = await ReportSnapshot.findOne({
      tenantId: h.tenant.id,
      sourceId: t.term1.id,
      version,
      studentId: t.bo.id
    }).lean();
    /* Someone with database access (not the application) turns a FAIL into a PASS */
    await ReportSnapshot.collection.updateOne(
      { _id: target._id },
      { $set: { "report.result": target.report.result === "PASS" ? "FAIL" : "PASS", "report.percentage": 99 } }
    );

    const check = await integrity(version);
    assert.equal(check.intact, false);
    assert.deepEqual(check.tampered, [t.bo.id]);

    const family = await get(`${ME}/students/${t.bo.id}/report-cards?examId=${t.term1.id}`, { as: h.tokens.rbo }, 404);
    assert.ok(family);
    const pdf = await request("GET", `${ME}/students/${t.bo.id}/report-cards/pdf?examId=${t.term1.id}`, {
      as: h.tokens.rbo
    });
    assert.equal(pdf.status, 409);
    assert.equal(
      pdf.body.message,
      "This report card failed its integrity check and cannot be shown. The school has been alerted."
    );

    const staff = await get(`${A}/report-cards/snapshots/${String(target._id)}`);
    assert.equal(staff.data.integrity, "TAMPERED");
    assert.equal((await request("GET", `${A}/report-cards/snapshots/${String(target._id)}/pdf`)).status, 409);

    /* Copying a valid seal from another student does not help: the seal binds the student */
    const other = await ReportSnapshot.findOne({
      tenantId: h.tenant.id,
      sourceId: t.term1.id,
      version,
      studentId: { $ne: t.bo.id }
    }).lean();
    await ReportSnapshot.collection.updateOne({ _id: target._id }, { $set: { seal: other.seal } });
    assert.deepEqual((await integrity(version)).tampered, [t.bo.id]);

    /* The school re-publishes: a fresh, sealed version replaces the bad one for families */
    await post(`${A}/exams/${t.term1.id}/result-publication/versions`, {});
    const cards = await get(`${ME}/students/${t.bo.id}/report-cards?examId=${t.term1.id}`, { as: h.tokens.rbo });
    assert.equal(cards.data.reports.length, 1);
    assert.equal((await integrity(version + 1)).intact, true);
  });

  it("detects deleted and forged report cards", async () => {
    const ReportSnapshot = h.model("ReportSnapshot");
    const version = await currentTerm1();
    const docs = await ReportSnapshot.find({ tenantId: h.tenant.id, sourceId: t.term1.id, version }).lean();
    const [gone, template] = docs;
    await ReportSnapshot.collection.deleteOne({ _id: gone._id });
    const { _id, ...copy } = template;
    await ReportSnapshot.collection.insertOne({ ...copy, studentId: crypto.randomUUID() });

    const check = await integrity(version);
    assert.equal(check.intact, false);
    assert.deepEqual(check.missing, [gone.studentId]);
    assert.equal(check.unexpected.length, 1);
    assert.match(
      (await get(`${A}/exams/${t.term1.id}/result-publication/versions/${version}/integrity`)).message,
      /FAILED its integrity check: 0 changed, 1 missing, 1 not part of the publication$/
    );
  });
});

describe("results: teacher assessment buckets", () => {
  const AS = `${A}/assessments`;
  const scheme = () => `${A}/assessment-schemes/${t.withTeachers.id}`;
  const by = () => ({ as: h.tokens.teacher2 });
  const sheet = async () => (await get(`${scheme()}/results?sectionId=${t.s10A.id}`)).data;
  const rowIn = (data, key) => data.students.find(s => s.studentId === t[key].id);
  const subjectIn = (row, code) => row.subjects.find(l => l.subject.subjectCode === code);
  const bucketOf = line => line.exams.find(e => e.kind === "BUCKET");
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.06, `${actual} is not ${expected}`);
  const record = (itemId, marks, status = 200) => post(`${AS}/${itemId}/marks`, { marks }, by(), status);

  it("weighs exams and a teacher bucket that add up to 100", async () => {
    const body = weight => ({
      name: "With teachers",
      exams: [
        { examId: t.term1.id, weight: 40 },
        { examId: t.term2.id, weight: 40 }
      ],
      buckets: [{ name: "Teacher assessments", weight }]
    });
    const over = await request("POST", `${A}/assessment-schemes`, { body: body(30) });
    assert.equal(over.status, 400);
    assert.equal(over.body.message, "Invalid request: exams weights must add up to 100");

    const created = await post(`${A}/assessment-schemes`, body(20));
    assert.equal(
      created.message,
      "Assessment scheme With teachers created: Term 1 40% + Term 2 40% + Teacher assessments 20%"
    );
    t.withTeachers = created.data;
    t.bucket = created.data.buckets[0];
    const buckets = await get(`${AS}/buckets`, by());
    assert.ok(buckets.data.some(b => b.id === t.bucket.id && b.weight === 20 && !b.locked));
  });

  it("lets a teacher add items only for what they teach", async () => {
    const body = {
      bucketId: t.bucket.id,
      sectionId: t.s10A.id,
      subjectId: t.CH.id,
      assessmentType: "TEST",
      title: "Class test 1",
      maxMarks: 20
    };
    await post(AS, { ...body, subjectId: t.PH.id }, by(), 403);
    await post(AS, body, { as: h.tokens.teacher }, 403);
    await post(AS, { ...body, assessmentType: "HOMEWORK" }, by(), 422);
    const test = await post(AS, body, by());
    assert.equal(test.message, "Class test 1 added to Teacher assessments");
    t.test1 = test.data;
    t.assignment = (await post(AS, { ...body, assessmentType: "ASSIGNMENT", title: "Assignment 1", maxMarks: 10 }, by())).data;

    await record(t.test1.id, [{ studentId: t.ana.id, marksObtained: 21 }], 422);
    await record(t.test1.id, [{ studentId: t.ed.id, marksObtained: 5 }], 422);
    await record(t.test1.id, [{ studentId: t.bo.id, status: "ABSENT", marksObtained: 5 }], 400);
    const saved = await record(t.test1.id, [
      { studentId: t.ana.id, marksObtained: 15 },
      { studentId: t.bo.id, status: "ABSENT" },
      { studentId: t.cy.id, status: "EXEMPT" },
      { studentId: t.di.id, marksObtained: 10 }
    ]);
    assert.equal(saved.message, "Marks saved: 4 recorded, 0 updated");
    await record(t.assignment.id, [{ studentId: t.ana.id, marksObtained: 10 }]);

    const sheetOfMarks = await get(`${AS}/${t.test1.id}/marks`, by());
    assert.deepEqual(
      sheetOfMarks.data.students.filter(s => s.status).map(s => [s.status, s.marksObtained, s.percentage]),
      [
        ["MARKED", 15, 75],
        ["ABSENT", null, 0],
        ["EXEMPT", null, null],
        ["MARKED", 10, 50]
      ]
    );
  });

  it("averages a student's items into the bucket's weight", async () => {
    const data = await sheet();
    assert.deepEqual(
      data.scheme.exams.map(e => [e.examName, e.weight, e.kind ?? "EXAM"]),
      [
        ["Term 1", 40, "EXAM"],
        ["Term 2", 40, "EXAM"],
        ["Teacher assessments", 20, "BUCKET"]
      ]
    );
    /* Ana: (75 + 100) / 2; Bo absent and no assignment: 0; Cy exempt from the test, nothing on the assignment: 0; Di: (50 + 0) / 2 */
    assert.deepEqual(
      ["ana", "bo", "cy", "di"].map(key => bucketOf(subjectIn(rowIn(data, key), "CH")).percentage),
      [87.5, 0, 0, 25]
    );
    const chemistry = subjectIn(rowIn(data, "ana"), "CH");
    const [t1, t2] = chemistry.exams.filter(e => !e.kind).map(e => e.percentage);
    close(chemistry.percentage, (40 * t1 + 40 * t2 + 20 * 87.5) / 100);

    /* Physics has no items: the bucket drops out and the exams share its weight */
    const physics = subjectIn(rowIn(data, "ana"), "PH");
    assert.equal(bucketOf(physics), undefined);
    const [p1, p2] = physics.exams.map(e => e.percentage);
    close(physics.percentage, (p1 + p2) / 2);
  });

  it("leaves out items that don't count, and counts graded homework", async () => {
    await patch(`${AS}/${t.assignment.id}`, { counts: false }, by());
    const homework = {
      sectionId: t.s10A.id,
      subjectId: t.CH.id,
      title: "Lab report",
      dueDate: addDays(todayIn("Asia/Kolkata"), 3),
      bucketId: t.bucket.id
    };
    await post(`${A}/homework`, homework, by(), 422);
    const given = (await post(`${A}/homework`, { ...homework, maxMarks: 10 }, by())).data;
    assert.equal(given.assessment.bucket.id, t.bucket.id);
    assert.equal(given.assessment.assessmentType, "HOMEWORK");
    t.labItem = given.assessment;

    const form = new FormData();
    form.append("content", "My lab report");
    const submitted = await request("POST", `${ME}/homework/${given.id}/submission`, { as: h.tokens.rana, form });
    assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
    await post(`${A}/homework/${given.id}/submissions/${submitted.body.data.id}/grading`, { marksAwarded: 5 }, by(), 200);

    await record(t.labItem.id, [{ studentId: t.bo.id, marksObtained: 5 }], 422);
    await record(t.labItem.id, [{ studentId: t.bo.id, status: "EXEMPT" }]);
    await del(`${AS}/${t.labItem.id}`, by(), 409);
    assert.equal((await get(`${A}/homework/${given.id}`, by())).data.assessment.id, t.labItem.id);

    /* Ana: test 75, lab 50; Bo: test absent, exempt from the lab; Di: test 50, lab not submitted */
    const data = await sheet();
    assert.deepEqual(
      ["ana", "bo", "di"].map(key => bucketOf(subjectIn(rowIn(data, key), "CH")).percentage),
      [62.5, 0, 25]
    );
  });

  it("keeps buckets that have items, and locks them once results are published", async () => {
    const busy = await request("PATCH", scheme(), {
      body: {
        exams: [
          { examId: t.term1.id, weight: 50 },
          { examId: t.term2.id, weight: 50 }
        ],
        buckets: []
      }
    });
    assert.equal(busy.status, 409);
    assert.match(busy.body.message, /^Teacher assessments has 3 teacher assessment\(s\)/);
    const unbalanced = await request("PATCH", scheme(), {
      body: { buckets: [{ id: t.bucket.id, name: "Teacher assessments", weight: 30 }] }
    });
    assert.equal(unbalanced.status, 422);
    assert.equal(unbalanced.body.message, "Exam and bucket weights must add up to 100 (they add up to 110)");

    const renamed = await patch(scheme(), {
      exams: [
        { examId: t.term1.id, weight: 30 },
        { examId: t.term2.id, weight: 40 }
      ],
      buckets: [{ id: t.bucket.id, name: "Internal assessment", weight: 30 }]
    });
    assert.equal(renamed.message, "Assessment scheme With teachers updated: Term 1 30% + Term 2 40% + Internal assessment 30%");
    assert.equal(renamed.data.buckets[0].id, t.bucket.id);
    assert.equal((await get(`${AS}?bucketId=${t.bucket.id}`, by())).meta.total, 3);
    assert.equal((await get(AS, { as: h.tokens.teacher })).meta.total, 0);

    await post(`${scheme()}/result-publication`, {}, {}, 200);
    const locked = await request("POST", `${AS}/${t.test1.id}/marks`, {
      as: h.tokens.teacher2,
      body: { marks: [{ studentId: t.ana.id, marksObtained: 20 }] }
    });
    assert.equal(locked.status, 409);
    assert.equal(locked.body.message, "With teachers results are published. Withdraw them to change its teacher assessments.");
    assert.ok((await get(`${AS}/buckets`, by())).data.find(b => b.id === t.bucket.id).locked);

    await del(`${scheme()}/result-publication`);
    const removed = await del(`${AS}/${t.assignment.id}`, by());
    assert.equal(removed.message, "Assignment 1 removed");
  });
});

