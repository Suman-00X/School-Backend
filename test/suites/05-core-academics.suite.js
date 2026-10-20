import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, patch, del } from "../helpers/harness.js";

const A = "/api/v1/academics";

describe("calendar", () => {
  it("records holidays and computes working days", async () => {
    const holiday = await post(`${A}/calendar/events`, {
      title: "Founders' Day",
      eventType: "HOLIDAY",
      category: "SCHOOL",
      startDate: "2026-07-08"
    });
    assert.equal(holiday.data.isHoliday, true);
    assert.equal(holiday.data.endDate, "2026-07-08");
    await post(`${A}/calendar/events`, { title: "Sports Day", eventType: "EVENT", category: "SPORTS_DAY", startDate: "2026-07-10" });
    await post(`${A}/calendar/events`, { title: "Too late", eventType: "EVENT", category: "CELEBRATION", startDate: "2027-06-01" }, {}, 422);

    /* Mon 6 … Sat 11 July 2026, Sunday off, Wed 8 holiday -> 5 working days */
    const days = await get(`${A}/calendar/working-days?from=2026-07-06&to=2026-07-12`);
    assert.deepEqual(days.data.workingDays, ["2026-07-06", "2026-07-07", "2026-07-09", "2026-07-10", "2026-07-11"]);
    assert.deepEqual(
      days.data.closedDays.map(d => d.reason),
      ["HOLIDAY", "WEEKLY_OFF"]
    );

    const events = await get(`${A}/calendar/events?from=2026-07-01&to=2026-07-31`, { as: h.tokens.student1 });
    assert.equal(events.meta.total, 2);
  });

  it("closes the chosen Saturdays of each month", async () => {
    assert.deepEqual(world.y1.offSaturdays, []);
    await patch(`${A}/academic-years/${world.y1.id}`, { offSaturdays: [6] }, {}, 400);
    await patch(`${A}/academic-years/${world.y1.id}`, { offSaturdays: [2, 2] }, {}, 400);
    const year = await patch(`${A}/academic-years/${world.y1.id}`, { offSaturdays: [2, 4] });
    assert.deepEqual(year.data.offSaturdays, [2, 4]);

    /* July 2026 Saturdays: 4, 11 (2nd), 18, 25 (4th) */
    const days = await get(`${A}/calendar/working-days?from=2026-07-01&to=2026-07-31`);
    const saturdays = ["2026-07-04", "2026-07-11", "2026-07-18", "2026-07-25"];
    assert.deepEqual(
      saturdays.filter(day => days.data.workingDays.includes(day)),
      ["2026-07-04", "2026-07-18"]
    );
    assert.deepEqual(
      days.data.closedDays.filter(d => saturdays.includes(d.date)).map(d => d.reason),
      ["WEEKLY_OFF", "WEEKLY_OFF"]
    );

    await patch(`${A}/academic-years/${world.y1.id}`, { offSaturdays: [] });
  });
});

