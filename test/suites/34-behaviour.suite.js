import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, request, get, post, patch, del, settleJobs } from "../helpers/harness.js";

/* academics/behaviour-remarks and portal/behaviour: a student's behaviour log book.
   teacher is class teacher of 1-A, teacher2 teaches English there; s1 is in 1-A (mother's
   child), s3 in 2-A (no teacher of ours). Leaves a few remarks for the API matrix. */

const R = "/api/v1/academics/behaviour-remarks";
const ME = "/api/v1/me";

const t = {};
const inYear = (as = h.tokens.admin) => ({ as, headers: { "x-academic-year-id": world.s1A.academicYearId } });
const remark = (studentId, extra = {}) => ({
  studentId,
  occurredOn: "2026-07-15",
  kind: "CONCERN",
  category: "PUNCTUALITY",
  remark: "Late to class three days this week",
  ...extra
});
const log = (studentId, as) => get(`${ME}/students/${studentId}/behaviour-remarks`, inYear(as));

describe("Behaviour log book", () => {
  it("records remarks, checking the date and the values", async () => {
    const praise = await post(
      R,
      remark(world.s1.id, { kind: "APPRECIATION", category: "KINDNESS", remark: "Helped a new classmate settle in" }),
      inYear()
    );
    assert.equal(praise.message, "Behaviour remark recorded");
    assert.equal(praise.data.sectionId, world.s1A.id);
    assert.equal(praise.data.canEdit, true);
    assert.equal(praise.data.acknowledgedAt, null);
    assert.ok(praise.data.recorder.firstName);
    t.praise = praise.data;

    const future = await request("POST", R, { ...inYear(), body: remark(world.s1.id, { occurredOn: "2099-01-01" }) });
    assert.equal(future.status, 422);
    assert.match(future.body.message, /cannot be in the future/);
    const before = await request("POST", R, { ...inYear(), body: remark(world.s1.id, { occurredOn: "2020-01-01" }) });
    assert.equal(before.status, 422);
    assert.match(before.body.message, /must be within/);
    const badCategory = await request("POST", R, { ...inYear(), body: remark(world.s1.id, { category: "GOSSIP" }) });
    assert.equal(badCategory.status, 400);
    const noText = await request("POST", R, { ...inYear(), body: remark(world.s1.id, { remark: "  " }) });
    assert.equal(noText.status, 400);
  });

  it("lets any teacher record, even outside their sections; families can't", async () => {
    t.concern = (await post(R, remark(world.s1.id, { actionTaken: "Spoke to the student" }), inYear(h.tokens.teacher))).data;
    assert.equal(t.concern.actionTaken, "Spoke to the student");
    /* A duty teacher writing about a student of a section they don't teach */
    t.dutyNote = (
      await post(R, remark(world.s3.id, { kind: "NOTE", category: "SAFETY", remark: "Running on the stairs" }), inYear(h.tokens.teacher2))
    ).data;
    assert.equal(t.dutyNote.sectionId, world.s2A.id);
    assert.equal((await request("POST", R, { ...inYear(h.tokens.mother), body: remark(world.s1.id) })).status, 403);
    assert.equal((await request("POST", R, { ...inYear(h.tokens.student1), body: remark(world.s1.id) })).status, 403);
  });

  it("shows teachers their sections' remarks and their own", async () => {
    const ids = rows => rows.map(r => r.id);
    const byClassTeacher = (await get(R, inYear(h.tokens.teacher))).data;
    assert.ok(ids(byClassTeacher).includes(t.praise.id) && ids(byClassTeacher).includes(t.concern.id));
    assert.ok(!ids(byClassTeacher).includes(t.dutyNote.id));
    /* The admin's remark is readable but not the teacher's to change */
    assert.equal(byClassTeacher.find(r => r.id === t.praise.id).canEdit, false);
    assert.equal(byClassTeacher.find(r => r.id === t.concern.id).canEdit, true);

    const byDutyTeacher = (await get(R, inYear(h.tokens.teacher2))).data;
    assert.ok(ids(byDutyTeacher).includes(t.dutyNote.id) && ids(byDutyTeacher).includes(t.concern.id));
    await get(`${R}/${t.dutyNote.id}`, { as: h.tokens.teacher }, 404);

    const filtered = (await get(`${R}?studentId=${world.s1.id}&kind=APPRECIATION`, inYear())).data;
    assert.deepEqual(ids(filtered), [t.praise.id]);
    /* Newest first */
    const all = (await get(`${R}?studentId=${world.s1.id}`, inYear())).data;
    assert.equal(all.length, 2);
  });

  it("lets only the author, the principal or an admin change a remark", async () => {
    const other = await request("PATCH", `${R}/${t.concern.id}`, { ...inYear(h.tokens.teacher2), body: { remark: "x" } });
    assert.equal(other.status, 403);
    assert.match(other.body.message, /Only the teacher who wrote this remark/);
    const own = await patch(`${R}/${t.concern.id}`, { remark: "Late to class twice this week", actionTaken: "" }, inYear(h.tokens.teacher));
    assert.equal(own.data.remark, "Late to class twice this week");
    assert.equal(own.data.actionTaken, null);
    await patch(`${R}/${t.dutyNote.id}`, { category: "DISCIPLINE" }, inYear(h.tokens.principal));
  });

  it("summarises a student's year", async () => {
    const summary = (await get(`${R}/students/${world.s1.id}/summary`, inYear())).data;
    assert.deepEqual(summary.counts, { APPRECIATION: 1, NOTE: 0, CONCERN: 1, INCIDENT: 0 });
    assert.equal(summary.total, 2);
    assert.equal(summary.unacknowledged, 2);
    assert.equal(summary.lastOn, "2026-07-15");
    /* A teacher counts only what they may read */
    const s3 = (await get(`${R}/students/${world.s3.id}/summary`, inYear(h.tokens.teacher))).data;
    assert.equal(s3.total, 0);
  });

  it("tells the student and the parents", async () => {
    await settleJobs();
    const inbox = (await get(`${ME}/notifications?limit=100`, { as: h.tokens.mother })).data;
    assert.ok(inbox.some(n => n.title.startsWith("Appreciation for ")));
    assert.ok(inbox.some(n => /^Concern recorded for /.test(n.title)));
  });

  it("shows the log book to the student and the parent; the parent acknowledges", async () => {
    const own = await log(world.s1.id, h.tokens.student1);
    assert.equal(own.data.length, 2);
    assert.equal((await request("GET", `${ME}/students/${world.s3.id}/behaviour-remarks`, inYear(h.tokens.mother))).status, 404);

    const ack = (id, as = h.tokens.mother) => request("POST", `${ME}/students/${world.s1.id}/behaviour-remarks/${id}/acknowledgement`, { as });
    assert.equal((await ack(t.concern.id, h.tokens.student1)).status, 403);
    const first = await ack(t.concern.id);
    assert.equal(first.status, 200);
    assert.equal(first.body.message, "Remark acknowledged; thank you");
    assert.ok(first.body.data.acknowledgedAt);
    assert.ok(first.body.data.acknowledger.firstName);
    const again = await ack(t.concern.id);
    assert.equal(again.body.message, "This remark was already acknowledged");
    assert.equal(again.body.data.acknowledgedAt, first.body.data.acknowledgedAt);
    /* Another child's remark through this child's path */
    assert.equal((await request("POST", `${ME}/students/${world.s1.id}/behaviour-remarks/${t.dutyNote.id}/acknowledgement`, { as: h.tokens.mother })).status, 404);

    const waiting = (await get(`${ME}/students/${world.s1.id}/behaviour-remarks?unacknowledged=true`, inYear(h.tokens.mother))).data;
    assert.deepEqual(waiting.map(r => r.id), [t.praise.id]);
    const summary = (await get(`${ME}/students/${world.s1.id}/behaviour-remarks/summary`, inYear(h.tokens.mother))).data;
    assert.equal(summary.unacknowledged, 1);
  });

  it("asks for a new acknowledgement after an edit, and removes remarks", async () => {
    const edited = await patch(`${R}/${t.concern.id}`, { kind: "INCIDENT" }, inYear(h.tokens.teacher));
    assert.equal(edited.data.acknowledgedAt, null);
    assert.match(edited.message, /acknowledge it again/);

    await request("DELETE", `${R}/${t.dutyNote.id}`, inYear(h.tokens.teacher)).then(res => assert.equal(res.status, 404));
    await del(`${R}/${t.dutyNote.id}`, inYear(h.tokens.teacher2));
    await get(`${R}/${t.dutyNote.id}`, {}, 404);
  });
});
