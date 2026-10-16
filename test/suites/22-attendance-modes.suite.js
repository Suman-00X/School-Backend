import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, patch, person, settleJobs, tokenFor } from "../helpers/harness.js";

/* D-11 record-level scope for teachers, and the three attendance systems:
   Class 5 (5-A) takes two sessions a day, Class 6 (6-A) takes attendance period by period.
     ct5, ct6  class teachers of 5-A and 6-A
     sci6      Science in 5-A and 6-A (timetable: 6-A Thursday Period 1)
     eng6      English in 6-A (assigned), but the timetable gives Thursday Period 2 to
     sub6      who has no assignment */

const A = "/api/v1/academics";
const U = "/api/v1/users";
const R = "/api/v1/reports";
const ME = "/api/v1/me";

const t = {};

const lockWaiters = async () =>
  Number(
    (
      await h.pool.query(
        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
      )
    ).rows[0].count
  );

const record = (body, as = h.tokens.admin) => request("POST", `${A}/attendance`, { as, body });
const marks = (keys, statuses) => keys.map((key, i) => ({ studentId: t[key].id, status: statuses[i] }));
const inbox = async token => (await get(`${ME}/notifications?limit=100&type=ATTENDANCE_ABSENT`, { as: token })).data;
const csvOf = async url => {
  const res = await request("GET", url);
  assert.equal(res.status, 200, res.buffer.toString().slice(0, 300));
  return res.buffer.toString().trim().split("\r\n");
};

describe("attendance modes and teacher scope: setup", () => {
  it("creates Classes 5 and 6, their teachers, timetable and students", async () => {
    const teacher = async key => {
      t[key] = (await post(`${U}/teachers`, { user: person(key) })).data;
      h.tokens[key] = tokenFor(t[key].userId, "TEACHER");
    };
    for (const key of ["ct5", "ct6", "sci6", "eng6", "sub6"]) await teacher(key);

    t.class5 = (await post(`${A}/classes`, { className: "Class 5", classOrder: 5 })).data;
    t.class6 = (await post(`${A}/classes`, { className: "Class 6", classOrder: 6 })).data;
    t.s5A = (await post(`${A}/sections`, { classId: t.class5.id, sectionName: "A", classTeacherId: t.ct5.id })).data;
    t.s6A = (await post(`${A}/sections`, { classId: t.class6.id, sectionName: "A", classTeacherId: t.ct6.id })).data;
    t.science = (await post(`${A}/subjects`, { subjectName: "Science", subjectCode: "SC56" })).data;

    await post(`${A}/section-subjects`, { sectionId: t.s5A.id, subjectId: t.science.id });
    await post(`${A}/section-subjects`, { sectionId: t.s6A.id, subjectId: t.science.id });
    await post(`${A}/section-subjects`, { sectionId: t.s6A.id, subjectId: world.english.id });
    const assign = (teacherId, sectionId, subjectId) =>
      post(`${A}/teacher-assignments`, { teacherId, sectionId, subjectId });
    await assign(t.sci6.id, t.s5A.id, t.science.id);
    await assign(t.sci6.id, t.s6A.id, t.science.id);
    await assign(t.eng6.id, t.s6A.id, world.english.id);

    /* Thursday (4): Period 1 Science, Period 2 English taught by sub6 */
    const thursday = { sectionId: t.s6A.id, weekday: 4 };
    assert.equal(
      (await post(`${A}/timetable/slots`, { ...thursday, periodId: world.p1.id, subjectId: t.science.id })).data
        .teacherId,
      t.sci6.id
    );
    await post(`${A}/timetable/slots`, {
      ...thursday,
      periodId: world.p2.id,
      subjectId: world.english.id,
      teacherId: t.sub6.id
    });

    const admit = async (key, section, parents) => {
      t[key] = (
        await post(`${U}/students`, {
          user: person(key),
          profile: { admissionNumber: `AM-${key}` },
          parents,
          enrollment: { academicYearId: world.y1.id, sectionId: section.id }
        })
      ).data;
    };
    await admit("a5", t.s5A, [{ user: { ...person("p5"), phone: "+91 90000 00005" }, relation: "MOTHER" }]);
    const p5 = t.a5.parents[0].parentId;
    await admit("b5", t.s5A, [{ parentId: p5, relation: "MOTHER" }]);
    await admit("a6", t.s6A, [{ user: { ...person("p6"), phone: "+91 90000 00006" }, relation: "FATHER" }]);
    const p6 = t.a6.parents[0].parentId;
    await admit("b6", t.s6A, [{ parentId: p6, relation: "FATHER" }]);
    await admit("c6", t.s6A, [{ parentId: p6, relation: "FATHER" }]);
    h.tokens.p5 = tokenFor((await get(`${U}/parents/${p5}`)).data.userId, "PARENT");
    h.tokens.p6 = tokenFor((await get(`${U}/parents/${p6}`)).data.userId, "PARENT");
  });
});

