import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, isoWeekday } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, del, person, settleJobs, tokenFor } from "../helpers/harness.js";

/* Substitution planning (D-79), in the current year (2026-27), on dates relative to today:
   `target` is the next working day; the today block runs only when today is one.
     Class 9-S, 9-T (this suite's)
     tAbs   Subs Maths in 9-S, Periods 1 and 2: on (auto-approved) leave on `target`
     tAbs2  Subs Maths in 9-T, Period 1: on leave on `target`
     tFree  Subs Art in 9-S (assigned, nothing timetabled): free all day
     tBusy  Subs Art in 9-T, Period 1
     tOther no assignment, nothing timetabled */

const A = "/api/v1/academics";
const SUB = `${A}/substitutions`;
const HR = "/api/v1/hr";
const ME = "/api/v1/me";
const t = {};

const put = (body, as = h.tokens.admin) => request("PUT", SUB, { as, body });
const planOn = async (date, as) => (await get(`${SUB}?date=${date}`, as && { as })).data;
const absentees = (plan, teacher) => plan.absentTeachers.find(row => row.teacher.id === teacher.id);
const inbox = async token => (await get(`${ME}/notifications?limit=100&type=SUBSTITUTION`, { as: token })).data;

const classFor = async level => {
  const existing = (await get(`${A}/classes?limit=100`)).data.find(c => c.level === level);
  return existing ?? (await post(`${A}/classes`, { level })).data;
};

describe("substitutions: setup", () => {
  it("creates two sections, their lessons on the next working day, and the teachers", async () => {
    const now = (await get(SUB)).data;
    t.today = now.today;
    t.todayWorking = now.workingDay;
    for (let i = 1; i <= 14 && !t.target; i++) {
      const date = addDays(t.today, i);
      if ((await planOn(date)).workingDay) t.target = date;
    }
    assert.ok(t.target, "a working day in the next two weeks");

    const c9 = await classFor("GRADE_9");
    t.s9S = (await post(`${A}/sections`, { classId: c9.id, sectionName: "S" })).data;
    t.s9T = (await post(`${A}/sections`, { classId: c9.id, sectionName: "T" })).data;
    t.maths = (await post(`${A}/subjects`, { subjectName: "Subs Maths", subjectCode: "SBMA" })).data;
    t.art = (await post(`${A}/subjects`, { subjectName: "Subs Art", subjectCode: "SBAR" })).data;
    for (const section of [t.s9S, t.s9T]) {
      for (const subject of [t.maths, t.art]) {
        await post(`${A}/section-subjects`, { sectionId: section.id, subjectId: subject.id });
      }
    }
    for (const key of ["tAbs", "tAbs2", "tFree", "tBusy", "tOther"]) {
      t[key] = (await post("/api/v1/users/teachers", { user: person(`subs-${key}`) })).data;
      h.tokens[`subs-${key}`] = tokenFor(t[key].userId, "TEACHER");
    }
    const assign = (teacher, section, subject) =>
      post(`${A}/teacher-assignments`, { teacherId: teacher.id, sectionId: section.id, subjectId: subject.id });
    await assign(t.tAbs, t.s9S, t.maths);
    await assign(t.tAbs2, t.s9T, t.maths);
    await assign(t.tFree, t.s9S, t.art);
    await assign(t.tBusy, t.s9T, t.art);

    /* The target's weekday, and today's when it is a working day on another weekday */
    const weekdays = [...new Set([t.target, t.todayWorking && t.today].filter(Boolean).map(isoWeekday))];
    t.slots = {};
    for (const weekday of weekdays) {
      const slot = async (section, period, subject, teacher) =>
        (
          await post(`${A}/timetable/slots`, {
            sectionId: section.id,
            weekday,
            periodId: period.id,
            subjectId: subject.id,
            teacherId: teacher.id
          })
        ).data;
      t.slots[weekday] = {
        sP1: await slot(t.s9S, world.p1, t.maths, t.tAbs),
        sP2: await slot(t.s9S, world.p2, t.maths, t.tAbs),
        tP1: await slot(t.s9T, world.p1, t.maths, t.tAbs2),
        busyP2: await slot(t.s9T, world.p2, t.art, t.tBusy)
      };
    }
    t.at = t.slots[isoWeekday(t.target)];

    t.student = (
      await post("/api/v1/users/students", {
        user: person("subs-student"),
        parents: [],
        enrollment: { academicYearId: world.y1.id, sectionId: t.s9S.id }
      })
    ).data;

    /* Leave that needs no approval marks the target day LEAVE at once */
    t.leaveType = (
      await post(`${HR}/leave-types`, { name: "Substitution test leave", code: "SBL", annualQuotaDays: 20, requiresApproval: false })
    ).data;
    for (const key of ["tAbs", "tAbs2"]) {
      const leave = await request("POST", `${HR}/leave-requests`, {
        as: h.tokens[`subs-${key}`],
        body: { leaveTypeId: t.leaveType.id, fromDate: t.target, toDate: t.target, reason: "Family function" }
      });
      assert.equal(leave.status, 201, JSON.stringify(leave.body));
      assert.equal(leave.body.data.status, "APPROVED");
    }
  });
});

