/* The timetable solvers on their own (no database): every hard rule holds on generated
   schools of several shapes, full weeks are filled, and impossible demands are reported.

     node --test test/scheduling-solvers.test.js */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { solveClassTimetable } from "../src/modules/academics/scheduling/solvers/classTimetable.solver.js";
import { solveExamTimetable } from "../src/modules/academics/scheduling/solvers/examTimetable.solver.js";

/* ---------- class timetables ---------- */

/* Eight teaching periods with lunch after the fourth; nine subjects, 40 of 48 periods a week */
const school = ({ classes = 6, perClass = 3, seed = 7 } = {}) => {
  const periods = [];
  for (let n = 1; n <= 9; n++)
    periods.push({ id: `p${n}`, periodNumber: n, name: n === 5 ? "Lunch" : `P${n}`, isBreak: n === 5 });
  const subjects = [
    ["MATH", 7, 0, 4],
    ["ENG", 6, 0, 5],
    ["SCI", 6, 1, 5],
    ["SOC", 5, 0, 5],
    ["HIN", 5, 0, 5],
    ["CS", 4, 1, 5],
    ["PE", 3, 0, 12],
    ["ART", 2, 0, 12],
    ["MUS", 2, 0, 12]
  ];
  const lessons = [];
  const current = {};
  let teacherCount = 0;
  for (let c = 0; c < classes; c++) {
    for (let s = 0; s < perClass; s++) {
      for (const [subjectId, perWeek, doubles, sectionsPerTeacher] of subjects) {
        const slot = (current[subjectId] ??= { teacherId: null, sections: 0 });
        if (!slot.teacherId || slot.sections >= sectionsPerTeacher)
          Object.assign(slot, { teacherId: `T${teacherCount++}`, sections: 0 });
        slot.sections++;
        lessons.push({
          sectionId: `S${c}-${s}`,
          subjectId,
          teacherId: slot.teacherId,
          perWeek,
          doubles,
          maxPerDay: Math.max(Math.ceil(perWeek / 6), doubles ? 2 : 1),
          room: subjectId === "SCI" && c === 0 ? "LAB" : null,
          preferredPeriods: subjectId === "MATH" ? [1, 2, 3, 4] : undefined
        });
      }
    }
  }
  return {
    days: [1, 2, 3, 4, 5, 6],
    periods,
    lessons,
    fixed: [],
    blocked: [],
    defaults: { teacherMaxPerDay: 6, teacherMaxConsecutive: 4 },
    seed
  };
};

/* Every hard rule, checked from the output alone */
const assertValid = (input, result) => {
  const bell = input.periods.map(p => p.id);
  const teaching = new Set(input.periods.filter(p => !p.isBreak).map(p => p.id));
  const seen = new Set();
  const all = [...input.fixed, ...result.placements];
  for (const p of all) {
    assert.ok(input.days.includes(p.weekday), "a school day");
    assert.ok(teaching.has(p.periodId), "a teaching period");
    for (const key of [`S${p.sectionId}`, `T${p.teacherId}`, p.room && `R${p.room}`].filter(Boolean)) {
      const cell = `${key}|${p.weekday}|${p.periodId}`;
      assert.ok(!seen.has(cell), `one class at a time: ${cell}`);
      seen.add(cell);
    }
  }
  for (const b of input.blocked)
    assert.ok(!seen.has(`${b.kind[0]}${b.id}|${b.weekday}|${b.periodId}`), "blocked cells stay empty");

  for (const lesson of input.lessons) {
    const placed = result.placements.filter(p => p.sectionId === lesson.sectionId && p.subjectId === lesson.subjectId);
    const missing =
      result.unplaced.find(u => u.sectionId === lesson.sectionId && u.subjectId === lesson.subjectId)?.missingPeriods ??
      0;
    assert.equal(placed.length + missing, lesson.perWeek, "every class placed or reported");
    for (const day of input.days)
      assert.ok(placed.filter(p => p.weekday === day).length <= lesson.maxPerDay, "subject daily limit");
    /* doubles: two joined periods (no break between) on one day */
    const doubles = placed.filter(p => p.double);
    for (const day of input.days) {
      const at = doubles
        .filter(p => p.weekday === day)
        .map(p => bell.indexOf(p.periodId))
        .sort((a, b) => a - b);
      for (let i = 0; i < at.length; i += 2) assert.equal(at[i + 1], at[i] + 1, "a double is two periods in a row");
    }
  }

  const byTeacher = new Map();
  for (const p of all) byTeacher.set(p.teacherId, [...(byTeacher.get(p.teacherId) ?? []), p]);
  for (const b of input.blocked.filter(x => x.kind === "TEACHER" && x.reason === "LESSON")) {
    byTeacher.set(b.id, [...(byTeacher.get(b.id) ?? []), b]);
  }
  for (const [teacherId, list] of byTeacher) {
    const own = input.teacherLimits?.[teacherId] ?? {};
    const maxPerDay = own.maxPerDay ?? input.defaults?.teacherMaxPerDay ?? Infinity;
    const maxRun = own.maxConsecutive ?? input.defaults?.teacherMaxConsecutive ?? Infinity;
    for (const day of input.days) {
      const at = list
        .filter(p => p.weekday === day)
        .map(p => bell.indexOf(p.periodId))
        .sort((a, b) => a - b);
      assert.ok(at.length <= maxPerDay, "teacher daily limit");
      let run = 1;
      for (let i = 1; i < at.length; i++) {
        run = at[i] === at[i - 1] + 1 ? run + 1 : 1;
        assert.ok(run <= maxRun, "teacher periods in a row");
      }
    }
  }
};