describe("D-11: teachers read only their sections", () => {
  it("filters sections, classes and subjects, and refuses others' with 403", async () => {
    const ids = res => res.data.map(row => row.id).sort();
    assert.deepEqual(ids(await get(`${A}/sections`, { as: h.tokens.sci6 })), [t.s5A.id, t.s6A.id].sort());
    assert.deepEqual(ids(await get(`${A}/sections`, { as: h.tokens.eng6 })), [t.s6A.id]);
    assert.ok((await get(`${A}/sections`)).meta.total > 2, "admins see every section");
    const other = await request("GET", `${A}/sections/${t.s5A.id}`, { as: h.tokens.eng6 });
    assert.equal(other.status, 403);
    assert.equal(other.body.message, "You can only do this for sections you teach");
    await get(`${A}/sections/${t.s6A.id}`, { as: h.tokens.eng6 });

    assert.deepEqual(ids(await get(`${A}/classes`, { as: h.tokens.eng6 })), [t.class6.id]);
    await get(`${A}/classes/${t.class5.id}`, { as: h.tokens.eng6 }, 403);
    await get(`${A}/classes/${t.class5.id}`, { as: h.tokens.ct5 });

    assert.deepEqual(ids(await get(`${A}/subjects`, { as: h.tokens.eng6 })), [t.science.id, world.english.id].sort());
    assert.deepEqual(ids(await get(`${A}/subjects`, { as: h.tokens.ct5 })), [t.science.id]);
    await get(`${A}/subjects/${world.math.id}`, { as: h.tokens.eng6 }, 403);
    await get(`${A}/subjects/${world.math.id}`, { as: h.tokens.office });

    assert.equal((await get(`${A}/section-subjects?sectionId=${t.s6A.id}`, { as: h.tokens.eng6 })).meta.total, 2);
    await get(`${A}/section-subjects?sectionId=${t.s5A.id}`, { as: h.tokens.eng6 }, 403);
  });

  it("shows teacher assignments and rosters of their sections only", async () => {
    const assignments = await get(`${A}/teacher-assignments`, { as: h.tokens.eng6 });
    assert.deepEqual(assignments.data.map(a => a.subject.subjectCode).sort(), ["EN01", "SC56"]);
    const sci6 = await get(`${A}/teacher-assignments?teacherId=${t.sci6.id}`, { as: h.tokens.eng6 });
    assert.deepEqual(
      sci6.data.map(a => a.section.id),
      [t.s6A.id],
      "sci6's 5-A assignment is outside eng6's scope"
    );
    await get(`${A}/teacher-assignments?sectionId=${t.s5A.id}`, { as: h.tokens.eng6 }, 403);
    assert.equal((await get(`${A}/teacher-assignments?teacherId=${t.sci6.id}`)).meta.total, 2);

    assert.equal((await get(`${A}/enrollments?sectionId=${t.s6A.id}`, { as: h.tokens.eng6 })).meta.total, 3);
    await get(`${A}/enrollments?sectionId=${t.s5A.id}`, { as: h.tokens.eng6 }, 403);
  });

  it("lists every exam but only the papers of their sections", async () => {
    t.unitTest = (await post(`${A}/exams`, { examName: "Unit Test 5-6" })).data;
    const paper = (sectionId, subjectId) =>
      post(`${A}/exams/${t.unitTest.id}/papers`, { sectionId, subjectId, maxMarks: 25 });
    await paper(t.s5A.id, t.science.id);
    await paper(t.s6A.id, t.science.id);
    await paper(t.s6A.id, world.english.id);

    const exams = await get(`${A}/exams?limit=100`, { as: h.tokens.eng6 });
    assert.ok(exams.data.some(e => e.id === t.unitTest.id) && exams.data.some(e => e.id === world.exam.id));
    await get(`${A}/exams/${world.exam.id}`, { as: h.tokens.eng6 });

    const papers = await get(`${A}/exams/${t.unitTest.id}/papers`, { as: h.tokens.eng6 });
    assert.equal(papers.meta.total, 2);
    assert.ok(papers.data.every(p => p.section.id === t.s6A.id));
    assert.equal((await get(`${A}/exams/${t.unitTest.id}/papers`, { as: h.tokens.ct5 })).meta.total, 1);
    assert.equal((await get(`${A}/exams/${t.unitTest.id}/papers`)).meta.total, 3);
    await get(`${A}/exams/${t.unitTest.id}/papers?sectionId=${t.s5A.id}`, { as: h.tokens.eng6 }, 403);
    assert.equal((await get(`${A}/exams/${world.exam.id}/papers`, { as: h.tokens.eng6 })).meta.total, 0);
  });

  it("keeps school-wide reference data visible", async () => {
    await get(`${A}/academic-years`, { as: h.tokens.eng6 });
    await get(`${A}/periods`, { as: h.tokens.eng6 });
    await get(`${A}/grade-scales`, { as: h.tokens.eng6 });
    await get(`${A}/calendar/events`, { as: h.tokens.eng6 });
  });

  it("shows subject teachers every student of the sections they teach, and nobody else", async () => {
    const ids = res => res.data.map(s => s.id).sort();
    assert.deepEqual(
      ids(await get(`${U}/students?limit=100`, { as: h.tokens.eng6 })),
      [t.a6.id, t.b6.id, t.c6.id].sort()
    );
    assert.equal((await get(`${U}/students?limit=100`, { as: h.tokens.sci6 })).meta.total, 5);
    assert.equal((await get(`${U}/students?limit=100`, { as: h.tokens.ct5 })).meta.total, 2);
    await get(`${U}/students/${t.a6.id}`, { as: h.tokens.eng6 });

    /* 404, not 403: another student's existence is not confirmed */
    const outside = await request("GET", `${U}/students/${t.a5.id}`, { as: h.tokens.eng6 });
    assert.equal(outside.status, 404);
    assert.equal(outside.body.message, "Student not found");
    await get(`${U}/students/${t.a5.id}/parents`, { as: h.tokens.eng6 }, 404);

    /* In scope: the parents and their contact details */
    const parents = await get(`${U}/students/${t.a6.id}/parents`, { as: h.tokens.eng6 });
    assert.equal(parents.data[0].parent.user.email, "p6@test.school");
    assert.equal(parents.data[0].parent.user.phone, "+91 90000 00006");
  });

  it("shows a teacher their own timetable, and a section's only as its class teacher", async () => {
    const own = await get(`${A}/timetable/teachers/${t.sci6.id}`, { as: h.tokens.sci6 });
    assert.equal(own.data.weeklyLessons, 1);
    const others = await request("GET", `${A}/timetable/teachers/${t.sci6.id}`, { as: h.tokens.eng6 });
    assert.equal(others.status, 403);
    assert.equal(others.body.message, "You can only see your own timetable");
    assert.equal((await get(`${ME}/teaching/timetable`, { as: h.tokens.sub6 })).data.weeklyLessons, 1);

    const grid = await get(`${A}/timetable/sections/${t.s6A.id}`, { as: h.tokens.ct6 });
    assert.equal(grid.data.days.find(d => d.weekday === 4).slots.length, 2);
    const subjectTeacher = await request("GET", `${A}/timetable/sections/${t.s6A.id}`, { as: h.tokens.sci6 });
    assert.equal(subjectTeacher.status, 403);
    assert.equal(
      subjectTeacher.body.message,
      "You can see your own timetable, and a section's timetable only as its class teacher"
    );
    await get(`${A}/timetable/sections/${t.s6A.id}`, { as: h.tokens.office });
  });
});