describe("attendance", () => {
  const register = (date, records, options) =>
    request("POST", `${A}/attendance`, { body: { sectionId: world.s1A.id, date, records }, ...options });

  it("starts from a two-day edit window that only admins can change", async () => {
    const policy = await get(`${A}/attendance/policy`, { as: h.tokens.teacher });
    assert.equal(policy.data.editWindowDays, 2);
    assert.deepEqual(policy.data.overrideRoles, ["ADMIN"]);
    assert.equal(
      policy.message,
      "Registers can be changed until 2 day(s) after the date. Attendance is taken once a day."
    );
    assert.equal(policy.data.mode, "DAILY");
    assert.equal(policy.data.periodPresenceThreshold, 50);

    await patch(`${A}/attendance/policy`, { editWindowDays: 30 }, { as: h.tokens.principal }, 403);
    await patch(`${A}/attendance/policy`, { overrideRoles: ["PRINCIPAL"] }, {}, 400);
    /* These tests record July registers: open the window wide for them */
    const wide = await patch(`${A}/attendance/policy`, { editWindowDays: 365 });
    assert.equal(wide.message, "Attendance policy updated: registers lock after 365 day(s) after the date");
  });

  it("takes and retakes a register idempotently", async () => {
    const first = await register("2026-07-06", [
      { studentId: world.s1.id, status: "PRESENT" },
      { studentId: world.s2.id, status: "PRESENT" }
    ]);
    assert.equal(first.status, 201);
    assert.equal(first.body.message, "Attendance recorded for 2 student(s)");

    const retake = await register(
      "2026-07-06",
      [
        { studentId: world.s1.id, status: "PRESENT" },
        { studentId: world.s2.id, status: "ABSENT" }
      ],
      { as: h.tokens.teacher }
    );
    assert.equal(retake.status, 200);
    assert.deepEqual(retake.body.data.summary.counts, { PRESENT: 1, ABSENT: 1, LATE: 0, HALF_DAY: 0, EXCUSED: 0 });

    const marks = [
      { studentId: world.s1.id, status: "LATE" },
      { studentId: world.s2.id, status: "HALF_DAY" }
    ];
    /* D-11: the daily register is the class teacher's; teacher2 only teaches English in 1-A */
    const subjectTeacher = await register("2026-07-07", marks, { as: h.tokens.teacher2 });
    assert.equal(subjectTeacher.status, 403);
    assert.equal(
      subjectTeacher.body.message,
      "Only the class teacher of Class 1-A or its deputy can take its daily register"
    );
    const tuesday = await register("2026-07-07", marks, { as: h.tokens.teacher });
    assert.equal(tuesday.status, 201);
  });

  it("refuses closed days, future dates, strangers and other teachers", async () => {
    const holiday = await register("2026-07-08", [{ studentId: world.s1.id, status: "PRESENT" }]);
    assert.equal(holiday.status, 422);
    assert.equal(holiday.body.message, "Attendance cannot be recorded on 2026-07-08: it is a holiday");

    const sunday = await register("2026-07-12", [{ studentId: world.s1.id, status: "PRESENT" }]);
    assert.match(sunday.body.message, /weekly off day/);

    const future = await register(addDays(todayIn("Asia/Kolkata"), 2), [{ studentId: world.s1.id, status: "PRESENT" }]);
    assert.equal(future.status, 422);
    assert.equal(future.body.message, "Attendance cannot be recorded for a future date");

    const stranger = await register("2026-07-09", [{ studentId: world.s3.id, status: "PRESENT" }]);
    assert.equal(stranger.status, 422);
    assert.match(stranger.body.message, /not enrolled in this section/);

    const notMine = await request("POST", `${A}/attendance`, {
      as: h.tokens.teacher2,
      body: { sectionId: world.s2A.id, date: "2026-07-09", records: [{ studentId: world.s3.id, status: "PRESENT" }] }
    });
    assert.equal(notMine.status, 403);
    assert.equal(notMine.body.message, "You can only do this for sections you teach");

    const duplicate = await register("2026-07-09", [
      { studentId: world.s1.id, status: "PRESENT" },
      { studentId: world.s1.id, status: "ABSENT" }
    ]);
    assert.equal(duplicate.status, 400);
  });

  it("locks registers after the edit window; override roles change them with a reason", async () => {
    await patch(`${A}/attendance/policy`, { editWindowDays: 0 });
    const marks = [
      { studentId: world.s1.id, status: "PRESENT" },
      { studentId: world.s2.id, status: "ABSENT" }
    ];

    const teacher = await register("2026-07-06", marks, { as: h.tokens.teacher });
    assert.equal(teacher.status, 403);
    assert.equal(
      teacher.body.message,
      "The register for 2026-07-06 was locked after 2026-07-06. Only ADMIN can change it now."
    );
    assert.equal((await register("2026-07-06", marks, { as: h.tokens.principal })).status, 403);

    const noReason = await register("2026-07-06", marks);
    assert.equal(noReason.status, 422);
    assert.equal(noReason.body.message, "The register for 2026-07-06 is locked: give an overrideReason to change it");

    const fixed = await request("POST", `${A}/attendance`, {
      body: {
        sectionId: world.s1A.id,
        date: "2026-07-06",
        records: marks,
        overrideReason: "Parent showed a medical note"
      }
    });
    assert.equal(fixed.status, 200);
    assert.equal(fixed.body.message, "Attendance updated for 2 student(s) (locked register changed by override)");

    const sheet = await get(`${A}/attendance/register?sectionId=${world.s1A.id}&date=2026-07-06`);
    assert.equal(sheet.data.locked, true);
    assert.equal(sheet.data.lockOverride.reason, "Parent showed a medical note");
    assert.equal(sheet.data.lockOverride.by, h.admin.id);

    /* The school can let the principal override too */
    await patch(`${A}/attendance/policy`, { overrideRoles: ["ADMIN", "PRINCIPAL"] });
    const principal = await request("POST", `${A}/attendance`, {
      as: h.tokens.principal,
      body: { sectionId: world.s1A.id, date: "2026-07-06", records: marks, overrideReason: "Register correction" }
    });
    assert.equal(principal.status, 200);

    await patch(`${A}/attendance/policy`, { editWindowDays: 365, overrideRoles: ["ADMIN"] });
  });

  it("shows the register and percentage summaries", async () => {
    const sheet = await get(`${A}/attendance/register?sectionId=${world.s1A.id}&date=2026-07-06`);
    assert.equal(sheet.data.taken, true);
    assert.deepEqual(
      sheet.data.students.map(s => s.status),
      ["PRESENT", "ABSENT"]
    );

    const blank = await get(`${A}/attendance/register?sectionId=${world.s1A.id}&date=2026-07-09`);
    assert.equal(blank.data.taken, false);
    assert.ok(blank.data.students.every(s => s.status === null));

    /* 5 working days: s1 present + late = 2/5; s2 absent + half day = 0.5/5 */
    const summary = await get(`${A}/attendance/summary?sectionId=${world.s1A.id}&from=2026-07-06&to=2026-07-11`);
    assert.equal(summary.data.workingDays, 5);
    const [one, two] = summary.data.students;
    assert.equal(one.percentage, 40);
    assert.equal(one.unmarked, 3);
    assert.equal(two.percentage, 10);
    assert.equal(summary.data.averagePercentage, 25);

    const mine = await get(`${A}/attendance/students/${world.s1.id}?from=2026-07-06&to=2026-07-11`);
    assert.deepEqual(
      mine.data.days.map(d => d.status),
      ["PRESENT", "LATE"]
    );
    assert.equal(mine.data.percentage, 40);
  });
});