describe("class timetable solver", () => {
  it("places every class of a school without breaking a rule", () => {
    for (const seed of [1, 2, 3]) {
      const input = school({ seed });
      const result = solveClassTimetable(input);
      assertValid(input, result);
      assert.equal(result.score.complete, true);
      assert.deepEqual(result.issues, []);
    }
  });

  it("is deterministic for a seed", () => {
    const a = solveClassTimetable(school({ seed: 5 }));
    const b = solveClassTimetable(school({ seed: 5 }));
    assert.deepEqual(a.placements, b.placements);
    assert.notDeepEqual(a.placements, solveClassTimetable(school({ seed: 6 })).placements);
  });

  it("fills a full week (48 of 48 periods)", () => {
    const input = school({ classes: 4 });
    let k = 0;
    for (const lesson of input.lessons) {
      if (lesson.subjectId === "ART") lesson.perWeek = 4;
      if (lesson.subjectId === "MUS") lesson.perWeek = 6;
      if (lesson.subjectId === "PE") lesson.perWeek = 5;
      if (["ART", "MUS", "PE"].includes(lesson.subjectId))
        lesson.teacherId = `X${lesson.subjectId}${Math.floor(k++ / 3)}`;
    }
    const result = solveClassTimetable(input);
    assertValid(input, result);
    assert.equal(result.score.complete, true);
  });

  it("keeps fixed classes, blocked cells and teacher limits", () => {
    const input = school({ classes: 3 });
    /* Art: its teacher has 18 periods a week, so 4 a day and 2 in a row still fit */
    const first = input.lessons.find(l => l.subjectId === "ART");
    first.perWeek -= 1;
    input.fixed = [
      { sectionId: first.sectionId, subjectId: first.subjectId, teacherId: first.teacherId, weekday: 1, periodId: "p1" }
    ];
    input.blocked = [
      { kind: "TEACHER", id: first.teacherId, weekday: 2, periodId: "p1", reason: "UNAVAILABLE" },
      { kind: "TEACHER", id: first.teacherId, weekday: 3, periodId: "p2", reason: "LESSON" },
      ...["p6", "p7", "p8", "p9"].map(periodId => ({
        kind: "SECTION",
        id: first.sectionId,
        weekday: 6,
        periodId,
        reason: "CLOSED"
      }))
    ];
    input.teacherLimits = { [first.teacherId]: { maxPerDay: 4, maxConsecutive: 2 } };
    const result = solveClassTimetable(input);
    assertValid(input, result);
    assert.equal(result.score.complete, true);
    assert.ok(!result.placements.some(p => p.sectionId === first.sectionId && p.weekday === 1 && p.periodId === "p1"));
  });

  it("reports demand that cannot fit, and places what it can", () => {
    const input = school({ classes: 2 });
    for (const lesson of input.lessons.filter(l => l.subjectId === "MATH")) lesson.teacherId = "BUSY";
    const result = solveClassTimetable(input);
    assertValid(input, result);
    assert.equal(result.score.complete, false);
    /* 42 periods fit in 48 cells, but not at 6 a day (36) */
    const issue = result.issues.find(i => i.code === "TEACHER_DAILY_LIMIT_TOO_LOW");
    assert.deepEqual([issue.teacherId, issue.needed, issue.available], ["BUSY", 42, 36]);
    assert.ok(result.unplaced.every(u => u.teacherId === "BUSY"));
  });
});