describe("substitutions: the day's plan", () => {
  it("lists every lesson of an absent teacher as needing cover", async () => {
    const plan = await planOn(t.target);
    assert.equal(plan.editable, true);
    const tAbs = absentees(plan, t.tAbs);
    assert.equal(tAbs.status, "LEAVE");
    assert.equal(tAbs.onLeave, true);
    assert.deepEqual(
      tAbs.periods.map(p => [p.period.name, p.section.name, p.subject.subjectName, p.status, p.plan]),
      [
        ["Period 1", "Class 9-S", "Subs Maths", "NEEDED", null],
        ["Period 2", "Class 9-S", "Subs Maths", "NEEDED", null]
      ]
    );
    assert.equal(absentees(plan, t.tAbs2).periods.length, 1);
    assert.equal(absentees(plan, t.tFree), undefined, "teachers who are present are not listed");
    assert.ok(plan.counts.needed >= 3);
  });

  it("shows the periods still to plan on the home page", async () => {
    const summary = (await get(`${SUB}/summary`)).data;
    assert.equal(summary.date, t.today);
    assert.equal(summary.next.date, t.target);
    assert.ok(summary.next.needed >= 3);
    assert.ok(summary.next.absentTeachers >= 2);
  });

  it("ranks the teachers who could cover a lesson", async () => {
    const { teachers } = (await get(`${SUB}/candidates?date=${t.target}&timetableSlotId=${t.at.sP1.id}`)).data;
    const row = teacher => teachers.find(x => x.teacherId === teacher.id);
    assert.equal(row(t.tAbs), undefined, "never the absent teacher");
    assert.equal(row(t.tAbs2).available, false);
    assert.equal(row(t.tAbs2).unavailableReason, "they are on leave then");
    assert.deepEqual(
      [row(t.tFree).available, row(t.tFree).teachesSection, row(t.tFree).lessonsThatDay],
      [true, true, 0]
    );
    assert.equal(row(t.tOther).available, true);
    assert.equal(row(t.tOther).teachesSection, false);
    const order = teachers.map(x => x.teacherId);
    assert.ok(order.indexOf(t.tFree.id) < order.indexOf(t.tOther.id), "who teaches the section comes first");
    assert.ok(order.indexOf(t.tOther.id) < order.indexOf(t.tAbs2.id), "who is free comes before who is not");

    const p2 = (await get(`${SUB}/candidates?date=${t.target}&timetableSlotId=${t.at.sP2.id}`)).data.teachers;
    const busy = p2.find(x => x.teacherId === t.tBusy.id);
    assert.equal(busy.available, false);
    assert.equal(busy.unavailableReason, "they teach Subs Art in Class 9-T then");
  });
});