describe("attendance modes: policy", () => {
  it("schedules a mode per class from a date, and keeps it future-only over taken registers", async () => {
    const policy = await get(`${A}/attendance/policy`, { as: h.tokens.ct5 });
    assert.equal(policy.data.mode, "DAILY");
    assert.deepEqual(policy.data.classModes, []);

    const set = await patch(`${A}/attendance/policy`, {
      editWindowDays: 365,
      classModes: [
        { classId: t.class5.id, mode: "TWO_SESSIONS" },
        { classId: t.class6.id, mode: "PERIOD_WISE" }
      ],
      modeEffectiveFrom: "2026-08-01"
    });
    assert.equal(
      set.message,
      "Attendance policy updated: registers lock after 365 day(s) after the date; from 2026-08-01 Class 5 twice a day (forenoon and afternoon); Class 6 period by period"
    );
    assert.deepEqual(
      set.data.classModes.map(c => [c.className, c.mode]),
      [
        ["Class 5", "TWO_SESSIONS"],
        ["Class 6", "PERIOD_WISE"]
      ]
    );

    /* Class 1-A has July registers: the school's mode cannot change under them */
    const backwards = await request("PATCH", `${A}/attendance/policy`, {
      body: { mode: "PERIOD_WISE", modeEffectiveFrom: "2026-07-01" }
    });
    assert.equal(backwards.status, 409);
    assert.equal(
      backwards.body.message,
      "Class 1-A already has registers up to 2026-07-07, and a mode change cannot reach back over registers already taken. Start it on 2026-07-08 or later."
    );
    assert.equal((await get(`${A}/attendance/policy`)).data.mode, "DAILY");
  });

  it("starts changes tomorrow by default and lists what is scheduled", async () => {
    const today = todayIn("Asia/Kolkata");
    const later = addDays(today, 30);
    const scheduled = await patch(`${A}/attendance/policy`, {
      classModes: [{ classId: world.c1.id, mode: "PERIOD_WISE" }],
      modeEffectiveFrom: later
    });
    assert.deepEqual(scheduled.data.scheduled, [
      { classId: world.c1.id, className: "Class 1", mode: "PERIOD_WISE", effectiveFrom: later }
    ]);
    /* Registers already taken keep their meaning */
    const july = await get(`${A}/attendance/summary?sectionId=${world.s1A.id}&from=2026-07-06&to=2026-07-11`);
    assert.equal(july.data.students[0].percentage, 40);
    assert.deepEqual(july.data.modes, [{ mode: "DAILY", from: "2026-07-06", to: "2026-07-11" }]);

    /* Following the school again from tomorrow cancels the later change */
    const reset = await patch(`${A}/attendance/policy`, { classModes: [{ classId: world.c1.id, mode: null }] });
    assert.equal(reset.data.change.effectiveFrom, addDays(today, 1));
    assert.match(reset.message, /Class 1 follows the school$/);
    assert.deepEqual(
      reset.data.scheduled.map(s => [s.className, s.mode]),
      [["Class 1", null]]
    );
  });

  it("validates mode changes and keeps them to admins", async () => {
    const bad = async (body, status, message) => {
      const res = await request("PATCH", `${A}/attendance/policy`, { body });
      assert.equal(res.status, status, JSON.stringify(res.body));
      if (message) assert.equal(res.body.message, message);
    };
    await bad(
      { modeEffectiveFrom: "2026-09-01" },
      400,
      "Invalid request: modeEffectiveFrom is only used with mode or classModes"
    );
    await bad({ mode: "WEEKLY" }, 400);
    await bad({ periodPresenceThreshold: 0 }, 400);
    await bad(
      {
        classModes: [
          { classId: t.class5.id, mode: "DAILY" },
          { classId: t.class5.id, mode: null }
        ]
      },
      400
    );
    await bad(
      { classModes: [{ classId: world.y1.id, mode: "DAILY" }] },
      422,
      "classModes: one or more classes do not exist"
    );
    await patch(`${A}/attendance/policy`, { mode: "TWO_SESSIONS" }, { as: h.tokens.principal }, 403);
    await patch(`${A}/attendance/policy`, { mode: "TWO_SESSIONS" }, { as: h.tokens.ct5 }, 403);
  });
});

