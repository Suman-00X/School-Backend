import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, call, get, post, patch, person, settleJobs, tokenFor, uuid } from "../helpers/harness.js";

/* D-11 record-level scope for teachers, and the three attendance systems (D-66):
   Class 5 (5-A) takes two sessions a day, Class 6 (6-A) takes attendance period by period,
   both since 1 August.
     ct5, ct6  class teachers of 5-A and 6-A
     dep5      deputy class teacher of 5-A (set later)
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

/* Mode changes start tomorrow at the earliest (a trigger enforces it): rules in the
   past are seeded as if they had been scheduled back then */
const seedModeRules = async rules => {
  const client = await h.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE attendance_mode_rules DISABLE TRIGGER attendance_mode_rules_future_only");
    for (const { classId, mode, effectiveFrom } of rules) {
      await client.query(
        "INSERT INTO attendance_mode_rules (tenant_id, class_id, mode, effective_from, set_by) VALUES ($1, $2, $3, $4, $5)",
        [h.tenant.id, classId, mode, effectiveFrom, h.admin.id]
      );
    }
    await client.query("ALTER TABLE attendance_mode_rules ENABLE TRIGGER attendance_mode_rules_future_only");
    await client.query("COMMIT");
  } finally {
    client.release();
  }
};

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
    for (const key of ["ct5", "ct6", "dep5", "sci6", "eng6", "sub6"]) await teacher(key);

    t.class5 = (await post(`${A}/classes`, { className: "Class 5", classOrder: 5 })).data;
    t.class6 = (await post(`${A}/classes`, { className: "Class 6", classOrder: 6 })).data;
    t.s5A = (await post(`${A}/sections`, { classId: t.class5.id, sectionName: "A", classTeacherId: t.ct5.id })).data;
    t.s6A = (await post(`${A}/sections`, { classId: t.class6.id, sectionName: "A", classTeacherId: t.ct6.id })).data;
    t.science = (await post(`${A}/subjects`, { subjectName: "Science", subjectCode: "SC56" })).data;
    await seedModeRules([
      { classId: t.class5.id, mode: "TWO_SESSIONS", effectiveFrom: "2026-08-01" },
      { classId: t.class6.id, mode: "PERIOD_WISE", effectiveFrom: "2026-08-01" }
    ]);

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
  it("refuses mode changes starting today or earlier, in the service and in the database", async () => {
    const policy = await get(`${A}/attendance/policy`, { as: h.tokens.ct5 });
    assert.equal(policy.data.mode, "DAILY");
    assert.deepEqual(
      policy.data.classModes.map(c => [c.className, c.mode]),
      [
        ["Class 5", "TWO_SESSIONS"],
        ["Class 6", "PERIOD_WISE"]
      ]
    );

    const today = todayIn("Asia/Kolkata");
    const tomorrow = addDays(today, 1);
    const refusal = `A new attendance mode can start tomorrow (${tomorrow}) at the earliest. Choose ${tomorrow} or a later date.`;
    for (const day of [today, "2026-07-01"]) {
      const res = await request("PATCH", `${A}/attendance/policy`, {
        body: { editWindowDays: 30, mode: "PERIOD_WISE", modeEffectiveFrom: day }
      });
      assert.equal(res.status, 422, JSON.stringify(res.body));
      assert.equal(res.body.message, refusal);
    }
    const unchanged = (await get(`${A}/attendance/policy`)).data;
    assert.deepEqual(
      [unchanged.mode, unchanged.editWindowDays, unchanged.scheduled],
      ["DAILY", 365, []],
      "nothing saved"
    );

    /* The trigger holds the same line for any other write path */
    await assert.rejects(
      h.pool.query(
        "INSERT INTO attendance_mode_rules (tenant_id, mode, effective_from, set_by) VALUES ($1, 'PERIOD_WISE', $2, $3)",
        [h.tenant.id, today, h.admin.id]
      ),
      error => error.code === "ZA422" && error.message === refusal
    );
  });

  it("starts changes tomorrow by default and lists what is scheduled", async () => {
    const today = todayIn("Asia/Kolkata");
    const later = addDays(today, 30);
    const scheduled = await patch(`${A}/attendance/policy`, {
      classModes: [{ classId: world.c1.id, mode: "PERIOD_WISE" }],
      modeEffectiveFrom: later
    });
    assert.equal(
      scheduled.message,
      `Attendance policy updated: registers lock after 365 day(s) after the date; from ${later} Class 1 period by period`
    );
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
    assert.equal(
      subjectTeacher.body.message,
      "Only the class teacher of Class 5-A or its deputy can take its forenoon register"
    );
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

  it("needs a period of the bell schedule, and the subject when none is timetabled", async () => {
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
      "Class 6-A has no class in Period 1 on Wednesdays: send the subjectId of the subject taught"
    );
    await expect(
      await lesson("2026-08-06", 1, ["PRESENT", "PRESENT", "PRESENT"], h.tokens.admin, { subjectId: world.math.id }),
      422,
      "Mathematics is not taught in Class 6-A or its class"
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

  it("records who took each period, and marks substitutes", async () => {
    const science = await lesson("2026-08-06", 1, ["PRESENT", "ABSENT", "LATE"], h.tokens.sci6);
    assert.equal(science.status, 201);
    assert.equal(science.body.message, "Period 1 (Science) attendance recorded for 3 student(s)");
    assert.deepEqual(science.body.data.session.subject, { id: t.science.id, subjectName: "Science" });
    assert.deepEqual([science.body.data.session.takenBy, science.body.data.session.substitute], [t.sci6.userId, false]);
    await settleJobs();

    /* sub6 has no assignment in 6-A but teaches the period by the timetable: not a substitute */
    const timetabled = await lesson("2026-08-06", 2, ["PRESENT", "ABSENT", "ABSENT"], h.tokens.sub6);
    assert.deepEqual([timetabled.status, timetabled.body.data.session.substitute], [201, false]);
    await settleJobs();
    /* eng6 is assigned English in 6-A: may retake it */
    const retake = await lesson("2026-08-06", 2, ["PRESENT", "ABSENT", "HALF_DAY"], h.tokens.eng6);
    assert.equal(retake.status, 200);
    assert.equal(retake.body.message, "Period 2 (English) attendance updated for 3 student(s)");
    assert.equal(retake.body.data.session.substitute, false);
    await settleJobs();

    /* The class teacher taking someone else's period stands in for them */
    const classTeacher = await lesson("2026-08-13", 1, ["ABSENT", "EXCUSED", "PRESENT"], h.tokens.ct6);
    assert.deepEqual([classTeacher.status, classTeacher.body.data.session.substitute], [201, true]);
    await settleJobs();
    const admin = await lesson("2026-08-13", 2, ["PRESENT", "EXCUSED", "ABSENT"]);
    assert.deepEqual([admin.status, admin.body.data.session.substitute], [201, false]);
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

  it("takes a past day's register without waiting on a mode change in progress", async () => {
    /* A change starts tomorrow at the earliest, so it cannot meet a register for a past day:
       only today's registers wait on the policy row */
    const holder = await h.pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM attendance_policies WHERE tenant_id = $1 FOR UPDATE", [h.tenant.id]);
      const friday = await record(
        {
          sectionId: t.s5A.id,
          date: "2026-08-07",
          kind: "FORENOON",
          records: marks(["a5", "b5"], ["PRESENT", "PRESENT"])
        },
        h.tokens.ct5
      );
      assert.equal(friday.status, 201);
      assert.equal(await lockWaiters(), 0);
      await holder.query("ROLLBACK");
    } finally {
      holder.release(true);
    }
    await settleJobs();
  });
});

describe("attendance modes: substitutes take period registers (Class 6)", () => {
  const lesson = (date, periodNumber, statuses, as, extra = {}) =>
    record({ sectionId: t.s6A.id, date, periodNumber, records: marks(["a6", "b6", "c6"], statuses), ...extra }, as);

  it("lets whoever takes the class record it, with the slot's subject or their own", async () => {
    /* Thu 20: eng6 covers sci6's Science; ct5 (no link to 6-A) teaches Science in sub6's English slot */
    const cover = await lesson("2026-08-20", 1, ["PRESENT", "ABSENT", "PRESENT"], h.tokens.eng6);
    assert.equal(cover.status, 201);
    assert.equal(cover.body.message, "Period 1 (Science) attendance recorded for 3 student(s)");
    assert.deepEqual([cover.body.data.session.takenBy, cover.body.data.session.substitute], [t.eng6.userId, true]);

    const ownSubject = await lesson("2026-08-20", 2, ["LATE", "PRESENT", "ABSENT"], h.tokens.ct5, {
      subjectId: t.science.id
    });
    assert.equal(ownSubject.status, 201);
    assert.equal(ownSubject.body.message, "Period 2 (Science) attendance recorded for 3 student(s)");
    assert.deepEqual(
      [ownSubject.body.data.session.subject.subjectName, ownSubject.body.data.session.substitute],
      ["Science", true]
    );

    /* Fri 21: nothing is timetabled, so the subject must be given, and taught in the section */
    const friday = (as, extra) => lesson("2026-08-21", 1, ["ABSENT", "HALF_DAY", "PRESENT"], as, extra);
    const noSubject = await friday(h.tokens.sci6);
    assert.equal(noSubject.status, 422);
    assert.equal(
      noSubject.body.message,
      "Class 6-A has no class in Period 1 on Fridays: send the subjectId of the subject taught"
    );
    const notTaught = await friday(h.tokens.sci6, { subjectId: world.math.id });
    assert.deepEqual(
      [notTaught.status, notTaught.body.message],
      [422, "Mathematics is not taught in Class 6-A or its class"]
    );
    const recess = await lesson("2026-08-21", 3, ["PRESENT", "PRESENT", "PRESENT"], h.tokens.sci6, {
      subjectId: t.science.id
    });
    assert.deepEqual([recess.status, recess.body.message], [422, "Recess is a break: no register is taken in it"]);
    /* sci6 teaches Science in 6-A: not a substitute */
    const extra = await friday(h.tokens.sci6, { subjectId: t.science.id });
    assert.deepEqual([extra.status, extra.body.data.session.substitute], [201, false]);
    await settleJobs();
  });

  it("lets a substitute read back the register they took, and nothing else of the section", async () => {
    const mine = await get(`${A}/attendance/register?sectionId=${t.s6A.id}&date=2026-08-20&periodNumber=2`, {
      as: h.tokens.ct5
    });
    assert.deepEqual(
      [mine.data.takenBy, mine.data.substitute, mine.data.registers.map(r => r.key)],
      [t.ct5.userId, true, ["P2"]]
    );
    assert.deepEqual(
      mine.data.students.map(s => s.status),
      ["LATE", "PRESENT", "ABSENT"]
    );

    const forbidden = [
      `${A}/attendance/register?sectionId=${t.s6A.id}&date=2026-08-20&periodNumber=1`,
      `${A}/attendance/register?sectionId=${t.s6A.id}&date=2026-08-20`,
      `${A}/attendance/summary?sectionId=${t.s6A.id}`,
      `${A}/enrollments?sectionId=${t.s6A.id}`
    ];
    for (const url of forbidden) {
      const res = await request("GET", url, { as: h.tokens.ct5 });
      assert.deepEqual([res.status, res.body.message], [403, "You can only do this for sections you teach"], url);
    }
    await get(`${U}/students/${t.a6.id}`, { as: h.tokens.ct5 }, 404);
    assert.equal((await get(`${U}/students?limit=100`, { as: h.tokens.ct5 })).meta.total, 2, "still 5-A only");

    /* Covering a class today: the roster of that one period opens, to take its register */
    const today = todayIn("Asia/Kolkata");
    const cover = await get(`${A}/attendance/register?sectionId=${t.s6A.id}&date=${today}&periodNumber=4`, {
      as: h.tokens.ct5
    });
    assert.deepEqual(
      [cover.data.taken, cover.data.students.map(s => [s.firstName, s.status])],
      [
        false,
        [
          ["Fa6", null],
          ["Fb6", null],
          ["Fc6", null]
        ]
      ]
    );
    /* The cover screen: sections taking attendance by period today, then one section */
    const options = await get(`${A}/attendance/cover`, { as: h.tokens.ct5 });
    assert.equal(options.data.date, today);
    const listed = options.data.sections.find(x => x.id === t.s6A.id);
    assert.equal(listed?.label, "Class 6-A");
    assert.ok(
      options.data.sections.every(x => x.id !== world.s1A.id),
      "daily classes have no substitutes"
    );
    const six = await get(`${A}/attendance/cover/${t.s6A.id}`, { as: h.tokens.ct5 });
    assert.ok(six.data.periods.length > 0 && six.data.periods.every(p => typeof p.taken === "boolean"));
    assert.ok(six.data.subjects.some(x => x.subjectName === "Science"));
    const daily = await request("GET", `${A}/attendance/cover/${world.s1A.id}`, { as: h.tokens.ct5 });
    assert.equal(daily.status, 422);
    assert.match(daily.body.message, /does not take attendance by period today/);

    for (const url of [
      `${A}/attendance/register?sectionId=${t.s6A.id}&date=${today}`,
      `${A}/attendance/register?sectionId=${t.s6A.id}&date=${addDays(today, -1)}&periodNumber=4`
    ])
      await get(url, { as: h.tokens.ct5 }, 403);

    /* Staff see who stood in */
    const day = await get(`${A}/attendance/register?sectionId=${t.s6A.id}&date=2026-08-20`);
    assert.deepEqual(
      day.data.registers.map(r => [r.label, r.teacher.name, r.takenBy, r.substitute]),
      [
        ["Period 1 (Science)", "Fsci6 Lsci6", t.eng6.userId, true],
        ["Period 2 (Science)", "Fsub6 Lsub6", t.ct5.userId, true]
      ]
    );
  });
});

describe("attendance modes: period-wise attendance per subject (Class 6)", () => {
  /* Periods 6 to 21 August (Science / English):
       a6  Sci P A P L A  Eng P P   -> Science 3/5 = 60% on 2 days, English 2/2 = 100% on 2 days
       b6  Sci A E A P H  Eng A E   -> Science 1.5/(5-1) = 37.5% on 2 days, English 0/(2-1) = 0%
       c6  Sci L P P A P  Eng H A   -> Science 4/5 = 80% on 4 days, English 0.5/2 = 25% on 1 day
     Overall a6 5/7 = 71.4%, b6 1.5/5 = 30%, c6 4.5/7 = 64.3% */
  const subjects = student =>
    student.subjects.map(s => [s.name, s.held, s.attended, s.excused, s.percentage, s.daysAttended]);

  it("gives each subject its own percentage in the section summary", async () => {
    const summary = await get(`${A}/attendance/summary?sectionId=${t.s6A.id}&from=2026-08-06&to=2026-08-21`);
    assert.deepEqual([summary.data.basis, summary.data.workingDays], ["PERIODS", 14]);
    const [a6, b6, c6] = summary.data.students;
    assert.deepEqual(subjects(a6), [
      ["English", 2, 2, 0, 100, 2],
      ["Science", 5, 3, 0, 60, 2]
    ]);
    assert.deepEqual(subjects(b6), [
      ["English", 2, 0, 1, 0, 0],
      ["Science", 5, 1.5, 1, 37.5, 2]
    ]);
    assert.deepEqual(subjects(c6), [
      ["English", 2, 0.5, 0, 25, 1],
      ["Science", 5, 4, 0, 80, 4]
    ]);
    assert.deepEqual(a6.subjects[1], {
      subjectId: t.science.id,
      name: "Science",
      held: 5,
      attended: 3,
      excused: 0,
      percentage: 60,
      daysAttended: 2
    });

    /* The overall period percentage and the day status stay, as secondary figures */
    assert.deepEqual(
      [a6, b6, c6].map(s => [s.percentage, s.periods.percentage]),
      [
        [71.4, 71.4],
        [30, 30],
        [64.3, 64.3]
      ]
    );
    assert.deepEqual([a6.counts.PRESENT, a6.counts.ABSENT, a6.dayPercentage], [3, 1, 21.4]);
  });

  it("shows the same breakdown to staff and in the portal", async () => {
    const staff = await get(`${A}/attendance/students/${t.b6.id}?from=2026-08-06&to=2026-08-21`, { as: h.tokens.eng6 });
    assert.deepEqual(subjects(staff.data), [
      ["English", 2, 0, 1, 0, 0],
      ["Science", 5, 1.5, 1, 37.5, 2]
    ]);
    const portal = await get(`${ME}/students/${t.c6.id}/attendance?from=2026-08-06&to=2026-08-21`, { as: h.tokens.p6 });
    assert.deepEqual(subjects(portal.data), [
      ["English", 2, 0.5, 0, 25, 1],
      ["Science", 5, 4, 0, 80, 4]
    ]);
    assert.deepEqual([portal.data.basis, portal.data.percentage, portal.data.dayPercentage], ["PERIODS", 64.3, 28.6]);
  });

  it("has no subject breakdown where no period was taken", async () => {
    const summary = await get(`${A}/attendance/summary?sectionId=${t.s5A.id}&from=2026-08-03&to=2026-08-05`);
    assert.equal(summary.data.students[0].subjects, null);
  });
});

describe("attendance modes: deputy class teacher (Class 5)", () => {
  it("sets a deputy who is a teacher other than the class teacher", async () => {
    const same = await request("PATCH", `${A}/sections/${t.s5A.id}`, { body: { deputyClassTeacherId: t.ct5.id } });
    assert.deepEqual(
      [same.status, same.body.message],
      [422, "The deputy class teacher must be a different teacher from the class teacher"]
    );
    const both = await request("POST", `${A}/sections`, {
      body: { classId: t.class5.id, sectionName: "Z", classTeacherId: t.ct5.id, deputyClassTeacherId: t.ct5.id }
    });
    assert.deepEqual(
      [both.status, both.body.message],
      [400, "Invalid request: deputyClassTeacherId must be a different teacher from the class teacher"]
    );
    const unknown = await request("PATCH", `${A}/sections/${t.s5A.id}`, { body: { deputyClassTeacherId: uuid() } });
    assert.deepEqual(
      [unknown.status, unknown.body.message],
      [422, "deputyClassTeacherId does not refer to an existing teacher"]
    );
    await patch(`${A}/sections/${t.s5A.id}`, { deputyClassTeacherId: t.dep5.id }, { as: h.tokens.ct5 }, 403);

    const set = await patch(
      `${A}/sections/${t.s5A.id}`,
      { deputyClassTeacherId: t.dep5.id },
      { as: h.tokens.principal }
    );
    assert.equal(set.data.deputyClassTeacherId, t.dep5.id);
    const swap = await request("PATCH", `${A}/sections/${t.s5A.id}`, { body: { classTeacherId: t.dep5.id } });
    assert.equal(swap.status, 422, "the deputy cannot also become the class teacher");
    /* The database holds the same rule */
    await assert.rejects(
      h.pool.query("UPDATE sections SET class_teacher_id = deputy_class_teacher_id WHERE id = $1", [t.s5A.id]),
      error => error.code === "23514"
    );
    assert.equal((await get(`${A}/sections/${t.s5A.id}`)).data.deputyClassTeacher.id, t.dep5.id);
  });

  it("gives the deputy the section's scope and its daily registers", async () => {
    const ids = res => res.data.map(row => row.id).sort();
    assert.deepEqual(ids(await get(`${A}/sections`, { as: h.tokens.dep5 })), [t.s5A.id]);
    assert.deepEqual(ids(await get(`${U}/students?limit=100`, { as: h.tokens.dep5 })), [t.a5.id, t.b5.id].sort());
    await get(`${A}/timetable/sections/${t.s5A.id}`, { as: h.tokens.dep5 });
    await get(`${A}/attendance/summary?sectionId=${t.s5A.id}`, { as: h.tokens.dep5 });
    assert.deepEqual(
      (await get(`${ME}/teaching/sections`, { as: h.tokens.dep5 })).data.map(s => [
        s.section,
        s.isClassTeacher,
        s.isDeputyClassTeacher
      ]),
      [["Class 5-A", false, true]]
    );

    for (const kind of ["FORENOON", "AFTERNOON"]) {
      const res = await record(
        { sectionId: t.s5A.id, date: "2026-08-06", kind, records: marks(["a5", "b5"], ["PRESENT", "PRESENT"]) },
        h.tokens.dep5
      );
      assert.equal(res.status, 201, JSON.stringify(res.body));
    }
    await settleJobs();
  });

  it("keeps report cards, and other subjects' marks, with the class teacher", async () => {
    const cards = await request("GET", `${A}/report-cards/sections/${t.s5A.id}?examId=${t.unitTest.id}`, {
      as: h.tokens.dep5
    });
    assert.deepEqual(
      [cards.status, cards.body.message],
      [403, "Only the class teacher of this section can see its report cards"]
    );
    await get(`${A}/report-cards/sections/${t.s5A.id}?examId=${t.unitTest.id}`, { as: h.tokens.ct5 });
    const papers = await get(`${A}/exams/${t.unitTest.id}/papers?sectionId=${t.s5A.id}`, { as: h.tokens.dep5 });
    const marksBy = await request("POST", `${A}/marks`, {
      as: h.tokens.dep5,
      body: { examPaperId: papers.data[0].id, studentId: t.a5.id, marksObtained: 20 }
    });
    assert.deepEqual(
      [marksBy.status, marksBy.body.message],
      [403, "You can only do this for subjects you teach in this section"]
    );
  });
});

describe("attendance modes: registers nobody took", () => {
  const missing = (query, as) => get(`${A}/attendance/missing-registers?${query}`, { as });
  const rows = res =>
    res.data.registers.map(r => [r.date, r.section.name, r.label, r.responsible?.name ?? null, r.responsibleAs]);

  it("lists the registers the mode expected on working days, with the class teacher answering", async () => {
    /* 5-A, Mon 3 to Fri 7 August: both sessions taken on 3, 4 and 6; 5 and 7 lack the afternoon */
    const res = await missing(`from=2026-08-03&to=2026-08-07&sectionId=${t.s5A.id}`);
    assert.equal(res.message, "2 register(s) not taken from 2026-08-03 to 2026-08-07");
    assert.deepEqual(rows(res), [
      ["2026-08-05", "Class 5-A", "Afternoon", "Fct5 Lct5", "CLASS_TEACHER"],
      ["2026-08-07", "Class 5-A", "Afternoon", "Fct5 Lct5", "CLASS_TEACHER"]
    ]);
    assert.deepEqual(
      [res.data.registers[0].reason, res.data.registers[0].mode, res.data.registers[0].kind],
      ["Class teacher of Class 5-A", "TWO_SESSIONS", "AFTERNOON"]
    );
    assert.deepEqual(res.data.byTeacher, [{ teacherId: t.ct5.id, name: "Fct5 Lct5", missing: 2 }]);
  });

  it("expects only timetabled periods, answered for by the timetabled teacher", async () => {
    /* 6-A has classes on Thursdays only: the 6th, 13th and 20th were taken, the 27th was not */
    const res = await missing(`from=2026-08-03&to=2026-08-29&sectionId=${t.s6A.id}`);
    assert.deepEqual(rows(res), [
      ["2026-08-27", "Class 6-A", "Period 1 (Science)", "Fsci6 Lsci6", "TIMETABLED_TEACHER"],
      ["2026-08-27", "Class 6-A", "Period 2 (English)", "Fsub6 Lsub6", "TIMETABLED_TEACHER"]
    ]);
    assert.equal(res.data.registers[0].reason, "Timetabled for Science in Period 1 on Thursdays");
    assert.deepEqual(res.data.registers[1].subject, { id: world.english.id, subjectName: "English" });

    const bySub6 = await missing(`from=2026-08-03&to=2026-08-29&teacherId=${t.sub6.id}`, h.tokens.principal);
    assert.deepEqual(rows(bySub6), [
      ["2026-08-27", "Class 6-A", "Period 2 (English)", "Fsub6 Lsub6", "TIMETABLED_TEACHER"]
    ]);
  });

  it("shows ADMIN and PRINCIPAL every section, and a teacher only their own", async () => {
    const all = await missing("from=2026-08-03&to=2026-08-07");
    assert.ok(
      all.data.registers.some(r => r.section.id === world.s1A.id),
      "every section with students"
    );
    assert.equal(all.data.byTeacher.find(b => b.teacherId === t.ct5.id).missing, 2);
    assert.equal(all.data.total, all.data.registers.length);

    /* ct5 answers for 5-A only: the two afternoons, then every session from Saturday the 8th
       (Sundays off): 2 + 2 × 19 days */
    const ct5 = await missing("from=2026-08-03&to=2026-08-29", h.tokens.ct5);
    assert.deepEqual(ct5.data.byTeacher, [{ teacherId: t.ct5.id, name: "Fct5 Lct5", missing: 40 }]);
    assert.ok(ct5.data.registers.every(r => r.section.id === t.s5A.id));
    assert.deepEqual(
      ct5.data.registers.slice(0, 4).map(r => [r.date, r.label]),
      [
        ["2026-08-05", "Afternoon"],
        ["2026-08-07", "Afternoon"],
        ["2026-08-08", "Forenoon"],
        ["2026-08-08", "Afternoon"]
      ]
    );
    /* The deputy is not held to account; neither is a teacher for registers not theirs */
    assert.equal((await missing("from=2026-08-03&to=2026-08-29", h.tokens.dep5)).data.total, 0);
    assert.equal((await missing(`from=2026-08-03&to=2026-08-29&sectionId=${t.s5A.id}`, h.tokens.sci6)).data.total, 0);
    const other = await request(
      "GET",
      `${A}/attendance/missing-registers?from=2026-08-03&to=2026-08-07&teacherId=${t.sci6.id}`,
      {
        as: h.tokens.ct5
      }
    );
    assert.deepEqual(
      [other.status, other.body.message],
      [403, "You can only see the registers you were responsible for"]
    );
  });

  it("falls back to the subject teacher when the timetabled teacher's account is inactive", async () => {
    await call("DELETE", `${U}/${t.sub6.userId}`);
    const res = await missing(`from=2026-08-27&to=2026-08-27&sectionId=${t.s6A.id}`);
    const english = res.data.registers.find(r => r.periodNumber === 2);
    assert.deepEqual(
      [english.responsible.teacherId, english.responsibleAs, english.reason],
      [
        t.eng6.id,
        "SUBJECT_TEACHER",
        "Teaches English in Class 6-A (the timetabled teacher's account is no longer active)"
      ]
    );
  });

  it("validates the range and keeps the list to staff who answer for registers", async () => {
    const backwards = await request("GET", `${A}/attendance/missing-registers?from=2026-08-10&to=2026-08-03`);
    assert.equal(backwards.status, 400);
    const long = await request("GET", `${A}/attendance/missing-registers?from=2026-06-01&to=2026-12-31`);
    assert.deepEqual([long.status, long.body.message], [400, "Invalid request: to must be within 92 days of from"]);
    await get(`${A}/attendance/missing-registers?from=2026-08-03&to=2026-08-07`, { as: h.tokens.office }, 403);
    await get(`${A}/attendance/missing-registers?from=2026-08-03&to=2026-08-07&sectionId=${uuid()}`, {}, 404);
  });

  it("reminds each teacher in the evening, once, about the day's registers", async () => {
    const reminders = async token =>
      (await get(`${ME}/notifications?limit=100&type=ATTENDANCE_MISSED`, { as: token })).data;
    const run = async date => {
      await h.modules.jobs.enqueue("communication.missedRegisters", { tenantId: h.tenant.id, date });
      await settleJobs();
    };
    await run("2026-08-27");
    await run("2026-08-27");
    const [sci6] = await reminders(h.tokens.sci6);
    assert.equal((await reminders(h.tokens.sci6)).length, 1, "once only");
    assert.equal(sci6.title, "1 attendance register was not taken on 2026-08-27");
    assert.equal(
      sci6.body,
      "Nobody took this register you are responsible for on 2026-08-27: Class 6-A: Period 1 (Science). Please take it while the register is still open."
    );
    assert.deepEqual(sci6.data, {
      date: "2026-08-27",
      registers: [{ sectionId: t.s6A.id, kind: "PERIOD", periodNumber: 1 }]
    });
    assert.equal((await reminders(h.tokens.eng6))[0].data.registers[0].periodNumber, 2, "sub6 is inactive");
    const [ct5] = await reminders(h.tokens.ct5);
    assert.equal(ct5.title, "2 attendance registers were not taken on 2026-08-27");

    /* Closed days send nothing */
    const { remindMissedRegisters } =
      await import("../../src/modules/communication/subscribers/attendanceAlerts.subscriber.js");
    const sunday = await h.inSchool(() => remindMissedRegisters({ tenantId: h.tenant.id, date: "2026-08-30" }));
    assert.deepEqual(sunday, { date: "2026-08-30", closed: true, sent: 0 });
    assert.equal((await reminders(h.tokens.ct5)).length, 1);
  });
});