describe("substitutions: planning", () => {
  it("assigns a substitute, idempotently per lesson and date, and tells them", async () => {
    const first = await put({ date: t.target, timetableSlotId: t.at.sP1.id, kind: "SUBSTITUTE", substituteTeacherId: t.tFree.id });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.data.status, "SUBSTITUTE");
    assert.equal(first.body.data.plan.substitute.id, t.tFree.id);
    const name = first.body.data.plan.substitute.name;
    assert.equal(first.body.message, `${name} substitutes: Period 1 of Class 9-S on ${t.target}`);

    const again = await put({
      date: t.target,
      timetableSlotId: t.at.sP1.id,
      kind: "SUBSTITUTE",
      substituteTeacherId: t.tFree.id,
      subjectId: t.art.id,
      note: "Art instead of Maths"
    });
    assert.equal(again.status, 200);
    assert.match(again.body.message, /\(plan changed\)$/);
    assert.equal(again.body.data.plan.subject.subjectName, "Subs Art");
    assert.equal(again.body.data.plan.id, first.body.data.plan.id);

    await settleJobs();
    const notes = await inbox(h.tokens["subs-tFree"]);
    assert.equal(notes.length, 2, "assigned, then the subject changed");
    assert.match(notes[0].title, /^Substitution: Period 1 of Class 9-S on /);
  });

  it("refuses a teacher who is busy, away or already covering then", async () => {
    const busy = await put({ date: t.target, timetableSlotId: t.at.sP2.id, kind: "SUBSTITUTE", substituteTeacherId: t.tBusy.id });
    assert.equal(busy.status, 409);
    assert.match(busy.body.message, /cannot take Period 2 of Class 9-S on .*: they teach Subs Art in Class 9-T then$/);

    const away = await put({ date: t.target, timetableSlotId: t.at.sP1.id, kind: "SUBSTITUTE", substituteTeacherId: t.tAbs2.id });
    assert.equal(away.status, 409);

    const twice = await put({ date: t.target, timetableSlotId: t.at.tP1.id, kind: "SUBSTITUTE", substituteTeacherId: t.tFree.id });
    assert.equal(twice.status, 409);
    assert.match(twice.body.message, /they already cover Class 9-S then$/);
  });

  it("gives the lesson to another teacher and tells the first one", async () => {
    const moved = await put({ date: t.target, timetableSlotId: t.at.sP1.id, kind: "SUBSTITUTE", substituteTeacherId: t.tOther.id });
    assert.equal(moved.status, 200);
    await settleJobs();
    const notes = await inbox(h.tokens["subs-tFree"]);
    assert.match(notes[0].title, /^Substitution cancelled: Period 1 of Class 9-S on /);
    assert.equal((await inbox(h.tokens["subs-tOther"])).length, 1);

    /* tFree is free in Period 1 again */
    const ok = await put({ date: t.target, timetableSlotId: t.at.tP1.id, kind: "SUBSTITUTE", substituteTeacherId: t.tFree.id });
    assert.equal(ok.status, 201);
  });

  it("plans an activity, leisure, and refuses NOT_NEEDED for a whole-day leave", async () => {
    const activity = await put({ date: t.target, timetableSlotId: t.at.sP2.id, kind: "ACTIVITY", activity: "Library" });
    assert.equal(activity.status, 201);
    assert.equal(activity.body.message, `Library: Period 2 of Class 9-S on ${t.target}`);
    assert.equal(activity.body.data.plan.substitute, null);

    const notNeeded = await put({ date: t.target, timetableSlotId: t.at.sP2.id, kind: "NOT_NEEDED" });
    assert.equal(notNeeded.status, 422);
    assert.match(notNeeded.body.message, /is on leave for the whole day/);

    const plan = await planOn(t.target);
    assert.deepEqual(
      absentees(plan, t.tAbs).periods.map(p => p.status),
      ["SUBSTITUTE", "ACTIVITY"]
    );
  });

  it("validates what each kind needs, and plans only absent teachers' lessons on coming days", async () => {
    const bad = async (body, status, pattern) => {
      const res = await put({ date: t.target, timetableSlotId: t.at.sP2.id, ...body });
      assert.equal(res.status, status, JSON.stringify(res.body));
      if (pattern) assert.match(JSON.stringify(res.body), pattern);
    };
    await bad({ kind: "SUBSTITUTE" }, 400, /substituteTeacherId/);
    await bad({ kind: "ACTIVITY" }, 400, /activity/);
    await bad({ kind: "LEISURE", activity: "Games" }, 400, /activity/);
    await bad({ kind: "ACTIVITY", activity: "Games", subjectId: t.art.id }, 400, /subjectId/);
    await bad({ kind: "LEISURE", substituteTeacherId: t.tOther.id }, 400, /substituteTeacherId/);
    await bad({ kind: "SUBSTITUTE", substituteTeacherId: t.tAbs.id }, 422, /is the absent teacher/);
    await bad({ kind: "SUBSTITUTE", substituteTeacherId: t.tOther.id, subjectId: world.english.id }, 422, /subject taught in Class 9-S/);

    const present = await put({ date: t.target, timetableSlotId: t.at.busyP2.id, kind: "LEISURE" });
    assert.equal(present.status, 422);
    assert.match(present.body.message, /is not away for Period 2 of Class 9-T/);

    const past = await put({ date: addDays(t.today, -1), timetableSlotId: t.at.sP2.id, kind: "LEISURE" });
    assert.equal(past.status, 422);
    assert.match(past.body.message, /today or a later date/);
  });

  it("is ADMIN's to plan; PRINCIPAL reads it; a teacher sees their own duties", async () => {
    await get(`${SUB}?date=${t.target}`, { as: h.tokens.principal });
    const principal = await put({ date: t.target, timetableSlotId: t.at.sP2.id, kind: "LEISURE" }, h.tokens.principal);
    assert.equal(principal.status, 403);
    await get(`${SUB}?date=${t.target}`, { as: h.tokens["subs-tOther"] }, 403);
    await get(`${SUB}/summary`, { as: h.tokens["subs-tOther"] }, 403);

    const mine = (await get(`${SUB}/mine`, { as: h.tokens["subs-tOther"] })).data;
    assert.deepEqual(
      mine.duties.map(d => [d.date, d.period.name, d.section.name, d.kind, d.lessonSubject.subjectName, d.absentTeacher.id]),
      [[t.target, "Period 1", "Class 9-S", "SUBSTITUTE", "Subs Maths", t.tAbs.id]]
    );
    await get(`${SUB}/mine`, {}, 403);
  });

  it("cancels a plan: the lesson needs cover again", async () => {
    const plan = await planOn(t.target);
    const p2 = absentees(plan, t.tAbs).periods[1];
    const cancelled = await del(`${SUB}/${p2.plan.id}`);
    assert.equal(cancelled.message, `Plan cancelled: Period 2 of Class 9-S on ${t.target} needs cover again`);
    assert.equal(absentees(await planOn(t.target), t.tAbs).periods[1].status, "NEEDED");
    await del(`${SUB}/${p2.plan.id}`, {}, 404);
  });

  it("lists a plan apart once its teacher is no longer away", async () => {
    const leave = (await get(`${HR}/leave-requests?userId=${t.tAbs2.userId}`)).data[0];
    await post(`${HR}/leave-requests/${leave.id}/cancellation`, { reason: "Plans changed" }, {}, 200);
    const plan = await planOn(t.target);
    assert.equal(absentees(plan, t.tAbs2), undefined);
    const stale = plan.noLongerNeeded.find(row => row.timetableSlotId === t.at.tP1.id);
    assert.equal(stale.substitute.id, t.tFree.id);
    assert.equal(stale.absentTeacher.id, t.tAbs2.id);
  });
});

