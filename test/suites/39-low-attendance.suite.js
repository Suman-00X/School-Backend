import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { h, world, request, get, patch, settleJobs } from "../helpers/harness.js";

/* academics/attendance low attendance (D-85): students under the school's threshold for the
   year so far, shown to teachers (their sections) and families (the portal), and alerted once
   per fall. The registers come from the earlier suites, so expectations are read from the
   section summary and each student's own attendance rather than fixed. teacher is class
   teacher of 1-A, teacher2 teaches English there; mother has s1, s2 and others. */

const A = "/api/v1/academics";
const POLICY = `${A}/attendance/policy`;
const LOW = `${A}/attendance/low-attendance`;
const ME = "/api/v1/me";

const t = {};
const isLow = (totals, { threshold, minDays }) =>
  totals.percentage !== null && totals.countableDays >= minDays && totals.percentage < threshold;
const alerts = async token =>
  (await get(`${ME}/notifications?limit=100&type=ATTENDANCE_LOW`, { as: token })).data;
const runAlerts = async () => {
  await h.modules.jobs.enqueue("communication.lowAttendance", { tenantId: h.tenant.id });
  await settleJobs();
};
/* mother's children: s1, s2 and any a later suite linked */
const children = async () => (await get(`${ME}/students`, { as: h.tokens.mother })).data;
const ownAttendance = studentId => get(`${ME}/students/${studentId}/attendance`, { as: h.tokens.mother });

