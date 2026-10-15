import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, patch, del, settleJobs, tokenFor } from "../helpers/harness.js";

const A = "/api/v1/academics";
const ME = "/api/v1/me";

/* Smallest valid PNG (1×1) */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);
const PDF = Buffer.from("%PDF-1.4\n%test document\n");

const upload = (url, { bytes, type, name, fields = {}, as = h.tokens.office, method = "POST" }) => {
  const form = new FormData();
  if (bytes) form.append("file", new Blob([bytes], { type }), name);
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return request(method, url, { as, form });
};

/* Follow a signed download link through the test server */
const fetchSigned = url => request("GET", new URL(url).pathname, { as: null });

describe("files", () => {
  it("stores student documents with type rules", async () => {
    const doc = await upload("/api/v1/files", {
      bytes: PDF,
      type: "application/pdf",
      name: "Birth Certificate (copy).pdf",
      fields: { ownerType: "STUDENT", ownerId: world.s3.id, category: "DOCUMENT", description: "Birth certificate" }
    });
    assert.equal(doc.status, 201, JSON.stringify(doc.body));
    assert.equal(doc.body.message, "Birth Certificate (copy).pdf uploaded successfully");
    assert.equal(doc.body.data.storageKey, undefined, "storage keys are never exposed");
    world.studentDoc = doc.body.data;

    const exe = await upload("/api/v1/files", {
      bytes: PDF,
      type: "application/x-msdownload",
      name: "x.exe",
      fields: { ownerType: "GENERAL", category: "DOCUMENT" }
    });
    assert.equal(exe.status, 400);
    const pdfAsPhoto = await upload("/api/v1/files", {
      bytes: PDF,
      type: "application/pdf",
      name: "x.pdf",
      fields: { ownerType: "STUDENT", ownerId: world.s3.id, category: "PHOTO" }
    });
    assert.equal(pdfAsPhoto.status, 400);
    assert.match(pdfAsPhoto.body.message, /A photo cannot be application\/pdf/);

    const disguised = await upload("/api/v1/files", {
      bytes: Buffer.from("<html><script>alert(1)</script></html>"),
      type: "image/png",
      name: "cat.png",
      fields: { ownerType: "STUDENT", ownerId: world.s3.id, category: "PHOTO" }
    });
    assert.equal(disguised.status, 400);
    assert.equal(disguised.body.message, "The content of cat.png is not a valid image/png file");

    const stranger = await upload("/api/v1/files", {
      bytes: PDF,
      type: "application/pdf",
      name: "x.pdf",
      fields: { ownerType: "STUDENT", ownerId: crypto.randomUUID(), category: "DOCUMENT" }
    });
    assert.equal(stranger.status, 422);
    const teacher = await upload("/api/v1/files", {
      bytes: PDF,
      type: "application/pdf",
      name: "x.pdf",
      fields: { ownerType: "GENERAL", category: "DOCUMENT" },
      as: h.tokens.teacher
    });
    assert.equal(teacher.status, 403);
  });

  it("serves files only through short-lived signed links", async () => {
    const list = await get(`/api/v1/files?ownerType=STUDENT&ownerId=${world.s3.id}`);
    assert.equal(list.meta.total, 1);

    const link = await get(`/api/v1/files/${world.studentDoc.id}/download-url`);
    const file = await fetchSigned(link.data.url);
    assert.equal(file.status, 200);
    assert.deepEqual(file.buffer, PDF);
    assert.match(file.headers.get("content-disposition"), /attachment; filename=/);

    const tampered = await request("GET", `${new URL(link.data.url).pathname}x`, { as: null });
    assert.equal(tampered.status, 404);

    await del(`/api/v1/files/${world.studentDoc.id}`);
    assert.equal((await fetchSigned(link.data.url)).status, 404, "bytes are gone");
  });

  it("brands PDFs with the school logo", async () => {
    const res = await upload("/api/v1/administration/settings/logo", {
      bytes: PNG,
      type: "image/png",
      name: "logo.png",
      as: h.tokens.admin,
      method: "PUT"
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.data.logoUrl);
    assert.deepEqual((await fetchSigned(res.body.data.logoUrl)).buffer, PNG);

    const card = await request("GET", `${A}/report-cards/students/${world.s1.id}/pdf?examId=${world.exam.id}`);
    assert.equal(card.status, 200);
    assert.equal(card.buffer.subarray(0, 4).toString(), "%PDF");
  });
});

describe("homework", () => {
  const dueIn3 = () => addDays(todayIn("Asia/Kolkata"), 3);

  it("lets teachers set homework only for what they teach", async () => {
    const homework = await post(
      `${A}/homework`,
      {
        sectionId: world.s1A.id,
        subjectId: world.math.id,
        title: "Fractions worksheet",
        description: "Pages 12-14",
        dueDate: dueIn3(),
        maxMarks: 10
      },
      { as: h.tokens.teacher }
    );
    assert.equal(homework.message, "Homework set successfully");
    assert.equal(homework.data.teacherId, world.teacher.id);
    world.homework = homework.data;

    await post(
      `${A}/homework`,
      { sectionId: world.s1A.id, subjectId: world.math.id, title: "x", dueDate: dueIn3() },
      { as: h.tokens.teacher2 },
      403
    );
    await post(
      `${A}/homework`,
      { sectionId: world.s2A.id, subjectId: world.english.id, title: "x", dueDate: dueIn3() },
      {},
      422
    );
    await post(
      `${A}/homework`,
      { sectionId: world.s1A.id, subjectId: world.math.id, title: "x", dueDate: "2020-01-01" },
      {},
      422
    );

    const attached = await upload(`${A}/homework/${world.homework.id}/attachments`, {
      bytes: PDF,
      type: "application/pdf",
      name: "worksheet.pdf",
      as: h.tokens.teacher
    });
    assert.equal(attached.status, 201);
    world.homeworkFile = attached.body.data;

    const list = await get(`${A}/homework?sectionId=${world.s1A.id}`, { as: h.tokens.teacher });
    assert.equal(list.meta.total, 1);
    assert.deepEqual(list.data[0].submissions, { submitted: 0, graded: 0 });
    await get(`${A}/homework?sectionId=${world.s2A.id}`, { as: h.tokens.teacher }, 403);
  });

  it("shows homework to students and parents with attachments", async () => {
    await settleJobs();
    const mine = await get(`${ME}/students/${world.s1.id}/homework?status=pending`, { as: h.tokens.student1 });
    assert.equal(mine.meta.total, 1);
    assert.equal(mine.data[0].myStatus, "NOT_SUBMITTED");

    const detail = await get(`${ME}/students/${world.s1.id}/homework/${world.homework.id}`, { as: h.tokens.student1 });
    assert.equal(detail.data.attachments.length, 1);
    const link = await get(
      `${ME}/students/${world.s1.id}/homework/${world.homework.id}/attachments/${world.homeworkFile.id}/download-url`,
      { as: h.tokens.student1 }
    );
    assert.deepEqual((await fetchSigned(link.data.url)).buffer, PDF);

    const children = await get(`${ME}/students/${world.s2.id}/homework`, { as: h.tokens.mother });
    assert.equal(children.meta.total, 1);
    await get(`${ME}/students/${world.s3.id}/homework/${world.homework.id}`, { as: h.tokens.mother }, 404);

    const notices = (await get(`${ME}/notifications?type=MESSAGE&limit=50`, { as: h.tokens.student1 })).data;
    assert.ok(notices.some(n => n.title === "New Mathematics homework: Fractions worksheet"));
  });

  it("accepts submissions, resubmissions and grading", async () => {
    const first = await upload(`${ME}/homework/${world.homework.id}/submission`, {
      bytes: PDF,
      type: "application/pdf",
      name: "answers.pdf",
      fields: { content: "My answers are attached" },
      as: h.tokens.student1
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.message, "Homework submitted");
    world.submission = first.body.data;

    const again = await upload(`${ME}/homework/${world.homework.id}/submission`, {
      fields: { content: "Corrected answers" },
      as: h.tokens.student1
    });
    assert.equal(again.status, 200);
    assert.equal(again.body.message, "Homework submitted again");

    const parent = await upload(`${ME}/homework/${world.homework.id}/submission`, {
      fields: { content: "x" },
      as: h.tokens.mother
    });
    assert.equal(parent.status, 403);
    const empty = await upload(`${ME}/homework/${world.homework.id}/submission`, { as: h.tokens.student1 });
    assert.equal(empty.status, 422);

    const roster = await get(`${A}/homework/${world.homework.id}/submissions`, { as: h.tokens.teacher });
    const s1 = roster.data.students.find(s => s.studentId === world.s1.id);
    assert.equal(s1.status, "SUBMITTED");
    assert.ok(roster.data.students.filter(s => s.status === "NOT_SUBMITTED").length >= 1);

    const fileLink = await get(
      `${A}/homework/${world.homework.id}/submissions/${world.submission.id}/attachments/${world.submission.attachments[0].id}/download-url`,
      { as: h.tokens.teacher }
    );
    assert.deepEqual((await fetchSigned(fileLink.data.url)).buffer, PDF);

    await post(
      `${A}/homework/${world.homework.id}/submissions/${world.submission.id}/grading`,
      { marksAwarded: 11 },
      { as: h.tokens.teacher },
      422
    );
    const graded = await post(
      `${A}/homework/${world.homework.id}/submissions/${world.submission.id}/grading`,
      { marksAwarded: 8, feedback: "Good work" },
      { as: h.tokens.teacher },
      200
    );
    assert.equal(graded.message, "Submission graded");

    const locked = await upload(`${ME}/homework/${world.homework.id}/submission`, {
      fields: { content: "late change" },
      as: h.tokens.student1
    });
    assert.equal(locked.status, 409);

    await settleJobs();
    const notices = (await get(`${ME}/notifications?type=MESSAGE&limit=50`, { as: h.tokens.student1 })).data;
    assert.ok(notices.some(n => n.body === '"Fractions worksheet" has been graded: 8/10.'));
  });

  it("enforces due dates and protects submitted homework", async () => {
    await h.pool.query("UPDATE homework_assignments SET assigned_on = $1, due_date = $1 WHERE id = $2", [
      "2026-07-01",
      world.homework.id
    ]);
    const late = await upload(`${ME}/homework/${world.homework.id}/submission`, {
      fields: { content: "late" },
      as: tokenFor(world.s2.userId, "STUDENT")
    });
    assert.equal(late.status, 422);
    assert.equal(late.body.message, "The due date (2026-07-01) has passed");

    await patch(`${A}/homework/${world.homework.id}`, { allowLateSubmission: true }, { as: h.tokens.teacher });
    const allowed = await upload(`${ME}/homework/${world.homework.id}/submission`, {
      fields: { content: "late" },
      as: tokenFor(world.s2.userId, "STUDENT")
    });
    assert.equal(allowed.status, 201);
    assert.equal(allowed.body.message, "Homework submitted (late)");

    await del(`${A}/homework/${world.homework.id}`, { as: h.tokens.teacher }, 409);
  });
});