describe("timetable", () => {
  it("defines a non-overlapping bell schedule", async () => {
    world.p1 = (
      await post(`${A}/periods`, { periodNumber: 1, name: "Period 1", startTime: "08:30", endTime: "09:15" })
    ).data;
    world.p2 = (
      await post(`${A}/periods`, { periodNumber: 2, name: "Period 2", startTime: "09:15", endTime: "10:00" })
    ).data;
    world.recess = (
      await post(`${A}/periods`, {
        periodNumber: 3,
        name: "Recess",
        startTime: "10:00",
        endTime: "10:15",
        isBreak: true
      })
    ).data;
    const overlap = await request("POST", `${A}/periods`, {
      body: { periodNumber: 9, name: "Bad", startTime: "09:00", endTime: "09:30" }
    });
    assert.equal(overlap.status, 409);
    assert.equal(overlap.body.message, "This time overlaps Period 1 (08:30–09:15)");
  });

  it("schedules classes and blocks every kind of clash", async () => {
    const slot = (body, status = 201) => post(`${A}/timetable/slots`, body, {}, status);
    const mondayMath = await slot({
      sectionId: world.s1A.id,
      weekday: 1,
      periodId: world.p1.id,
      subjectId: world.math.id
    });
    assert.equal(mondayMath.data.teacherId, world.teacher.id);

    const busySection = await request("POST", `${A}/timetable/slots`, {
      body: { sectionId: world.s1A.id, weekday: 1, periodId: world.p1.id, subjectId: world.english.id }
    });
    assert.equal(busySection.status, 409);
    assert.equal(busySection.body.message, "The section already has Mathematics on Monday Period 1");

    /* Maths in 2-A taught by teacher2 */
    await post(`${A}/section-subjects`, { sectionId: world.s2A.id, subjectId: world.math.id });
    await post(`${A}/teacher-assignments`, {
      teacherId: world.teacher2.id,
      sectionId: world.s2A.id,
      subjectId: world.math.id
    });
    const busyTeacher = await request("POST", `${A}/timetable/slots`, {
      body: {
        sectionId: world.s2A.id,
        weekday: 1,
        periodId: world.p1.id,
        subjectId: world.math.id,
        teacherId: world.teacher.id
      }
    });
    assert.equal(busyTeacher.status, 409);
    assert.equal(busyTeacher.body.message, "The teacher is already teaching Class 1-A on Monday Period 1");

    await slot({ sectionId: world.s1A.id, weekday: 1, periodId: world.recess.id, subjectId: world.math.id }, 422);
    await slot({ sectionId: world.s1A.id, weekday: 7, periodId: world.p2.id, subjectId: world.math.id }, 422);

    await slot({ sectionId: world.s1A.id, weekday: 2, periodId: world.p1.id, subjectId: world.math.id, room: "R1" });
    const busyRoom = await request("POST", `${A}/timetable/slots`, {
      body: { sectionId: world.s2A.id, weekday: 2, periodId: world.p1.id, subjectId: world.math.id, room: "R1" }
    });
    assert.equal(busyRoom.status, 409);
    assert.equal(busyRoom.body.message, "Room R1 is already in use on Tuesday Period 1");
    await slot({ sectionId: world.s1A.id, weekday: 1, periodId: world.p2.id, subjectId: world.english.id });
  });

  it("renders section and teacher weekly grids", async () => {
    const grid = await get(`${A}/timetable/sections/${world.s1A.id}`);
    assert.equal(grid.data.days.length, 6);
    const monday = grid.data.days.find(d => d.weekday === 1);
    assert.deepEqual(
      monday.slots.map(s => s.subject.subjectCode),
      ["MA", "EN"]
    );
    assert.equal(monday.slots[0].teacher.name, "Fteacher Lteacher");

    const teacherGrid = await get(`${A}/timetable/teachers/${world.teacher.id}`);
    assert.equal(teacherGrid.data.weeklyLessons, 2);
  });
});