describe("attendance modes: two sessions a day (Class 5)", () => {
  const session = (date, kind, statuses, as) =>
    record({ sectionId: t.s5A.id, date, kind, records: marks(["a5", "b5"], statuses) }, as);

  it("takes forenoon and afternoon registers, by the class teacher", async () => {
    const daily = await record({ sectionId: t.s5A.id, date: "2026-08-03", records: marks(["a5"], ["PRESENT"]) });
    assert.equal(daily.status, 422);
    assert.equal(
      daily.body.message,
      "On 2026-08-03 Class 5-A takes attendance twice a day (forenoon and afternoon): record a FORENOON or an AFTERNOON register"
    );
    const period = await record({
      sectionId: t.s5A.id,
      date: "2026-08-03",
      periodNumber: 1,
      records: marks(["a5"], ["PRESENT"])
    });
    assert.equal(period.status, 422);

    const half = await session("2026-08-03", "FORENOON", ["HALF_DAY", "PRESENT"], h.tokens.ct5);
    assert.equal(half.status, 422);
    assert.match(half.body.message, /^HALF_DAY is not used in forenoon and afternoon registers/);

    const subjectTeacher = await session("2026-08-03", "FORENOON", ["PRESENT", "ABSENT"], h.tokens.sci6);
    assert.equal(subjectTeacher.status, 403);
    assert.equal(subjectTeacher.body.message, "Only the class teacher of Class 5-A can take its forenoon register");
    const stranger = await session("2026-08-03", "FORENOON", ["PRESENT", "ABSENT"], h.tokens.ct6);
    assert.equal(stranger.status, 403);
    assert.equal(stranger.body.message, "You can only do this for sections you teach");

    const forenoon = await session("2026-08-03", "FORENOON", ["PRESENT", "ABSENT"], h.tokens.ct5);
    assert.equal(forenoon.status, 201);
    assert.equal(forenoon.body.message, "Forenoon attendance recorded for 2 student(s)");
    assert.deepEqual([forenoon.body.data.session.mode, forenoon.body.data.session.kind], ["TWO_SESSIONS", "FORENOON"]);
    await settleJobs();
    const again = await session("2026-08-03", "FORENOON", ["PRESENT", "ABSENT"], h.tokens.ct5);
    assert.equal(again.status, 200);
    assert.equal(again.body.message, "Forenoon attendance updated for 2 student(s)");
    assert.equal((await session("2026-08-03", "AFTERNOON", ["ABSENT", "ABSENT"], h.tokens.ct5)).status, 201);

    assert.equal((await session("2026-08-04", "FORENOON", ["LATE", "EXCUSED"])).status, 201);
    assert.equal((await session("2026-08-04", "AFTERNOON", ["PRESENT", "PRESENT"])).status, 201);
    /* Wednesday: the afternoon register is never taken */
    assert.equal((await session("2026-08-05", "FORENOON", ["EXCUSED", "PRESENT"])).status, 201);
    await settleJobs();
  });

  it("shows the day with both sessions, and one session on its own", async () => {
    const day = await get(`${A}/attendance/register?sectionId=${t.s5A.id}&date=2026-08-03`, { as: h.tokens.sci6 });
    assert.equal(day.data.mode, "TWO_SESSIONS");
    assert.equal(day.data.kind, null);
    assert.deepEqual(
      day.data.registers.map(r => [r.key, r.label, r.taken]),
      [
        ["FN", "Forenoon", true],
        ["AN", "Afternoon", true]
      ]
    );
    const a5 = day.data.students.find(s => s.studentId === t.a5.id);
    assert.deepEqual([a5.status, a5.marks], ["HALF_DAY", { FN: "PRESENT", AN: "ABSENT" }]);

    const wednesday = await get(`${A}/attendance/register?sectionId=${t.s5A.id}&date=2026-08-05`);
    assert.equal(wednesday.data.taken, false, "the afternoon is missing");
    const forenoon = await get(`${A}/attendance/register?sectionId=${t.s5A.id}&date=2026-08-03&kind=FORENOON`);
    assert.deepEqual(
      [forenoon.data.kind, forenoon.data.taken, forenoon.data.students.map(s => s.status)],
      ["FORENOON", true, ["PRESENT", "ABSENT"]]
    );
  });

  it("counts each session as half a day", async () => {
    /* a5: Mon FN P + AN A = 0.5 (HALF_DAY); Tue L + P = 1 (LATE); Wed FN EXCUSED, AN not taken = 0 of 0.5
       -> 1.5 / 2.5 = 60%. b5: Mon A + A = 0; Tue EXCUSED + P = 0.5 of 0.5; Wed P + not taken = 0.5 of 1
       -> 1 / 2.5 = 40% */
    const summary = await get(`${A}/attendance/summary?sectionId=${t.s5A.id}&from=2026-08-03&to=2026-08-05`);
    assert.equal(summary.data.basis, "DAYS");
    assert.deepEqual(summary.data.modes, [{ mode: "TWO_SESSIONS", from: "2026-08-03", to: "2026-08-05" }]);
    const [a5, b5] = summary.data.students;
    assert.deepEqual(
      [a5.attendedDays, a5.countableDays, a5.percentage, a5.counts],
      [1.5, 2.5, 60, { PRESENT: 0, ABSENT: 1, LATE: 1, HALF_DAY: 1, EXCUSED: 0 }]
    );
    assert.deepEqual(
      [b5.attendedDays, b5.countableDays, b5.percentage, b5.counts],
      [1, 2.5, 40, { PRESENT: 1, ABSENT: 1, LATE: 0, HALF_DAY: 1, EXCUSED: 0 }]
    );
    assert.equal(summary.data.averagePercentage, 50);
    assert.equal(a5.periods, null);
  });

  it("shows families the day breakdown", async () => {
    const mine = await get(`${ME}/students/${t.a5.id}/attendance?from=2026-08-03&to=2026-08-05`, { as: h.tokens.p5 });
    assert.equal(mine.data.mode, "TWO_SESSIONS");
    assert.equal(mine.data.percentage, 60);
    assert.deepEqual(
      mine.data.days.map(d => [d.date, d.status, d.attended]),
      [
        ["2026-08-03", "HALF_DAY", 0.5],
        ["2026-08-04", "LATE", 1],
        ["2026-08-05", "ABSENT", 0]
      ]
    );
    assert.deepEqual(
      mine.data.days[0].breakdown.map(b => [b.kind, b.label, b.status]),
      [
        ["FORENOON", "Forenoon", "PRESENT"],
        ["AFTERNOON", "Afternoon", "ABSENT"]
      ]
    );
  });

  it("alerts parents once per session missed", async () => {
    const alerts = await inbox(h.tokens.p5);
    assert.deepEqual(
      alerts.map(a => [a.data.studentId, a.data.date, a.data.session]).sort(),
      [
        [t.a5.id, "2026-08-03", "AFTERNOON"],
        [t.b5.id, "2026-08-03", "AFTERNOON"],
        [t.b5.id, "2026-08-03", "FORENOON"]
      ].sort(),
      "retaking the forenoon register did not alert again"
    );
    assert.ok(alerts.some(a => a.title === "Fa5 La5 was absent in the afternoon session"));
  });
});

