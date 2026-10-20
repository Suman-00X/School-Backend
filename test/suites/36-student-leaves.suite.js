import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, isoWeekday } from "../../src/common/utils/date.util.js";
import { h, world, request, get, patch, settleJobs } from "../helpers/harness.js";

/* academics/student-leaves and portal/leave-requests: a parent applies for their child's
   leave, the class teacher decides. teacher is class teacher of 1-A, teacher2 teaches
   English there; s1 is in 1-A (mother's child), s3 in 2-A (not hers). Leaves requests in
   every status for the API matrix. */

const L = "/api/v1/academics/student-leaves";
const ME = "/api/v1/me";
const A = "/api/v1/academics";

const t = {};
const today = new Date().toISOString().slice(0, 10);
/* The Monday at least `weeks` weeks ahead: Monday to Friday are school days */
const monday = weeks => {
  const ahead = addDays(today, weeks * 7);
  return addDays(ahead, (8 - isoWeekday(ahead)) % 7);
};
const apply = (body, as = h.tokens.mother, studentId = world.s1.id) =>
  request("POST", `${ME}/students/${studentId}/leave-requests`, {
    as,
    body: { reasonCategory: "ILLNESS", reason: "Fever since last night", ...body }
  });
const decide = (id, body, as = h.tokens.teacher) => request("POST", `${L}/${id}/decision`, { as, body });
const inbox = async (token, type) =>
  (await get(`${ME}/notifications?limit=100${type ? `&type=${type}` : ""}`, { as: token })).data;

/* Records s1's mark in the register of `date` that the school's mode takes then */
const recordS1 = async (date, status) => {
  const day = (await get(`${A}/attendance/register?sectionId=${world.s1A.id}&date=${date}`)).data;
  const register =
    day.mode === "DAILY"
      ? { kind: "DAY" }
      : day.mode === "TWO_SESSIONS"
        ? { kind: "FORENOON" }
        : { kind: "PERIOD", periodNumber: day.registers[0]?.periodNumber };
  if (register.kind === "PERIOD" && !register.periodNumber) return null;
  const res = await request("POST", `${A}/attendance`, {
    body: { sectionId: world.s1A.id, date, ...register, records: [{ studentId: world.s1.id, status }] }
  });
  assert.ok([200, 201].includes(res.status), JSON.stringify(res.body));
  return register;
};