describe("substitutions: today's registers", () => {
  it("lets the planned substitute take the register; an unplanned lesson is leisure", async context => {
    if (!t.todayWorking) return context.skip("today is not a working day");
    const today = t.slots[isoWeekday(t.today)];
    await post(`${HR}/staff-attendance`, { date: t.today, records: [{ userId: t.tAbs.userId, status: "ABSENT" }] });
    const planned = await put({ date: t.today, timetableSlotId: today.sP1.id, kind: "SUBSTITUTE", substituteTeacherId: t.tOther.id });
    assert.equal(planned.status, 201, JSON.stringify(planned.body));

    const as = h.tokens["subs-tOther"];
    const register = `${A}/attendance/register?sectionId=${t.s9S.id}&date=${t.today}&kind=PERIOD&periodNumber=1`;
    await get(register, { as });
    const cover = (await get(`${A}/attendance/cover`, { as })).data;
    assert.ok(cover.sections.some(s => s.id === t.s9S.id && s.covering));
    const periods = (await get(`${A}/attendance/cover/${t.s9S.id}`, { as })).data.periods;
    assert.equal(periods.find(p => p.periodNumber === 1).planned.substitute.id, t.tOther.id);

    const records = [{ studentId: t.student.id, status: "PRESENT" }];
    const taken = await request("POST", `${A}/attendance`, {
      as,
      body: { sectionId: t.s9S.id, date: t.today, kind: "PERIOD", periodNumber: 1, records }
    });
    assert.equal(taken.status, 201, JSON.stringify(taken.body));
    const p2 = await request("POST", `${A}/attendance`, {
      as,
      body: { sectionId: t.s9S.id, date: t.today, kind: "PERIOD", periodNumber: 2, records }
    });
    assert.equal(p2.status, 403, "not planned for Period 2");

    const missing = (await get(`${A}/attendance/missing-registers?sectionId=${t.s9S.id}&from=${t.today}&to=${t.today}`)).data;
    assert.equal(missing.registers.filter(r => r.periodNumber <= 2).length, 0);
    const leisure = missing.freePeriods.find(r => r.periodNumber === 2);
    assert.equal(leisure.free.leisure, true);
    assert.match(leisure.free.reason, /^Leisure: .+ was away and nobody was planned to cover it$/);
  });
});