describe("attendance modes: period by period (Class 6)", () => {
  const lesson = (date, periodNumber, statuses, as, extra = {}) =>
    record({ sectionId: t.s6A.id, date, periodNumber, records: marks(["a6", "b6", "c6"], statuses), ...extra }, as);

  it("needs a timetabled period of that weekday", async () => {
    const expect = async (res, status, message) => {
      assert.equal(res.status, status, JSON.stringify(res.body));
      if (message) assert.equal(res.body.message, message);
    };
    await expect(
      await record({ sectionId: t.s6A.id, date: "2026-08-06", records: marks(["a6"], ["PRESENT"]) }),
      422,
      "On 2026-08-06 Class 6-A takes attendance period by period: record one register per period (kind PERIOD with its periodNumber)"
    );
    await expect(
      await lesson("2026-08-06", 3, ["PRESENT", "PRESENT", "PRESENT"]),
      422,
      "Recess is a break: no register is taken in it"
    );
    await expect(
      await lesson("2026-08-06", 9, ["PRESENT", "PRESENT", "PRESENT"]),
      422,
      "Period 9 is not in the bell schedule of the academic year"
    );
    await expect(
      await lesson("2026-08-05", 1, ["PRESENT", "PRESENT", "PRESENT"]),
      422,
      "Class 6-A has no class in Period 1 on Wednesdays"
    );
    await expect(
      await lesson("2026-08-06", 1, ["PRESENT", "PRESENT", "PRESENT"], h.tokens.admin, { subjectId: world.english.id }),
      422,
      "The timetable has Science in Period 1 on Thursdays, not the subject sent"
    );
    await expect(
      await record({ sectionId: t.s6A.id, date: "2026-08-06", kind: "PERIOD", records: marks(["a6"], ["PRESENT"]) }),
      400
    );
    await expect(
      await record({
        sectionId: t.s6A.id,
        date: "2026-08-06",
        kind: "FORENOON",
        periodNumber: 1,
        records: marks(["a6"], ["PRESENT"])
      }),
      400
    );
    const subjectOnDay = await record({
      sectionId: t.s5A.id,
      date: "2026-08-06",
      kind: "FORENOON",
      subjectId: t.science.id,
      records: marks(["a5"], ["PRESENT"])
    });
    assert.equal(subjectOnDay.status, 400);
    assert.equal(subjectOnDay.body.message, "Invalid request: subjectId is only used for period registers");
  });

  it("lets the period's teacher (timetable or assignment) and the class teacher take it", async () => {
    const wrong = await lesson("2026-08-06", 1, ["PRESENT", "ABSENT", "LATE"], h.tokens.eng6);
    assert.equal(wrong.status, 403);
    assert.equal(
      wrong.body.message,
      "Only the teacher of Science in Class 6-A or its class teacher can take the Period 1 register"
    );
    await lesson("2026-08-06", 1, ["PRESENT", "ABSENT", "LATE"], h.tokens.ct5).then(r => assert.equal(r.status, 403));

    const science = await lesson("2026-08-06", 1, ["PRESENT", "ABSENT", "LATE"], h.tokens.sci6);
    assert.equal(science.status, 201);
    assert.equal(science.body.message, "Period 1 (Science) attendance recorded for 3 student(s)");
    assert.deepEqual(science.body.data.session.subject, { id: t.science.id, subjectName: "Science" });
    await settleJobs();

    /* sub6 has no assignment in 6-A but teaches the period by the timetable */
    assert.equal((await lesson("2026-08-06", 2, ["PRESENT", "ABSENT", "ABSENT"], h.tokens.sub6)).status, 201);
    await settleJobs();
    /* eng6 is assigned English in 6-A: may retake it */
    const retake = await lesson("2026-08-06", 2, ["PRESENT", "ABSENT", "HALF_DAY"], h.tokens.eng6);
    assert.equal(retake.status, 200);
    assert.equal(retake.body.message, "Period 2 (English) attendance updated for 3 student(s)");
    await settleJobs();

    /* The class teacher takes any period */
    assert.equal((await lesson("2026-08-13", 1, ["ABSENT", "EXCUSED", "PRESENT"], h.tokens.ct6)).status, 201);
    await settleJobs();
    assert.equal((await lesson("2026-08-13", 2, ["PRESENT", "EXCUSED", "ABSENT"])).status, 201);
    await settleJobs();
  });

  it("shows the day as periods, with each student's day status", async () => {
    const day = await get(`${A}/attendance/register?sectionId=${t.s6A.id}&date=2026-08-06`, { as: h.tokens.eng6 });
    assert.equal(day.data.mode, "PERIOD_WISE");
    assert.deepEqual(
      day.data.registers.map(r => [r.key, r.label, r.teacher.name, r.taken]),
      [
        ["P1", "Period 1 (Science)", "Fsci6 Lsci6", true],
        ["P2", "Period 2 (English)", "Fsub6 Lsub6", true]
      ]
    );
    assert.deepEqual(
      day.data.students.map(s => [s.status, s.marks]),
      [
        ["PRESENT", { P1: "PRESENT", P2: "PRESENT" }],
        ["ABSENT", { P1: "ABSENT", P2: "ABSENT" }],
        ["PRESENT", { P1: "LATE", P2: "HALF_DAY" }]
      ]
    );
    const one = await get(`${A}/attendance/register?sectionId=${t.s6A.id}&date=2026-08-06&periodNumber=2`);
    assert.deepEqual(
      [one.data.kind, one.data.periodNumber, one.data.students.map(s => s.status)],
      ["PERIOD", 2, ["PRESENT", "ABSENT", "HALF_DAY"]]
    );
    const friday = await get(`${A}/attendance/register?sectionId=${t.s6A.id}&date=2026-08-07`);
    assert.deepEqual([friday.data.registers, friday.data.taken], [[], false]);
  });

  it("counts attended periods over periods held, and days by the threshold", async () => {
    /* Thu 6: a6 P P, b6 A A, c6 L H(0.5). Thu 13: a6 A P, b6 E E, c6 P A.
       a6 3/4 = 75%; b6 0/(4 - 2 excused) = 0%; c6 2.5/4 = 62.5%.
       Days (threshold 50%): a6 present both Thursdays; c6 present (75%, 50%); b6 absent, then excused.
       7 working days from 6 to 13 August. */
    const summary = await get(`${A}/attendance/summary?sectionId=${t.s6A.id}&from=2026-08-06&to=2026-08-13`);
    assert.equal(summary.data.basis, "PERIODS");
    assert.equal(summary.data.workingDays, 7);
    const [a6, b6, c6] = summary.data.students;
    assert.deepEqual(a6.periods, { held: 4, attended: 3, excused: 0, percentage: 75 });
    assert.deepEqual(
      [a6.percentage, a6.counts.PRESENT, a6.unmarked, a6.attendedDays, a6.countableDays, a6.dayPercentage],
      [75, 2, 5, 2, 7, 28.6]
    );
    assert.deepEqual(b6.periods, { held: 4, attended: 0, excused: 2, percentage: 0 });
    assert.deepEqual([b6.counts.ABSENT, b6.counts.EXCUSED, b6.countableDays, b6.dayPercentage], [1, 1, 6, 0]);
    assert.deepEqual(c6.periods, { held: 4, attended: 2.5, excused: 0, percentage: 62.5 });
    assert.equal(c6.counts.PRESENT, 2);
    assert.equal(summary.data.averagePercentage, 45.8);

    const portal = await get(`${ME}/students/${t.c6.id}/attendance?from=2026-08-06&to=2026-08-06`, { as: h.tokens.p6 });
    assert.deepEqual([portal.data.basis, portal.data.percentage], ["PERIODS", 75]);
    assert.deepEqual(portal.data.days[0].periods, { held: 2, attended: 1.5, excused: 0 });
    assert.deepEqual(
      portal.data.days[0].breakdown.map(b => [b.label, b.status]),
      [
        ["Period 1 (Science)", "LATE"],
        ["Period 2 (English)", "HALF_DAY"]
      ]
    );
  });

  it("applies the school's presence threshold to period-wise days", async () => {
    await patch(`${A}/attendance/policy`, { periodPresenceThreshold: 60 });
    const a6 = await get(`${A}/attendance/students/${t.a6.id}?from=2026-08-06&to=2026-08-13`, { as: h.tokens.eng6 });
    assert.deepEqual(
      a6.data.days.map(d => [d.date, d.status]),
      [
        ["2026-08-06", "PRESENT"],
        ["2026-08-13", "ABSENT"]
      ],
      "1 of 2 periods (50%) is below 60%"
    );
    assert.equal(a6.data.percentage, 75, "the period percentage does not depend on the threshold");
    await patch(`${A}/attendance/policy`, { periodPresenceThreshold: 50 });
    await get(`${A}/attendance/students/${t.a6.id}`, { as: h.tokens.ct5 }, 403);
  });

  it("alerts parents once a day, on the first period missed", async () => {
    const alerts = await inbox(h.tokens.p6);
    const of = (key, date) => alerts.filter(a => a.data.studentId === t[key].id && a.data.date === date);
    assert.equal(alerts.length, 4);
    const [b6] = of("b6", "2026-08-06");
    assert.deepEqual([b6.title, b6.data.periods], ["Fb6 Lb6 missed a class today", [1]]);
    assert.match(b6.body, /^Fb6 Lb6 was marked absent in Period 1 \(Science\) on 2026-08-06\./);
    assert.equal(of("c6", "2026-08-06")[0].body.includes("Period 2 (English)"), true);
    assert.equal(of("a6", "2026-08-13").length, 1);
    assert.equal(of("c6", "2026-08-13").length, 1);
    assert.equal(of("b6", "2026-08-13").length, 0, "excused periods send nothing");
  });
});

