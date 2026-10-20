import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, request, get, post, patch, del, settleJobs } from "../helpers/harness.js";

/* academics/diary and portal/diary: each section's daily diary, signed by parents.
   teacher is class teacher of 1-A (and teaches Maths there), teacher2 teaches English in 1-A;
   s1 is in 1-A (mother's child), s3 in 2-A. Leaves a few lines for the API matrix. */

const D = "/api/v1/academics/diary";
const ME = "/api/v1/me";
const DAY = "2026-07-15";
const NEXT = "2026-07-16";

const t = {};
const inYear = (as = h.tokens.admin) => ({ as, headers: { "x-academic-year-id": world.s1A.academicYearId } });
const line = (extra = {}) => ({
  sectionId: world.s1A.id,
  entryDate: DAY,
  kind: "CLASSWORK",
  subjectId: world.english.id,
  body: "Read chapter 4, The Honest Woodcutter",
  ...extra
});
const write = (body, as, status) => post(`${D}/entries`, body, inYear(as), status);
const attempt = (body, as) => request("POST", `${D}/entries`, { ...inYear(as), body });
const day = (date = DAY, as) => get(`${D}/sections/${world.s1A.id}/day?date=${date}`, inYear(as));
const familyDay = (date = DAY, as = h.tokens.mother) => get(`${ME}/students/${world.s1.id}/diary/day?date=${date}`, inYear(as));
const sign = (body, as = h.tokens.mother) =>
  request("PUT", `${ME}/students/${world.s1.id}/diary/signature`, { ...inYear(as), body });