describe("grading, report cards and results", () => {
  const bands = [
    { grade: "A", minPercent: 90, maxPercent: 100, gradePoint: 10 },
    { grade: "B", minPercent: 75, maxPercent: 90, gradePoint: 8 },
    { grade: "C", minPercent: 50, maxPercent: 75, gradePoint: 6 },
    { grade: "D", minPercent: 33, maxPercent: 50, gradePoint: 4 },
    { grade: "E", minPercent: 0, maxPercent: 33, isPassing: false }
  ];

  it("validates and stores grade scales", async () => {
    const gap = await request("POST", `${A}/grade-scales`, {
      body: {
        name: "Broken",
        bands: [
          { grade: "A", minPercent: 50, maxPercent: 100 },
          { grade: "B", minPercent: 0, maxPercent: 40 }
        ]
      }
    });
    assert.equal(gap.status, 422);
    assert.match(gap.body.message, /contiguous/);

    const scale = await post(`${A}/grade-scales`, { name: "Standard", isDefault: true, bands });
    assert.deepEqual(
      scale.data.bands.map(b => b.grade),
      ["E", "D", "C", "B", "A"]
    );
    world.scale = scale.data;
  });

  it("grades marks automatically and enforces teacher subjects", async () => {
    const english = await post(
      `${A}/marks`,
      { studentId: world.s1.id, examPaperId: world.englishPaper.id, marksObtained: 45 },
      {},
      200
    );
    assert.equal(english.data.grade, "A");

    const wrongSubject = await request("POST", `${A}/marks`, {
      as: h.tokens.teacher2,
      body: { studentId: world.s1.id, examPaperId: world.paper.id, marksObtained: 70 }
    });
    assert.equal(wrongSubject.status, 403);
    assert.equal(wrongSubject.body.message, "You can only do this for subjects you teach in this section");
  });

  it("builds the section result sheet with ranks and statistics", async () => {
    const sheet = await get(`${A}/report-cards/sections/${world.s1A.id}?examId=${world.exam.id}`);
    const [top, second] = sheet.data.students.sort((a, b) => a.rank - b.rank);
    /* s1: (90 + 45) / 150 = 90% -> A, PASS. s2: absent in maths, 12/50 in English -> FAIL */
    assert.equal(top.studentId, world.s1.id);
    assert.equal(top.percentage, 90);
    assert.equal(top.grade, "A");
    assert.equal(top.result, "PASS");
    assert.equal(top.rank, 1);
    assert.equal(second.result, "FAIL");
    assert.equal(second.subjects.find(s => s.subject.subjectCode === "MA").grade, "AB");
    assert.equal(sheet.data.statistics.passPercentage, 50);
    assert.equal(sheet.data.statistics.subjects.find(s => s.subject.subjectCode === "MA").average, 90);

    const otherSection = await request("GET", `${A}/report-cards/sections/${world.s2A.id}?examId=${world.exam.id}`, {
      as: h.tokens.teacher
    });
    assert.equal(otherSection.status, 403);
  });

  it("builds a student's report card", async () => {
    const card = await get(`${A}/report-cards/students/${world.s1.id}?examId=${world.exam.id}`);
    assert.equal(card.data.reports.length, 1);
    assert.equal(card.data.reports[0].rank, 1);
    assert.equal(card.data.reports[0].sectionSize, 2);
    assert.equal(card.data.student.section.name, "Class 1-A");
  });

  it("publishes and withdraws results", async () => {
    /* Publishing now freezes a versioned report snapshot per student (D-10) */
    const published = await post(`${A}/exams/${world.exam.id}/result-publication`, {}, {}, 200);
    assert.equal(published.message, "Mid Term results published (version 1, 2 report cards)");
    assert.equal(published.data.publication.status, "CURRENT");
    await post(`${A}/exams/${world.exam.id}/result-publication`, {}, {}, 409);
    const withdrawn = await del(`${A}/exams/${world.exam.id}/result-publication`);
    assert.equal(
      withdrawn.message,
      "Mid Term results withdrawn: version 1 is hidden from students and parents and kept on record"
    );
    await del(`${A}/exams/${world.exam.id}/result-publication`, {}, 404);
    assert.equal(
      (await post(`${A}/exams/${world.exam.id}/result-publication`, {}, {}, 200)).data.publication.version,
      2
    );
  });

  it("schedules papers without clashes and protects recorded marks", async () => {
    await patch(`${A}/exams/${world.exam.id}/papers/${world.paper.id}`, { startTime: "09:00", endTime: "12:00" });
    const clash = await request("PATCH", `${A}/exams/${world.exam.id}/papers/${world.englishPaper.id}`, {
      body: { examDate: "2026-09-02", startTime: "10:00", endTime: "11:00" }
    });
    assert.equal(clash.status, 409);
    assert.match(clash.body.message, /already sits Mathematics/);

    const shrink = await request("PATCH", `${A}/exams/${world.exam.id}/papers/${world.paper.id}`, {
      body: { maxMarks: 80 }
    });
    assert.equal(shrink.status, 422);
    assert.equal(shrink.body.message, "maxMarks cannot be below the highest recorded mark (90)");

    await del(`${A}/exams/${world.exam.id}/papers/${world.paper.id}`, {}, 409);
  });
});