describe("Low attendance", () => {
  after(() => patch(POLICY, t.original));

  it("defaults to 75% after 10 countable days; only ADMIN changes it", async () => {
    const policy = (await get(POLICY, { as: h.tokens.teacher })).data;
    assert.equal(policy.lowAttendanceThreshold, 75);
    assert.equal(policy.lowAttendanceMinDays, 10);
    t.original = { lowAttendanceThreshold: 75, lowAttendanceMinDays: 10 };

    await patch(POLICY, { lowAttendanceThreshold: 0 }, {}, 400);
    await patch(POLICY, { lowAttendanceThreshold: 101 }, {}, 400);
    await patch(POLICY, { lowAttendanceMinDays: 0 }, {}, 400);
    await patch(POLICY, { lowAttendanceThreshold: 80 }, { as: h.tokens.principal }, 403);

    /* Strict enough that the earlier suites' registers put someone in 1-A below it */
    t.rule = { threshold: 99, minDays: 1 };
    const updated = await patch(POLICY, { lowAttendanceThreshold: 99, lowAttendanceMinDays: 1 });
    assert.equal(updated.data.lowAttendanceThreshold, 99);
  });

  it("shows teachers the students of their sections under the threshold, lowest first", async () => {
    const summary = (await get(`${A}/attendance/summary?sectionId=${world.s1A.id}`)).data;
    t.expected = summary.students.filter(s => isLow(s, t.rule)).map(s => s.studentId);
    assert.ok(t.expected.length, "the earlier suites leave someone in 1-A under 99%");

    const mine = await get(LOW, { as: h.tokens.teacher });
    assert.equal(mine.data.threshold, 99);
    assert.equal(mine.data.minDays, 1);
    const own = mine.data.sections.find(s => s.section.id === world.s1A.id);
    assert.equal(own.role, "CLASS_TEACHER");
    assert.equal(own.section.name, "Class 1-A");
    assert.deepEqual(own.students.map(s => s.studentId).sort(), [...t.expected].sort());
    const percentages = own.students.map(s => s.percentage);
    assert.deepEqual(percentages, [...percentages].sort((a, b) => a - b));
    assert.equal(mine.data.sections[0].role, "CLASS_TEACHER");
    /* Everyone low in the sections teacher leads: their digest covers these */
    t.ledLow = mine.data.sections.filter(s => s.role !== "SUBJECT").flatMap(s => s.students);
    assert.match(mine.message, /student\(s\) are below 99% attendance this year/);

    /* teacher2 only teaches English in 1-A */
    const subject = await get(LOW, { as: h.tokens.teacher2 });
    assert.equal(subject.data.sections.find(s => s.section.id === world.s1A.id).role, "SUBJECT");

    const school = await get(`${LOW}?sectionId=${world.s1A.id}`, { as: h.tokens.principal });
    assert.deepEqual(school.data.sections.map(s => [s.section.id, s.role]), [[world.s1A.id, null]]);

    await get(LOW, { as: h.tokens.student1 }, 403);
    await get(LOW, { as: h.tokens.mother }, 403);
    await get(LOW, { as: h.tokens.accountant }, 403);
  });

  it("warns the family, with how many full days bring the child back", async () => {
    const expected = [];
    const sectionOf = new Map();
    for (const child of await children()) {
      sectionOf.set(child.id, child.current?.section);
      if (child.current && isLow((await ownAttendance(child.id)).data, t.rule)) expected.push(child.id);
    }
    assert.ok(expected.length, "one of mother's children is under 99%");

    const warning = await get(`${ME}/attendance-alerts`, { as: h.tokens.mother });
    assert.deepEqual(warning.data.students.map(s => s.studentId).sort(), expected.sort());
    for (const student of warning.data.students) {
      assert.equal(student.section, sectionOf.get(student.studentId));
      const { count, unit } = student.toRecover;
      const [attended, countable] =
        unit === "PERIODS"
          ? [(await ownAttendance(student.studentId)).data.periods.attended, null]
          : [student.attendedDays, student.countableDays];
      if (unit === "DAYS") {
        /* count more full days reach 99%; one fewer does not */
        assert.ok((attended + count) / (countable + count) >= 0.99);
        assert.ok(count === 1 || (attended + count - 1) / (countable + count - 1) < 0.99);
      } else assert.ok(count >= 1 && attended >= 0);
    }

    /* Only their own: the student sees themselves */
    const self = await get(`${ME}/attendance-alerts`, { as: h.tokens.student1 });
    assert.deepEqual(
      self.data.students.map(s => s.studentId),
      expected.includes(world.s1.id) ? [world.s1.id] : []
    );
    await get(`${ME}/attendance-alerts`, { as: h.tokens.teacher }, 403);
  });

  it("alerts parents and the class teacher once per fall, and again after a recovery", async () => {
    const before = { mother: (await alerts(h.tokens.mother)).length, teacher: (await alerts(h.tokens.teacher)).length };
    const low = (await get(`${ME}/attendance-alerts`, { as: h.tokens.mother })).data.students;
    const motherLow = low.length;
    /* Under a 1% bar, every child above 0% is back above */
    const recovering = low.filter(s => s.percentage >= 1);
    assert.ok(recovering.length, "one of mother's children is above 0%");

    await runAlerts();
    const mother = await alerts(h.tokens.mother);
    assert.equal(mother.length, before.mother + motherLow);
    assert.match(mother[0].title, /attendance is below 99%$/);
    assert.match(mother[0].body, /Attending the next \d+ (school day|period)s? without a break brings it back to 99%/);
    const digest = await alerts(h.tokens.teacher);
    assert.equal(digest.length, before.teacher + 1);
    assert.match(digest[0].title, /fell below 99% attendance$/);
    assert.match(digest[0].body, /Class 1-A, \d+(\.\d)?%/);
    /* teacher2 is not the class teacher: no digest */
    assert.equal((await alerts(h.tokens.teacher2)).length, 0);

    /* Still below: nothing new */
    await runAlerts();
    assert.equal((await alerts(h.tokens.mother)).length, before.mother + motherLow);
    assert.equal((await alerts(h.tokens.teacher)).length, before.teacher + 1);

    /* Back above (a 1% bar), then below again: alerted again */
    await patch(POLICY, { lowAttendanceThreshold: 1 });
    await runAlerts();
    const flag = await h.model("LowAttendanceFlag").findOne({ studentId: recovering[0].studentId }).lean();
    assert.equal(flag.below, false);
    /* A child at 0% never left: their flag stays on and they are not alerted again */
    for (const still of low.filter(s => s.percentage < 1)) {
      assert.equal((await h.model("LowAttendanceFlag").findOne({ studentId: still.studentId }).lean()).below, true);
    }
    await patch(POLICY, { lowAttendanceThreshold: 99 });
    await runAlerts();
    assert.equal((await alerts(h.tokens.mother)).length, before.mother + motherLow + recovering.length);
    /* The class teacher hears again if a student of a section they lead fell again */
    const refell = t.ledLow.some(s => s.percentage >= 1);
    assert.equal((await alerts(h.tokens.teacher)).length, before.teacher + (refell ? 2 : 1));
  });

  it("refuses a section filter that is not an id", async () => {
    const res = await request("GET", `${LOW}?sectionId=nope`);
    assert.equal(res.status, 400);
  });
});
