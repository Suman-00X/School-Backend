import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, request, get, post, uuid } from "../helpers/harness.js";

const A = "/api/v1/academics";

describe("exams and marks", () => {
  it("creates exams and papers with validation", async () => {
    world.exam = (
      await post(`${A}/exams`, {
        examName: "Mid Term",
        examType: "INTERNAL",
        startDate: "2026-09-01",
        endDate: "2026-09-10"
      })
    ).data;
    await post(`${A}/exams`, { examName: "Bad", startDate: "2026-09-10", endDate: "2026-09-01" }, {}, 400);
    world.finalExam = (await post(`${A}/exams/bulk`, { exams: [{ examName: "Final", examType: "FINAL" }] })).data[0];
    assert.equal((await get(`${A}/exams`)).meta.total, 2);

    await post(
      `${A}/exams/${world.exam.id}/papers`,
      { sectionId: world.s1A.id, subjectId: world.math.id, maxMarks: -5 },
      {},
      400
    );
    await post(
      `${A}/exams/${world.exam.id}/papers`,
      { sectionId: world.s1A.id, subjectId: world.math.id, maxMarks: 50, passMarks: 60 },
      {},
      400
    );
    world.paper = (
      await post(`${A}/exams/${world.exam.id}/papers`, {
        sectionId: world.s1A.id,
        subjectId: world.math.id,
        maxMarks: 100,
        passMarks: 35,
        examDate: "2026-09-02"
      })
    ).data;
    assert.equal(world.paper.displayCode, "MA01-1A-INTERNAL");
    assert.equal(world.paper.maxMarks, 100);
    world.englishPaper = (
      await post(`${A}/exams/${world.exam.id}/papers`, {
        sectionId: world.s1A.id,
        subjectId: world.english.id,
        maxMarks: 50,
        passMarks: 18
      })
    ).data;
    await post(
      `${A}/exams/${world.exam.id}/papers`,
      { sectionId: world.s1A.id, subjectId: world.math.id, maxMarks: 100 },
      {},
      409
    );
    await get(`${A}/exams/${uuid()}/papers`, {}, 404);
    const papers = await get(`${A}/exams/${world.exam.id}/papers`);
    assert.equal(papers.meta.total, 2);
  });

  it("records marks idempotently with rules enforced", async () => {
    const overMax = await request("POST", `${A}/marks`, {
      body: { studentId: world.s1.id, examPaperId: world.paper.id, marksObtained: 120 }
    });
    assert.equal(overMax.status, 422);
    assert.equal(overMax.body.message, "marksObtained cannot exceed the paper's maximum of 100");
    await post(`${A}/marks`, { studentId: world.s1.id, examPaperId: world.paper.id }, {}, 400);

    assert.equal(
      (await post(`${A}/marks`, { studentId: world.s1.id, examPaperId: world.paper.id, marksObtained: 88 })).message,
      "Marks recorded successfully"
    );
    const updated = await post(
      `${A}/marks`,
      { studentId: world.s1.id, examPaperId: world.paper.id, marksObtained: 89 },
      { as: h.tokens.teacher },
      200
    );
    assert.equal(updated.message, "Marks updated successfully");
    assert.equal(updated.data.evaluatedBy, world.teacher.id);

    await post(
      `${A}/marks`,
      { studentId: world.s1.id, examPaperId: world.paper.id, marksObtained: 1 },
      { as: h.tokens.accountant },
      403
    );
  });

  it("records marks in bulk", async () => {
    const dup = [1, 2].map(() => ({ studentId: world.s1.id, examPaperId: world.paper.id, marksObtained: 50 }));
    await post(`${A}/marks/bulk`, { marks: dup }, {}, 400);

    const bulk = await post(
      `${A}/marks/bulk`,
      {
        marks: [
          { studentId: world.s1.id, examPaperId: world.paper.id, marksObtained: 90 },
          { studentId: world.s2.id, examPaperId: world.paper.id, isAbsent: true },
          { studentId: world.s1.id, examPaperId: world.englishPaper.id, marksObtained: 40 },
          { studentId: world.s2.id, examPaperId: world.englishPaper.id, marksObtained: 12 }
        ]
      },
      {},
      200
    );
    assert.deepEqual(bulk.data, { created: 3, updated: 1 });
    assert.equal(bulk.message, "Marks saved: 3 recorded, 1 updated");

    await get(`${A}/marks`, {}, 400);
    const marks = await get(`${A}/marks?studentId=${world.s1.id}&examId=${world.exam.id}`);
    assert.equal(marks.meta.total, 2);
    const math = marks.data.find(m => m.examPaperId === world.paper.id);
    assert.equal(math.marksObtained, 90);
    assert.equal(math.examPaper.exam.examName, "Mid Term");
  });
});
