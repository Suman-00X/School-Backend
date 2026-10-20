import { unprocessable } from "../../../../common/http/errors.js";
import { teacherService } from "../../../users/teachers/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { subjectService } from "../../subjects/index.js";
import { WEEKDAY_NAMES } from "../../shared/constants/academic.constants.js";
import { teacherAssignmentService } from "../../teacher-assignments/index.js";
import { periodService, timetableService } from "../../timetable/index.js";
import { DEFAULT_TIME_LIMIT_MS } from "../constants/scheduling.constants.js";
import { CLASS_REASONS, solveClassTimetable } from "../solvers/classTimetable.solver.js";
import { fingerprintOf } from "../utils/fingerprint.util.js";
import { newSeed } from "../utils/random.util.js";

/* Class timetables: reads what the solver needs from the school's records (sections, their
   subjects and classes a week, teacher assignments, the bell schedule, the timetable so far),
   turns the request's rules into solver input, and words the solver's findings for people. */

const sectionName = section => `${section.class?.className ?? "Class"}-${section.sectionName}`;
const personName = teacher =>
  `${teacher.user?.firstName ?? ""} ${teacher.user?.lastName ?? ""}`.trim() || teacher.employeeCode;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ISO weekdays the school is open every week (academic year's weekly off days: 0 = Sunday) */
const schoolDays = academicYear =>
  [1, 2, 3, 4, 5, 6, 7].filter(weekday => !academicYear.weeklyOffDays.includes(weekday % 7));

const REASON_TEXT = {
  SECTION_FULL: "the section already has a class",
  SECTION_CLOSED: "the section has no classes then",
  TEACHER_BUSY: "the teacher is teaching another class",
  TEACHER_UNAVAILABLE: "the teacher is not available",
  ROOM_BUSY: "the room is in use",
  SUBJECT_DAILY_LIMIT: "the subject's daily limit is reached",
  TEACHER_DAILY_LIMIT: "the teacher's daily limit is reached",
  TEACHER_CONSECUTIVE_LIMIT: "the teacher would teach too many periods in a row",
  NO_ROOM_FOR_DOUBLE: "a double does not fit (no two periods in a row)"
};

/* The most specific subject rule for a section: sectionIds over classIds over general */
const ruleFor = (rules, section, subjectId) => {
  const matching = rules.filter(
    r =>
      r.subjectId === subjectId &&
      (!r.sectionIds || r.sectionIds.includes(section.id)) &&
      (!r.classIds || r.classIds.includes(section.classId))
  );
  return (
    matching.sort((a, b) => (b.sectionIds ? 2 : b.classIds ? 1 : 0) - (a.sectionIds ? 2 : a.classIds ? 1 : 0))[0] ?? {}
  );
};

/* Everything the solver and the people reading its result need, for one request */
const gather = async (ctx, academicYear, request) => {
  const allSections = await sectionService.findAllInYear(ctx, academicYear.id);
  if (!allSections.length)
    throw unprocessable("This academic year has no sections yet. Add classes and sections first.");
  let sections = allSections;
  if (request.sectionIds?.length) {
    const wanted = new Set(request.sectionIds);
    sections = allSections.filter(s => wanted.has(s.id));
    if (sections.length !== wanted.size)
      throw unprocessable("sectionIds refers to a section that is not in this academic year");
  }
  sections.sort(
    (a, b) => (a.class?.classOrder ?? 0) - (b.class?.classOrder ?? 0) || a.sectionName.localeCompare(b.sectionName)
  );
  const inScope = new Set(sections.map(s => s.id));

  const periods = (await periodService.findAllInYear(ctx, academicYear.id)).sort((a, b) =>
    a.startTime.localeCompare(b.startTime)
  );
  const teaching = periods.filter(p => !p.isBreak);
  if (!teaching.length) throw unprocessable("This academic year has no bell schedule yet. Add its periods first.");
  const days = schoolDays(academicYear);
  if (!days.length)
    throw unprocessable("This academic year has no school days in the week (every day is a weekly off day)");

  const [sectionSubjects, assignments, slots] = await Promise.all([
    sectionSubjectService.findForSections(ctx, [...inScope]),
    teacherAssignmentService.findInYear(ctx, academicYear.id),
    timetableService.lessonsInYear(ctx, academicYear.id)
  ]);

  const teacherIds = new Set([
    ...assignments.map(a => a.teacherId),
    ...slots.map(s => s.teacherId),
    ...request.teachers.map(t => t.teacherId)
  ]);
  const subjectIds = new Set([
    ...sectionSubjects.map(s => s.subjectId),
    ...request.subjects.map(r => r.subjectId),
    ...request.pinned.map(p => p.subjectId)
  ]);
  const [teachers, subjects] = await Promise.all([
    teacherService.findActiveByIds(ctx, [...teacherIds]),
    subjectService.findManyByIds(ctx, [...subjectIds])
  ]);

  return {
    academicYear,
    sections,
    allSections,
    inScope,
    periods,
    teaching,
    days,
    sectionSubjects,
    assignments,
    slots,
    teachers,
    subjects
  };
};

/* The parts applying checks again: if any changed, the draft no longer fits the school */
const fingerprint = (data, request) =>
  fingerprintOf({
    scope: [...data.inScope],
    periods: data.periods.map(p => [p.id, p.startTime, p.endTime, p.isBreak]),
    days: data.days,
    subjects: data.sectionSubjects.map(s => [s.sectionId, s.subjectId, s.weeklyNoOfClasses]),
    teachers: data.assignments.map(a => [a.sectionId, a.subjectId, a.teacherId]).concat(data.teachers.map(t => [t.id])),
    timetable: data.slots.map(s => [s.id, s.sectionId, s.weekday, s.periodId, s.subjectId, s.teacherId, s.room]),
    request: [request.mode]
  });

/* Request + school data -> solver input, the issues found on the way, and name lookups */
const buildInput = (data, request) => {
  const { sections, inScope, teaching, days, sectionSubjects, assignments, slots } = data;
  const names = {
    section: new Map(data.allSections.map(s => [s.id, sectionName(s)])),
    subject: new Map(data.subjects.map(s => [s.id, s.subjectName])),
    teacher: new Map(data.teachers.map(t => [t.id, personName(t)]))
  };
  const activeTeachers = new Set(data.teachers.map(t => t.id));
  const sectionById = new Map(sections.map(s => [s.id, s]));
  const periodByNumber = new Map(teaching.map(p => [p.periodNumber, p]));
  const issues = [];
  const issue = (severity, code, message, refs = {}) => issues.push({ severity, code, message, ...refs });

  /* rules must name teachers and subjects of the school */
  request.teachers.forEach((rule, i) => {
    if (!activeTeachers.has(rule.teacherId))
      throw unprocessable(`teachers[${i}].teacherId does not refer to an active teacher`);
  });
  request.subjects.forEach((rule, i) => {
    if (!names.subject.has(rule.subjectId))
      throw unprocessable(`subjects[${i}].subjectId does not refer to an existing subject`);
  });

  const teacherOf = new Map(assignments.map(a => [`${a.sectionId}|${a.subjectId}`, a.teacherId]));
  const scopeSlots = slots.filter(s => inScope.has(s.sectionId));
  const outsideSlots = slots.filter(s => !inScope.has(s.sectionId));
  const fill = request.mode === "FILL";

  /* kept lessons (FILL) and pinned classes stay where they are */
  const fixed = [];
  const taken = new Set();
  if (fill) {
    for (const slot of scopeSlots) {
      fixed.push({
        sectionId: slot.sectionId,
        subjectId: slot.subjectId,
        teacherId: slot.teacherId,
        weekday: slot.weekday,
        periodId: slot.periodId,
        room: slot.room
      });
      taken.add(`${slot.sectionId}|${slot.weekday}|${slot.periodId}`);
    }
  }
  const pins = [];
  request.pinned.forEach((pin, i) => {
    const section = sectionById.get(pin.sectionId);
    const period = periodByNumber.get(pin.periodNumber);
    const where = `pinned[${i}]`;
    if (!section) throw unprocessable(`${where}.sectionId is not one of the sections being planned`);
    if (!period) throw unprocessable(`${where}.periodNumber is not a teaching period of the bell schedule`);
    if (!days.includes(pin.weekday)) throw unprocessable(`${where}: ${WEEKDAY_NAMES[pin.weekday]} is a weekly off day`);
    if (!sectionSubjects.some(s => s.sectionId === pin.sectionId && s.subjectId === pin.subjectId)) {
      throw unprocessable(
        `${where}: ${names.subject.get(pin.subjectId) ?? "the subject"} is not taught in ${sectionName(section)}`
      );
    }
    const teacherId = teacherOf.get(`${pin.sectionId}|${pin.subjectId}`);
    if (!teacherId || !activeTeachers.has(teacherId))
      throw unprocessable(`${where}: no teacher is assigned to the subject in ${sectionName(section)}`);
    const cell = `${pin.sectionId}|${pin.weekday}|${period.id}`;
    if (taken.has(cell))
      throw unprocessable(
        `${where}: ${sectionName(section)} already has a class on ${WEEKDAY_NAMES[pin.weekday]} period ${pin.periodNumber}`
      );
    taken.add(cell);
    const subjectRule = ruleFor(request.subjects, section, pin.subjectId);
    const slot = {
      sectionId: pin.sectionId,
      subjectId: pin.subjectId,
      teacherId,
      weekday: pin.weekday,
      periodId: period.id,
      room: subjectRule.room ?? null
    };
    fixed.push(slot);
    pins.push(slot);
  });

  /* Days a class can be held at all: not a day the teacher is away or the section closed
     (the default daily limit spreads the classes over these) */
  const wholeDay = numbers => !numbers || teaching.every(p => numbers.includes(p.periodNumber));
  const awayDays = new Map();
  for (const rule of request.teachers) {
    awayDays.set(
      rule.teacherId,
      new Set((rule.unavailable ?? []).filter(off => wholeDay(off.periodNumbers)).map(off => off.weekday))
    );
  }
  const closedDays = section =>
    new Set(
      request.closedPeriods
        .filter(
          c =>
            (!c.sectionIds || c.sectionIds.includes(section.id)) &&
            (!c.classIds || c.classIds.includes(section.classId))
        )
        .filter(c => wholeDay(c.periodNumbers))
        .map(c => c.weekday)
    );
  const openDays = (section, teacherId) => {
    const closed = closedDays(section);
    const away = awayDays.get(teacherId) ?? new Set();
    return Math.max(1, days.filter(day => !closed.has(day) && !away.has(day)).length);
  };

  /* lessons: each section subject's classes a week, less what is kept or pinned */
  const lessons = [];
  for (const ss of sectionSubjects) {
    const section = sectionById.get(ss.sectionId);
    const label = `${names.subject.get(ss.subjectId) ?? "A subject"} in ${sectionName(section)}`;
    const refs = { sectionId: ss.sectionId, subjectId: ss.subjectId };
    if (!ss.weeklyNoOfClasses) {
      issue("WARNING", "NO_WEEKLY_CLASSES", `${label} has no classes a week set, so it is left out`, refs);
      continue;
    }
    const already = fixed.filter(f => f.sectionId === ss.sectionId && f.subjectId === ss.subjectId).length;
    const perWeek = ss.weeklyNoOfClasses - already;
    if (perWeek < 0) {
      issue(
        "WARNING",
        "MORE_THAN_WEEKLY",
        `${label} already has ${plural(already, "class", "classes")}, more than its ${ss.weeklyNoOfClasses} a week`,
        refs
      );
    }
    if (perWeek <= 0) continue;
    const teacherId = teacherOf.get(`${ss.sectionId}|${ss.subjectId}`);
    if (!teacherId || !activeTeachers.has(teacherId)) {
      issue(
        "ERROR",
        "NO_TEACHER",
        `${label} has no ${teacherId ? "active " : ""}teacher assigned, so its ${plural(perWeek, "class", "classes")} cannot be placed`,
        { ...refs, needed: perWeek }
      );
      continue;
    }
    const rule = ruleFor(request.subjects, section, ss.subjectId);
    const doubles = Math.min(rule.doublePeriods ?? 0, Math.floor(perWeek / 2));
    let maxPerDay =
      rule.maxPerDay ?? Math.max(Math.ceil(ss.weeklyNoOfClasses / openDays(section, teacherId)), doubles ? 2 : 1);
    if (doubles && maxPerDay < 2) {
      issue(
        "WARNING",
        "DAILY_LIMIT_RAISED",
        `${label}: a double needs two periods in a day, so its daily limit is 2`,
        refs
      );
      maxPerDay = 2;
    }
    lessons.push({
      sectionId: ss.sectionId,
      subjectId: ss.subjectId,
      teacherId,
      perWeek,
      doubles,
      maxPerDay,
      preferredPeriods: rule.preferredPeriods,
      avoidPeriods: rule.avoidPeriods,
      room: rule.room ?? null
    });
  }

  /* what other sections' lessons, teacher rules and closed periods take away */
  const blocked = [];
  for (const slot of outsideSlots) {
    blocked.push({
      kind: "TEACHER",
      id: slot.teacherId,
      weekday: slot.weekday,
      periodId: slot.periodId,
      reason: "LESSON"
    });
    if (slot.room)
      blocked.push({ kind: "ROOM", id: slot.room, weekday: slot.weekday, periodId: slot.periodId, reason: "LESSON" });
  }
  const periodsOf = numbers => (numbers ? numbers.map(n => periodByNumber.get(n)).filter(Boolean) : teaching);
  for (const rule of request.teachers) {
    for (const off of rule.unavailable ?? []) {
      for (const period of periodsOf(off.periodNumbers)) {
        blocked.push({
          kind: "TEACHER",
          id: rule.teacherId,
          weekday: off.weekday,
          periodId: period.id,
          reason: "UNAVAILABLE"
        });
      }
    }
  }
  for (const closed of request.closedPeriods) {
    for (const section of sections) {
      if (closed.sectionIds && !closed.sectionIds.includes(section.id)) continue;
      if (closed.classIds && !closed.classIds.includes(section.classId)) continue;
      for (const period of periodsOf(closed.periodNumbers)) {
        blocked.push({
          kind: "SECTION",
          id: section.id,
          weekday: closed.weekday,
          periodId: period.id,
          reason: "CLOSED"
        });
      }
    }
  }

  const teacherLimits = Object.fromEntries(
    request.teachers.map(t => [t.teacherId, { maxPerDay: t.maxPerDay, maxConsecutive: t.maxConsecutive }])
  );

  return {
    names,
    issues,
    pins,
    removed: fill ? [] : scopeSlots,
    kept: fill ? scopeSlots : [],
    input: {
      days,
      periods: data.periods.map(p => ({ id: p.id, periodNumber: p.periodNumber, name: p.name, isBreak: p.isBreak })),
      lessons,
      fixed,
      blocked,
      teacherLimits,
      defaults: { teacherMaxPerDay: request.teacherMaxPerDay, teacherMaxConsecutive: request.teacherMaxConsecutive },
      weights: request.weights,
      seed: request.seed ?? newSeed(),
      attempts: request.attempts,
      timeLimitMs: request.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS
    }
  };
};

/* The solver's capacity findings, in words */
const describeSolverIssue = (found, names, days) => {
  const section = names.section.get(found.sectionId);
  const teacher = names.teacher.get(found.teacherId);
  const subject = names.subject.get(found.subjectId);
  const text = {
    SECTION_OVERLOADED: () => `${section} needs ${found.needed} periods a week but has only ${found.available} open`,
    TEACHER_OVERLOADED: () =>
      `${teacher} would teach ${found.needed} periods here${found.taughtOutsideScope ? ` (and ${found.taughtOutsideScope} in other sections)` : ""} but is free for only ${found.available}`,
    TEACHER_DAILY_LIMIT_TOO_LOW: () =>
      `${teacher} teaches ${found.needed} periods a week; the daily limit allows only ${found.available}`,
    ROOM_OVERLOADED: () =>
      `Room ${found.room} is needed for ${found.needed} periods a week but has only ${found.available}`,
    SUBJECT_DAILY_LIMIT_TOO_LOW: () =>
      `${subject} in ${section}: ${found.needed} classes a week do not fit in ${days.length} days at its daily limit (${found.available} at most)`,
    NO_DOUBLE_PERIODS: () => "Doubles need two periods in a row with no break between; the bell schedule has none"
  }[found.code];
  return { ...found, message: text ? text() : found.code };
};

/* The solver's unplaced classes, in words */
const describeUnplaced = (entry, names) => {
  const reasons = Object.entries(entry.reasons)
    .sort((a, b) => b[1] - a[1])
    .map(([code, cells]) => ({ code, cells, text: REASON_TEXT[code] ?? code }));
  const label = `${names.subject.get(entry.subjectId) ?? "A subject"} in ${names.section.get(entry.sectionId)}`;
  const main = reasons[0] ? `: in most periods ${reasons[0].text}` : "";
  return {
    sectionId: entry.sectionId,
    subjectId: entry.subjectId,
    teacherId: entry.teacherId,
    sectionName: names.section.get(entry.sectionId),
    subjectName: names.subject.get(entry.subjectId) ?? null,
    teacherName: names.teacher.get(entry.teacherId) ?? null,
    missingPeriods: entry.missingPeriods,
    missingDoubles: entry.missingDoubles,
    reasons,
    message: `${label}: ${plural(entry.missingPeriods, "period")} not placed${main}`
  };
};

export const classTimetablePlanner = {
  REASONS: CLASS_REASONS,

  /* What the solver would work with, and the problems visible before solving */
  inputs: async (ctx, academicYear, request) => {
    const data = await gather(ctx, academicYear, request);
    const built = buildInput(data, request);
    const { names, input } = built;
    const cellsPerWeek = input.days.length * data.teaching.length;
    const demand = new Map();
    for (const lesson of input.lessons)
      demand.set(lesson.sectionId, (demand.get(lesson.sectionId) ?? 0) + lesson.perWeek);
    for (const slot of input.fixed) demand.set(slot.sectionId, (demand.get(slot.sectionId) ?? 0) + 1);
    const teacherLoad = new Map();
    for (const lesson of input.lessons)
      teacherLoad.set(lesson.teacherId, (teacherLoad.get(lesson.teacherId) ?? 0) + lesson.perWeek);
    for (const slot of input.fixed) teacherLoad.set(slot.teacherId, (teacherLoad.get(slot.teacherId) ?? 0) + 1);
    for (const slot of data.slots.filter(s => !data.inScope.has(s.sectionId))) {
      teacherLoad.set(slot.teacherId, (teacherLoad.get(slot.teacherId) ?? 0) + 1);
    }
    return {
      academicYearId: academicYear.id,
      mode: request.mode,
      week: {
        days: input.days.map(weekday => ({ weekday, name: WEEKDAY_NAMES[weekday] })),
        periods: data.periods.map(p => ({
          id: p.id,
          periodNumber: p.periodNumber,
          name: p.name,
          startTime: p.startTime,
          endTime: p.endTime,
          isBreak: p.isBreak
        })),
        teachingPeriodsPerWeek: cellsPerWeek
      },
      sections: data.sections.map(section => ({
        id: section.id,
        name: names.section.get(section.id),
        classId: section.classId,
        periodsNeeded: demand.get(section.id) ?? 0,
        periodsAvailable: cellsPerWeek,
        subjects: data.sectionSubjects
          .filter(ss => ss.sectionId === section.id)
          .map(ss => {
            const lesson = input.lessons.find(l => l.sectionId === section.id && l.subjectId === ss.subjectId);
            const teacherId =
              data.assignments.find(a => a.sectionId === section.id && a.subjectId === ss.subjectId)?.teacherId ?? null;
            return {
              subjectId: ss.subjectId,
              subjectName: names.subject.get(ss.subjectId) ?? null,
              weeklyClasses: ss.weeklyNoOfClasses ?? null,
              toPlace: lesson?.perWeek ?? 0,
              doubles: lesson?.doubles ?? 0,
              teacherId,
              teacherName: names.teacher.get(teacherId) ?? null
            };
          })
      })),
      teachers: [...teacherLoad.entries()]
        .map(([teacherId, periods]) => ({
          teacherId,
          name: names.teacher.get(teacherId) ?? null,
          periodsPerWeek: periods,
          periodsAvailable: cellsPerWeek
        }))
        .sort((a, b) => b.periodsPerWeek - a.periodsPerWeek),
      issues: built.issues
    };
  },

  /* Solve: -> { request, result, report, fingerprint, summary, seed } for a draft run */
  plan: async (ctx, academicYear, request) => {
    const data = await gather(ctx, academicYear, request);
    const built = buildInput(data, request);
    const { names, input } = built;
    const solved = solveClassTimetable(input);

    const placements = [...solved.placements, ...built.pins.map(pin => ({ ...pin, double: false, pinned: true }))];
    const issues = [...built.issues, ...solved.issues.map(found => describeSolverIssue(found, names, input.days))];
    const unplaced = solved.unplaced.map(entry => describeUnplaced(entry, names));
    const noTeacher = built.issues.filter(i => i.code === "NO_TEACHER").reduce((n, i) => n + i.needed, 0);
    const required = solved.score.requiredPeriods + built.pins.length + noTeacher;
    const placed = solved.score.placedPeriods + built.pins.length;
    const complete = placed === required;

    const report = {
      issues,
      unplaced,
      score: { ...solved.score, requiredPeriods: required, placedPeriods: placed, complete },
      stats: solved.stats,
      changes: { add: placements.length, remove: built.removed.length, keep: built.kept.length },
      scope: { sections: data.sections.length, days: input.days, teachingPeriods: data.teaching.length }
    };
    const summary = `${plural(data.sections.length, "section")} · ${placed} of ${required} periods placed${complete ? "" : ` · ${required - placed} left`}`;
    return {
      seed: input.seed,
      request,
      result: {
        placements,
        sectionIds: data.sections.map(s => s.id),
        removeSlotIds: built.removed.map(s => s.id),
        keepSlotIds: built.kept.map(s => s.id)
      },
      report,
      fingerprint: fingerprint(data, request),
      summary
    };
  },

  /* The fingerprint of the request's inputs as they are now (applying compares it) */
  currentFingerprint: async (ctx, academicYear, request) =>
    fingerprint(await gather(ctx, academicYear, request), request)
};