describe("attendance modes: lock, reports and races", () => {
  it("locks every kind of register after the edit window", async () => {
    await patch(`${A}/attendance/policy`, { editWindowDays: 0 });
    const forenoon = await record(
      { sectionId: t.s5A.id, date: "2026-08-03", kind: "FORENOON", records: marks(["a5"], ["PRESENT"]) },
      h.tokens.ct5
    );
    assert.equal(forenoon.status, 403);
    assert.match(forenoon.body.message, /^The register for 2026-08-03 was locked after 2026-08-03/);
    const period = await record(
      { sectionId: t.s6A.id, date: "2026-08-06", periodNumber: 1, records: marks(["b6"], ["ABSENT"]) },
      h.tokens.sci6
    );
    assert.equal(period.status, 403);
    const noReason = await record({
      sectionId: t.s6A.id,
      date: "2026-08-06",
      periodNumber: 1,
      records: marks(["b6"], ["ABSENT"])
    });
    assert.equal(noReason.status, 422);
    const fixed = await record({
      sectionId: t.s6A.id,
      date: "2026-08-06",
      periodNumber: 1,
      records: marks(["b6"], ["ABSENT"]),
      overrideReason: "Register correction"
    });
    assert.equal(fixed.status, 200);
    assert.equal(
      fixed.body.message,
      "Period 1 (Science) attendance updated for 1 student(s) (locked register changed by override)"
    );
    const one = await get(`${A}/attendance/register?sectionId=${t.s6A.id}&date=2026-08-06&periodNumber=1`);
    assert.equal(one.data.lockOverride.reason, "Register correction");
    await patch(`${A}/attendance/policy`, { editWindowDays: 365 });
  });

  it("exports the register grid at each mode's granularity", async () => {
    const [header5, ...rows5] = await csvOf(
      `${R}/exports/attendance?format=csv&sectionId=${t.s5A.id}&from=2026-08-03&to=2026-08-05`
    );
    assert.match(header5, /Student,08-03 FN,08-03 AN,08-04 FN,08-04 AN,08-05 FN,08-05 AN$/);
    assert.ok(rows5.some(r => r.endsWith("Fa5 La5,P,A,L,P,E,")));

    const [header6, ...rows6] = await csvOf(
      `${R}/exports/attendance?format=csv&sectionId=${t.s6A.id}&from=2026-08-06&to=2026-08-07`
    );
    assert.match(header6, /Student,08-06 P1,08-06 P2,08-06 Day,08-07 Day$/);
    assert.ok(rows6.some(r => r.endsWith("Fc6 Lc6,L,H,P,")));
    assert.ok(rows6.some(r => r.endsWith("Fb6 Lb6,A,A,A,")));
  });

  it("puts every mode on the attendance dashboard in day units", async () => {
    const { data } = await get(`${R}/dashboards/attendance?from=2026-08-03&to=2026-08-13&minDays=1`);
    const of = section => data.bySection.find(s => s.sectionId === section.id);
    /* 5-A: half days 0.5 + 1 + 0 (excused) and 0 + 0.5 + 0.5 over 4 countable days */
    assert.deepEqual([of(t.s5A).mode, of(t.s5A).percentage, of(t.s5A).periodPercentage], ["TWO_SESSIONS", 62.5, null]);
    /* 6-A: present student-days 4 of 5 (b6 excused on the 13th); periods 5.5 of 10 */
    assert.deepEqual([of(t.s6A).mode, of(t.s6A).percentage, of(t.s6A).periodPercentage], ["PERIOD_WISE", 80, 55]);
    assert.equal(of(world.s1A).mode, "DAILY");
    const monday = data.trend.find(d => d.date === "2026-08-03");
    assert.deepEqual([monday.percentage, monday.absent], [25, 1]);
  });

  it("serialises a back-dated mode change with a register for the same day", async () => {
    /* Hold the policy row: the register waits FOR SHARE, the mode change FOR UPDATE */
    const holder = await h.pool.connect();
    let results;
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM attendance_policies WHERE tenant_id = $1 FOR UPDATE", [h.tenant.id]);
      const pending = Promise.all([
        record(
          {
            sectionId: t.s5A.id,
            date: "2026-08-07",
            kind: "FORENOON",
            records: marks(["a5", "b5"], ["PRESENT", "PRESENT"])
          },
          h.tokens.ct5
        ),
        request("PATCH", `${A}/attendance/policy`, {
          body: { classModes: [{ classId: t.class5.id, mode: "DAILY" }], modeEffectiveFrom: "2026-08-07" }
        })
      ]);
      for (let i = 0; i < 200 && (await lockWaiters()) < 2; i++) await new Promise(r => setTimeout(r, 10));
      assert.equal(await lockWaiters(), 2, "both requests wait on the policy row");
      await holder.query("ROLLBACK");
      results = await pending;
    } finally {
      holder.release(true);
    }
    const [register, change] = results;
    const outcome = [register.status, change.status];
    assert.ok(
      (outcome[0] === 201 && outcome[1] === 409) || (outcome[0] === 422 && outcome[1] === 200),
      `exactly one wins: ${JSON.stringify(outcome)}`
    );
    const fridayMode = (await get(`${A}/attendance/register?sectionId=${t.s5A.id}&date=2026-08-07`)).data.mode;
    assert.equal(fridayMode, register.status === 201 ? "TWO_SESSIONS" : "DAILY");
  });
});