/* ---------- exam timetables ---------- */

const schoolDays = n => {
  const out = [];
  const day = new Date("2026-11-02");
  while (out.length < n) {
    if (day.getUTCDay() !== 0) out.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out;
};

const examPapers = ({ classes = 6, perClass = 3, subjects = 8 } = {}) => {
  const papers = [];
  for (let c = 0; c < classes; c++) {
    for (let s = 0; s < perClass; s++) {
      for (let j = 0; j < subjects; j++)
        papers.push({
          id: `P${c}-${s}-${j}`,
          sectionId: `S${c}-${s}`,
          classId: `C${c}`,
          subjectId: `SUB${j}`,
          component: null
        });
    }
  }
  return papers;
};

const assertExamValid = (input, result) => {
  const rules = { maxPapersPerDay: 1, minGapDays: 0, align: "CLASS", ...input.rules };
  const paper = new Map(input.papers.map(p => [p.id, p]));
  const bySection = new Map();
  for (const row of result.rows) {
    assert.ok(input.dates.includes(row.examDate), "a school day of the window");
    const p = paper.get(row.paperId);
    bySection.set(p.sectionId, [...(bySection.get(p.sectionId) ?? []), row]);
  }
  for (const rows of bySection.values()) {
    for (const day of input.dates)
      assert.ok(rows.filter(r => r.examDate === day).length <= rules.maxPapersPerDay, "papers a day");
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const [a, b] = [rows[i], rows[j]];
        assert.ok(
          !(a.examDate === b.examDate && a.startTime < b.endTime && b.startTime < a.endTime),
          "one paper at a time"
        );
        const gap = Math.abs(input.dates.indexOf(a.examDate) - input.dates.indexOf(b.examDate));
        assert.ok(gap === 0 || gap > rules.minGapDays, "free days between papers");
      }
    }
  }
  if (rules.align === "CLASS") {
    const when = new Map();
    for (const row of result.rows) {
      const p = paper.get(row.paperId);
      const key = `${p.classId}|${p.subjectId}|${p.component}`;
      if (when.has(key))
        assert.equal(when.get(key), `${row.examDate} ${row.startTime}`, "a class sits a subject together");
      when.set(key, `${row.examDate} ${row.startTime}`);
    }
  }
};

const MORNING = [{ name: "Morning", startTime: "09:30", endTime: "12:30" }];
const BOTH = [...MORNING, { name: "Afternoon", startTime: "13:30", endTime: "16:30" }];

describe("exam timetable solver", () => {
  it("schedules every paper, a subject at once for a class", () => {
    const input = { dates: schoolDays(12), sessions: MORNING, papers: examPapers(), seed: 3 };
    const result = solveExamTimetable(input);
    assertExamValid(input, result);
    assert.equal(result.score.complete, true);
  });

  it("packs a window exactly as long as the rules allow", () => {
    const input = { dates: schoolDays(16), sessions: MORNING, papers: examPapers(), rules: { minGapDays: 1 }, seed: 4 };
    const result = solveExamTimetable(input);
    assertExamValid(input, result);
    assert.equal(result.score.complete, true);
  });

  it("uses two sittings a day when allowed, and avoids other exams", () => {
    const dates = schoolDays(7);
    const busy = [{ sectionId: "S0-0", date: dates[0], startTime: "10:00", endTime: "11:00" }];
    const input = { dates, sessions: BOTH, papers: examPapers(), rules: { maxPapersPerDay: 2 }, busy, seed: 5 };
    const result = solveExamTimetable(input);
    assertExamValid(input, result);
    assert.equal(result.score.complete, true);
    assert.ok(
      !result.rows.some(r => r.paperId.startsWith("P0-0-") && r.examDate === dates[0] && r.startTime === "09:30")
    );
  });

  it("reports a window too short", () => {
    const input = { dates: schoolDays(5), sessions: MORNING, papers: examPapers({ classes: 1, perClass: 1 }) };
    const result = solveExamTimetable(input);
    assert.equal(result.score.placedPapers, 5);
    assert.deepEqual(
      result.issues.map(i => [i.code, i.needed, i.available]),
      [["WINDOW_TOO_SHORT", 8, 5]]
    );
  });
});