describe("Daily diary", () => {
  it("lets subject teachers write lines for their subjects", async () => {
    const classwork = await write(line(), h.tokens.teacher2);
    assert.equal(classwork.message, "Written in the diary");
    assert.equal(classwork.data.subject.subjectName, "English");
    assert.equal(classwork.data.canEdit, true);
    assert.ok(classwork.data.writer.firstName);
    t.classwork = classwork.data;
    t.homework = (
      await write(line({ kind: "HOMEWORK", body: "Write five sentences about honesty" }), h.tokens.teacher2)
    ).data;

    /* teacher2 doesn't teach Maths in 1-A, nor any section-wide line */
    const notTheirs = await attempt(line({ subjectId: world.math.id }), h.tokens.teacher2);
    assert.equal(notTheirs.status, 403);
    const general = await attempt(line({ kind: "REMINDER", subjectId: undefined, body: "Bring crayons" }), h.tokens.teacher2);
    assert.equal(general.status, 403);
    assert.match(general.body.message, /class teacher or the deputy/);
    /* No section of theirs at all */
    assert.equal((await attempt(line({ sectionId: world.s2A.id, subjectId: world.english.id }), h.tokens.teacher)).status, 403);
    assert.equal((await attempt(line(), h.tokens.mother)).status, 403);
  });

  it("lets the class teacher write reminders and notes, and checks the values", async () => {
    t.reminder = (
      await write(line({ kind: "REMINDER", subjectId: undefined, body: "Bring crayons for art tomorrow" }), h.tokens.teacher)
    ).data;
    assert.equal(t.reminder.subjectId, null);
    t.personal = (
      await write(
        line({ kind: "NOTE", subjectId: undefined, studentId: world.s1.id, body: "Please sign the trip consent form" }),
        h.tokens.teacher
      )
    ).data;
    assert.equal(t.personal.studentId, world.s1.id);

    const noSubject = await attempt(line({ subjectId: undefined }));
    assert.equal(noSubject.status, 400);
    const personalClasswork = await attempt(line({ studentId: world.s1.id }));
    assert.equal(personalClasswork.status, 400);
    const otherSection = await attempt(line({ kind: "NOTE", subjectId: undefined, studentId: world.s3.id }));
    assert.equal(otherSection.status, 422);
    assert.match(otherSection.body.message, /not in this section/);
    const future = await attempt(line({ entryDate: "2099-01-01" }));
    assert.equal(future.status, 422);
    const outside = await attempt(line({ entryDate: "2020-01-01" }));
    assert.match(outside.body.message, /must be within/);
    assert.equal((await attempt(line({ body: "  " }))).status, 400);
  });

  it("shows a section's day with the online homework and signature counts", async () => {
    const res = (await day(DAY, h.tokens.teacher)).data;
    assert.deepEqual(
      res.entries.map(e => e.id),
      [t.classwork.id, t.homework.id, t.reminder.id, t.personal.id]
    );
    /* The class teacher reads teacher2's lines but doesn't change them */
    assert.equal(res.entries.find(e => e.id === t.classwork.id).canEdit, false);
    assert.equal(res.signatures.signed, 0);
    assert.ok(res.signatures.students >= 1);
    assert.ok(Array.isArray(res.homework));
    /* Not a section of teacher2's? 1-A is theirs; 2-A is not visible to the class teacher of 1-A */
    assert.equal((await request("GET", `${D}/sections/${world.s2A.id}/day?date=${DAY}`, inYear(h.tokens.teacher))).status, 403);
    const days = (await get(`${D}/sections/${world.s1A.id}/days?from=2026-07-01&to=2026-07-31`, inYear())).data;
    assert.deepEqual(days, [{ date: DAY, entries: 4, signed: 0 }]);
    const tooLong = await request("GET", `${D}/sections/${world.s1A.id}/days?from=2026-06-01&to=2026-12-31`, inYear());
    assert.equal(tooLong.status, 400);
  });

  it("lets only the author, the principal or an admin change a line", async () => {
    const other = await request("PATCH", `${D}/entries/${t.classwork.id}`, { ...inYear(h.tokens.teacher), body: { body: "x" } });
    assert.equal(other.status, 403);
    const own = await patch(`${D}/entries/${t.classwork.id}`, { body: "Read chapter 4 aloud in pairs" }, inYear(h.tokens.teacher2));
    assert.equal(own.data.body, "Read chapter 4 aloud in pairs");
    /* Classwork can't lose its subject */
    const bare = await request("PATCH", `${D}/entries/${t.classwork.id}`, { ...inYear(h.tokens.teacher2), body: { subjectId: null } });
    assert.equal(bare.status, 422);
    await patch(`${D}/entries/${t.reminder.id}`, { body: "Bring crayons and an old newspaper" }, inYear(h.tokens.principal));
  });

  it("shows families their child's day, notes to other children left out", async () => {
    const other = (
      await write(line({ kind: "NOTE", subjectId: undefined, studentId: world.s1.id, entryDate: NEXT, body: "Well done today" }), h.tokens.teacher)
    ).data;
    t.next = other;
    const res = (await familyDay()).data;
    assert.deepEqual(
      res.entries.map(e => e.id),
      [t.classwork.id, t.homework.id, t.reminder.id, t.personal.id]
    );
    assert.equal(res.signature, null);
    /* The student reads it too; another family's child is hidden */
    assert.equal((await familyDay(DAY, h.tokens.student1)).data.entries.length, 4);
    assert.equal((await request("GET", `${ME}/students/${world.s3.id}/diary/day?date=${DAY}`, inYear(h.tokens.mother))).status, 404);
    const days = (await get(`${ME}/students/${world.s1.id}/diary/days?from=2026-07-01&to=2026-07-31`, inYear(h.tokens.mother))).data;
    assert.deepEqual(
      days.map(d => [d.date, d.entries, d.signedAt]),
      [
        [NEXT, 1, null],
        [DAY, 4, null]
      ]
    );
  });

  it("lets a parent sign the day with a note to the teacher", async () => {
    assert.equal((await sign({ date: DAY }, h.tokens.student1)).status, 403);
    assert.equal((await sign({ date: "2099-01-01" })).status, 422);
    const first = await sign({ date: DAY, note: "Consent form signed and in the bag" });
    assert.equal(first.status, 200);
    assert.equal(first.body.message, "Diary signed; thank you");
    assert.equal(first.body.data.parentNote, "Consent form signed and in the bag");
    assert.ok(first.body.data.signer.firstName);

    const staffDay = (await day(DAY, h.tokens.teacher)).data;
    assert.equal(staffDay.signatures.signed, 1);
    assert.equal(staffDay.signatures.notes, 1);
    const roster = (await get(`${D}/sections/${world.s1A.id}/signatures?date=${DAY}`, inYear(h.tokens.teacher))).data;
    const s1 = roster.find(r => r.studentId === world.s1.id);
    assert.equal(s1.signature.parentNote, "Consent form signed and in the bag");
    assert.equal(s1.changedSinceSigned, false);
    assert.equal((await familyDay()).data.changedSinceSigned, false);
  });

  it("flags a day changed after it was signed, and signs again", async () => {
    await patch(`${D}/entries/${t.homework.id}`, { body: "Write five sentences about honesty, in ink" }, inYear(h.tokens.teacher2));
    assert.equal((await familyDay()).data.changedSinceSigned, true);
    const days = (await get(`${ME}/students/${world.s1.id}/diary/days?from=${DAY}&to=${DAY}`, inYear(h.tokens.mother))).data;
    assert.equal(days[0].changedSinceSigned, true);

    const again = await sign({ date: DAY });
    assert.equal(again.body.message, "Diary signed again");
    assert.equal(again.body.data.parentNote, null);
    assert.equal((await familyDay()).data.changedSinceSigned, false);
  });

  it("tells families about reminders and notes, and teachers about parents' notes", async () => {
    await settleJobs();
    const inbox = (await get(`${ME}/notifications?limit=100`, { as: h.tokens.mother })).data;
    assert.ok(inbox.some(n => /^Reminder in .*'s diary$/.test(n.title)));
    assert.ok(inbox.some(n => n.title.startsWith("Diary note about ")));
    /* Classwork and homework lines don't notify */
    assert.ok(!inbox.some(n => /^(Classwork|Homework) in /.test(n.title)));
    const teacherInbox = (await get(`${ME}/notifications?limit=100`, { as: h.tokens.teacher })).data;
    assert.ok(teacherInbox.some(n => n.title.startsWith("Diary note from ")));
  });

  it("removes lines", async () => {
    assert.equal((await request("DELETE", `${D}/entries/${t.next.id}`, inYear(h.tokens.teacher2))).status, 403);
    await del(`${D}/entries/${t.next.id}`, inYear(h.tokens.teacher));
    assert.equal((await familyDay(NEXT)).data.entries.length, 0);
  });
});