describe("Student leave", () => {
  it("lets a parent apply for their child, checking the dates", async () => {
    t.window = (await get(`${A}/attendance/policy`)).data.editWindowDays;
    await patch(`${A}/attendance/policy`, { editWindowDays: 2 });

    const from = monday(2);
    const res = await apply({ fromDate: from, toDate: addDays(from, 2) });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.message, "Leave applied; the class teacher will review it");
    const leave = res.body.data;
    assert.equal(leave.status, "PENDING");
    assert.equal(leave.days, 3);
    assert.equal(leave.session, "FULL_DAY");
    assert.equal(leave.sectionId, world.s1A.id);
    assert.equal(leave.canCancel, true);
    assert.ok(leave.requester.firstName);
    t.pending = leave;

    /* One day: toDate defaults to fromDate; a half day is for one date */
    const half = await apply({ fromDate: monday(4), session: "AFTERNOON", reasonCategory: "MEDICAL", reason: "Dentist" });
    assert.equal(half.status, 201);
    assert.equal(half.body.data.toDate, monday(4));
    assert.equal(half.body.data.days, 0.5);
    t.half = half.body.data;
    assert.equal((await apply({ fromDate: monday(5), toDate: addDays(monday(5), 1), session: "FORENOON" })).status, 400);
    assert.equal((await apply({ fromDate: monday(5), toDate: addDays(monday(5), -1) })).status, 400);
    assert.equal((await apply({ fromDate: monday(5), reasonCategory: "BORED" })).status, 400);
    assert.equal((await apply({ fromDate: monday(5), reason: " " })).status, 400);
  });

  it("refuses overlaps, closed days, old days and other people's children", async () => {
    const overlap = await apply({ fromDate: addDays(t.pending.fromDate, 1), session: "FORENOON" });
    assert.equal(overlap.status, 409);
    assert.match(overlap.body.message, /already a pending leave request/);
    /* The other half of a half-day leave's date is free */
    const otherHalf = await apply({ fromDate: t.half.fromDate, session: "FORENOON" });
    assert.equal(otherHalf.status, 201);
    t.otherHalf = otherHalf.body.data;
    assert.equal((await apply({ fromDate: t.half.fromDate })).status, 409);

    const sunday = await apply({ fromDate: addDays(monday(6), -1) });
    assert.equal(sunday.status, 422);
    assert.match(sunday.body.message, /school is closed/);
    const old = await apply({ fromDate: addDays(today, -10) });
    assert.equal(old.status, 422);
    assert.match(old.body.message, /up to 2 days back/);
    const long = await apply({ fromDate: monday(6), toDate: addDays(monday(6), 70) });
    assert.equal(long.status, 422);
    assert.match(long.body.message, /at most 60 days/);
    assert.equal((await apply({ fromDate: "2030-01-07" })).status, 422);

    assert.equal((await apply({ fromDate: monday(6) }, h.tokens.mother, world.s3.id)).status, 404);
    assert.equal((await apply({ fromDate: monday(6) }, h.tokens.student1)).status, 403);
    assert.equal((await apply({ fromDate: monday(6) }, h.tokens.teacher)).status, 403);
  });

  it("tells the class teacher", async () => {
    await settleJobs();
    const notes = (await inbox(h.tokens.teacher)).filter(n => n.data?.leaveRequestId === t.pending.id);
    assert.equal(notes.length, 1);
    assert.match(notes[0].title, /^Leave request: Fstudent1 Lstudent1 \(Class 1-A\)/);
  });

  it("shows teachers their sections' requests; the class teacher decides", async () => {
    const asTeacher = await get(`${L}?status=PENDING`, { as: h.tokens.teacher });
    const row = asTeacher.data.find(r => r.id === t.pending.id);
    assert.equal(row.canDecide, true);
    assert.ok(row.student.user.firstName && row.section.class.className);
    assert.equal(asTeacher.meta.pending, 3);

    const asSubjectTeacher = await get(L, { as: h.tokens.teacher2 });
    assert.equal(asSubjectTeacher.data.find(r => r.id === t.pending.id).canDecide, false);
    assert.equal(asSubjectTeacher.meta.pending, 0);
    const refused = await decide(t.pending.id, { decision: "APPROVED" }, h.tokens.teacher2);
    assert.equal(refused.status, 403);
    assert.match(refused.body.message, /class teacher or deputy/);
    assert.equal((await decide(t.pending.id, { decision: "APPROVED" }, h.tokens.mother)).status, 403);

    const noReason = await decide(t.otherHalf.id, { decision: "REJECTED" });
    assert.equal(noReason.status, 400);
    const rejected = await decide(t.otherHalf.id, { decision: "REJECTED", note: "Exam that morning" }, h.tokens.principal);
    assert.equal(rejected.status, 200);
    assert.equal(rejected.body.data.status, "REJECTED");
    assert.ok(rejected.body.data.decider.firstName);

    const approved = await decide(t.pending.id, { decision: "APPROVED", note: "Get well soon" });
    assert.equal(approved.status, 200);
    assert.equal(approved.body.message, "Leave approved");
    assert.equal(approved.body.data.excusedMarks, 0);
    assert.equal(approved.body.data.canDecide, false);
    const again = await decide(t.pending.id, { decision: "REJECTED", note: "x" });
    assert.equal(again.status, 409);
    assert.match(again.body.message, /already approved/);
  });

  it("tells the family the decision", async () => {
    await settleJobs();
    const notes = (await inbox(h.tokens.mother)).filter(n => n.data?.leaveRequestId);
    assert.ok(notes.some(n => n.title === "Leave approved for Fstudent1 Lstudent1" && /Get well soon/.test(n.body)));
    assert.ok(notes.some(n => n.title === "Leave not approved for Fstudent1 Lstudent1" && /Exam that morning/.test(n.body)));
  });

  it("excuses absences already marked, flags the register and skips the absence alert", async () => {
    await patch(`${A}/attendance/policy`, { editWindowDays: 365 });
    /* Two school days in the past, in July (holidays in the test calendar are 7-8 July) */
    const marked = "2026-07-21";
    const later = "2026-07-22";
    const register = await recordS1(marked, "ABSENT");
    if (!register) return;

    t.past = (await apply({ fromDate: marked, toDate: later, reasonCategory: "FAMILY", reason: "Grandmother's wedding anniversary" })).body.data;
    const approved = await decide(t.past.id, { decision: "APPROVED" });
    assert.equal(approved.body.message, "Leave approved; 1 absence mark changed to excused");
    const query = `sectionId=${world.s1A.id}&date=${marked}&kind=${register.kind}${register.periodNumber ? `&periodNumber=${register.periodNumber}` : ""}`;
    const after = (await get(`${A}/attendance/register?${query}`)).data.students.find(s => s.studentId === world.s1.id);
    assert.equal(after.status, "EXCUSED");
    assert.equal(after.remarks, "On approved leave");

    const onLeave = (await get(`${L}/on-leave?sectionId=${world.s1A.id}&date=${later}`, { as: h.tokens.teacher })).data;
    assert.deepEqual(onLeave.map(l => [l.studentId, l.status, l.session]), [[world.s1.id, "APPROVED", "FULL_DAY"]]);
    assert.equal((await request("GET", `${L}/on-leave?sectionId=${world.s2A.id}&date=${later}`, { as: h.tokens.teacher })).status, 403);

    /* Marked absent on a day of approved leave: the parents asked for it, so no alert */
    await recordS1(later, "ABSENT");
    await settleJobs();
    const alerts = await inbox(h.tokens.mother, "ATTENDANCE_ABSENT");
    assert.ok(!alerts.some(n => n.data?.date === later && n.data?.studentId === world.s1.id));
  });

  it("lets the parent cancel pending leave, and approved leave before it starts", async () => {
    const cancel = (id, as = h.tokens.mother) =>
      request("POST", `${ME}/students/${world.s1.id}/leave-requests/${id}/cancellation`, { as, body: { reason: "Plans changed" } });
    assert.equal((await cancel(t.half.id, h.tokens.student1)).status, 403);
    const pending = await cancel(t.half.id);
    assert.equal(pending.status, 200);
    assert.equal(pending.body.data.status, "CANCELLED");
    assert.equal(pending.body.data.cancelReason, "Plans changed");
    assert.equal((await cancel(t.half.id)).status, 409);
    assert.equal((await cancel(t.otherHalf.id)).status, 409);
    if (t.past) {
      const started = await cancel(t.past.id);
      assert.equal(started.status, 422);
      assert.match(started.body.message, /already started/);
    }

    const approved = await cancel(t.pending.id);
    assert.equal(approved.status, 200);
    await settleJobs();
    const notes = (await inbox(h.tokens.teacher)).filter(n => n.data?.leaveRequestId === t.pending.id);
    assert.ok(notes.some(n => n.title.startsWith("Leave withdrawn: Fstudent1 Lstudent1")));
  });

  it("shows the family their requests, newest days first", async () => {
    const list = await get(`${ME}/students/${world.s1.id}/leave-requests`, { as: h.tokens.student1 });
    const statuses = list.data.map(r => r.status);
    assert.ok(["CANCELLED", "REJECTED"].every(s => statuses.includes(s)));
    assert.ok(list.data.every((r, i) => i === 0 || list.data[i - 1].fromDate >= r.fromDate));
    assert.equal(list.data.find(r => r.status === "REJECTED").canCancel, false);
    const filtered = await get(`${ME}/students/${world.s1.id}/leave-requests?status=REJECTED`, { as: h.tokens.mother });
    assert.deepEqual(filtered.data.map(r => r.id), [t.otherHalf.id]);
    assert.equal((await request("GET", `${ME}/students/${world.s3.id}/leave-requests`, { as: h.tokens.mother })).status, 404);

    /* One left pending for the API matrix */
    t.open = (await apply({ fromDate: monday(8) })).body.data;
    await get(`${L}/${t.open.id}`, { as: h.tokens.teacher2 });
    await patch(`${A}/attendance/policy`, { editWindowDays: t.window });
  });
});
