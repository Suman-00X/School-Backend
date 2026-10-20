import { transaction } from "../../../../common/database/postgres.js";
import { publish } from "../../../../common/events/events.js";
import { conflict, forbidden, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { addDays, isoWeekday, minDate } from "../../../../common/utils/date.util.js";
import { academicYearService } from "../../academic-years/index.js";
import { calendarService } from "../../calendar/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { ATTENDANCE_MODE_KINDS, WEEKDAY_NAMES } from "../../shared/constants/academic.constants.js";
import { subjectService } from "../../subjects/index.js";
import { substitutionService } from "../../substitutions/index.js";
import { OUTSIDE_SCOPE, teachingScope } from "../../teacher-assignments/index.js";
import { periodService, timetableService } from "../../timetable/index.js";
import {
  attendanceFreePeriodRepository,
  attendancePolicyRepository,
  attendanceRecordRepository,
  attendanceSessionRepository
} from "../repositories/attendance.repository.js";
import { dayOf, emptyCounts, modeSegments, registerKey, summariseDays } from "./attendanceCalculation.service.js";
import { MODE_TEXT, attendanceModeService } from "./attendanceMode.service.js";

export const ATTENDANCE_RECORDED = "academics.attendance.recorded";

const CLOSURE_LABELS = {
  WEEKLY_OFF: "a weekly off day",
  HOLIDAY: "a holiday",
  VACATION: "a vacation day",
  OUTSIDE_ACADEMIC_YEAR: "outside the academic year"
};

const KIND_LABELS = { DAY: "daily", FORENOON: "forenoon", AFTERNOON: "afternoon", PERIOD: "period" };
const SESSION_KINDS = ["FORENOON", "AFTERNOON"];
const EXPECTED = {
  DAILY: "one register for the day (kind DAY)",
  TWO_SESSIONS: "a FORENOON or an AFTERNOON register",
  PERIOD_WISE: "one register per period (kind PERIOD with its periodNumber)"
};

export const sectionLabel = section => `${section.class?.className}-${section.sectionName}`;
const sectionView = section => ({
  id: section.id,
  sectionName: section.sectionName,
  className: section.class?.className
});

export const loadSection = async (ctx, sectionId) => {
  const section = await sectionService.findById(ctx, sectionId);
  if (!section) throw notFound("Section");
  const academicYear = await academicYearService.findById(ctx, section.academicYearId);
  return { section, academicYear };
};

/* Why the school is closed on a date ("a holiday" …), or null on a working day */
export const closureOf = async (ctx, academicYear, date) => {
  const closure = await calendarService.closureOn(ctx, academicYear, date);
  return closure ? (CLOSURE_LABELS[closure] ?? closure) : null;
};

/* Locked once the edit window after the date has passed */
export const lockState = (policy, date, today) => {
  const lastEditable = addDays(date, policy.editWindowDays);
  return { locked: lastEditable < today, editableUntil: lastEditable };
};

/* A locked register (or free period): override roles only, with a reason -> the override
   to record (or null) */
export const checkLock = (ctx, policy, date, today, overrideReason) => {
  const { locked, editableUntil } = lockState(policy, date, today);
  if (!locked) return null;
  if (!policy.overrideRoles.includes(ctx.role)) {
    throw forbidden(
      `The register for ${date} was locked after ${editableUntil}. Only ${policy.overrideRoles.join(" or ")} can change it now.`
    );
  }
  if (!overrideReason) throw unprocessable(`The register for ${date} is locked: give an overrideReason to change it`);
  return { lockOverrideReason: overrideReason, lockOverriddenBy: ctx.userId, lockOverriddenAt: new Date() };
};

/* The policy row in a write transaction. Mode changes start tomorrow at the earliest, so
   only a write for today can meet one (made just before midnight): it waits FOR SHARE
   behind it, and vice versa */
export const policyForWrite = (ctx, policyId, date, today, tx) =>
  date === today
    ? attendancePolicyRepository.lock(ctx.tenantId, policyId, { dbc: tx, strength: "share" })
    : attendancePolicyRepository.findById(ctx.tenantId, policyId, { dbc: tx });

/* The register must be one the school's mode takes on that date */
const assertKindFits = (mode, kind, date) => {
  if (!ATTENDANCE_MODE_KINDS[mode].includes(kind)) {
    throw unprocessable(`On ${date} the school takes attendance ${MODE_TEXT[mode]}: record ${EXPECTED[mode]}`);
  }
};

/* A period of the bell schedule that is not a break -> period */
export const periodOf = async (ctx, section, periodNumber) => {
  const period = (await periodService.findAllInYear(ctx, section.academicYearId)).find(
    p => p.periodNumber === periodNumber
  );
  if (!period) throw unprocessable(`Period ${periodNumber} is not in the bell schedule of the academic year`);
  if (period.isBreak) throw unprocessable(`${period.name} is a break: no register is taken in it`);
  return period;
};

/* A period register on a date -> { period, slot (the class timetabled then, or null) } */
const lessonAt = async (ctx, section, date, periodNumber) => {
  const period = await periodOf(ctx, section, periodNumber);
  return { period, slot: await timetableService.lessonAt(ctx, section.id, isoWeekday(date), period.id) };
};

/* The subject taught: the timetable's for that weekday unless `subjectId` says otherwise
   (a substitute who taught their own subject); with no class timetabled it is required.
   A subject sent must be taught in the section or its class. */
const subjectOf = async (ctx, section, date, { period, slot }, subjectId) => {
  if (!subjectId && !slot) {
    throw unprocessable(
      `${sectionLabel(section)} has no class in ${period.name} on ${WEEKDAY_NAMES[isoWeekday(date)]}s: send the subjectId of the subject taught`
    );
  }
  if (!subjectId || subjectId === slot?.subjectId) return slot.subject;

  const subject = await subjectService.findById(ctx, subjectId);
  if (!subject || !(await sectionSubjectService.isTaughtInClass(ctx, section, subjectId))) {
    throw unprocessable(
      `${subject?.subjectName ?? "The subject sent"} is not taught in ${sectionLabel(section)} or its class`
    );
  }
  return subject;
};

/* Is the teacher (scope) the one timetabled in the slot? Only in a year of their scope. */
const timetabledIn = (scope, section, slot) =>
  Boolean(slot?.teacherId) &&
  slot.teacherId === scope.teacherId &&
  Boolean(scope.academicYearIds?.includes(section.academicYearId));

/* Daily and half-day registers: the class teacher or the deputy class teacher.
   ADMIN/PRINCIPAL: any. */
const assertSessionRecorder = async (ctx, section, kind) => {
  await teachingScope.assertSection(ctx, section.id);
  if (await teachingScope.leadsSection(ctx, section.id)) return;
  throw forbidden(
    `Only the class teacher of ${sectionLabel(section)} or its deputy can take its ${KIND_LABELS[kind]} register`
  );
};

/* Is the teacher (scope) planned to cover the slot on the date: its substitute, or the
   teacher in charge of an activity in it (substitution planning)? */
const plannedIn = async (ctx, scope, slot, date) => {
  if (!scope?.teacherId || !slot) return false;
  const plan = await substitutionService.planAt(ctx, { timetableSlotId: slot.id, date });
  return plan?.substituteTeacherId === scope.teacherId;
};

/* Period registers: the slot's timetabled teacher, the substitute planned for it that day,
   any subject teacher of the section, its class teacher or deputy; ADMIN and PRINCIPAL.
   When none of them can, the period is free. */
const assertPeriodRecorder = async (ctx, section, { period, slot }, date) => {
  const scope = await teachingScope.of(ctx);
  if (!scope || timetabledIn(scope, section, slot) || (await teachingScope.canAccessSection(ctx, section.id))) return;
  if (await plannedIn(ctx, scope, slot, date)) return;
  throw forbidden(
    `Only a teacher of ${sectionLabel(section)} can take its ${period.name} register; otherwise mark the period free`
  );
};

/* Anyone but the slot's timetabled teacher stands in for them. With nobody timetabled,
   nobody is replaced. ADMIN and PRINCIPAL record for others and are never substitutes. */
const isSubstitute = async (ctx, { slot }) => {
  const scope = await teachingScope.of(ctx);
  return Boolean(scope && slot?.teacherId && slot.teacherId !== scope.teacherId);
};

/* A free period has no register: it must be removed first */
const assertNotFree = async (ctx, section, date, period, { dbc }) => {
  const free = await attendanceFreePeriodRepository.findAt(
    ctx.tenantId,
    { sectionId: section.id, date, periodNumber: period.periodNumber },
    { dbc }
  );
  if (free) {
    throw conflict(
      `${period.name} of ${sectionLabel(section)} on ${date} is a free period (${free.reason}): remove the free period first to take its register`
    );
  }
};

/* Outside their sections a teacher reads nothing, except the slot's timetabled teacher
   and the substitute planned for it that day: that period's register, which they take */
const assertTimetabledReader = async (ctx, section, { date, kind, periodNumber }) => {
  const scope = await teachingScope.of(ctx);
  if (kind === "PERIOD") {
    const lessons = await timetableService.lessonsOf(ctx, section.id);
    const slot = lessons.find(l => l.weekday === isoWeekday(date) && l.period.periodNumber === periodNumber);
    if (timetabledIn(scope, section, slot) || (await plannedIn(ctx, scope, slot, date))) return;
  }
  throw forbidden(OUTSIDE_SCOPE);
};

/* A free period, as shown with the day's registers */
export const freeView = free => ({
  id: free.id,
  reason: free.reason,
  markedBy: free.markedBy,
  markedAt: free.markedAt
});

/* "Period 2 (English)", "Forenoon" … */
export const registerLabel = ({ kind, periodNumber, periodName, subjectName }) => {
  if (kind === "PERIOD") return `${periodName ?? `Period ${periodNumber}`}${subjectName ? ` (${subjectName})` : ""}`;
  return { DAY: "Day", FORENOON: "Forenoon", AFTERNOON: "Afternoon" }[kind];
};

export const groupBy = (rows, keyOf) => {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
};

/* Marks grouped per student and day: Map("studentId|date" -> Map(registerKey -> mark)) */
const marksByStudentDay = marks => {
  const byDay = new Map();
  for (const mark of marks) {
    const key = `${mark.studentId}|${mark.date}`;
    if (!byDay.has(key)) byDay.set(key, new Map());
    byDay.get(key).set(registerKey(mark), mark);
  }
  return byDay;
};

const NO_MARKS = new Map();

/* The working days of [from, to] (defaults: year start..today) */
const rangeOf = async (ctx, academicYear, { from, to }) => {
  const today = await tenantToday(ctx.tenantId);
  return calendarService.workingDays(ctx, academicYear, from ?? academicYear.startDate, minDate(to ?? today, today));
};

export const attendancePolicyService = {
  /* The edit window and override roles, plus the mode in force and what is scheduled */
  get: async ctx => {
    const policy = await attendancePolicyRepository.ensure(ctx.tenantId);
    return { ...policy, ...(await attendanceModeService.view(ctx, await tenantToday(ctx.tenantId))) };
  },

  update: async (ctx, { mode, modeEffectiveFrom, ...settings }) => {
    const policy = await attendancePolicyRepository.ensure(ctx.tenantId);
    const change = await transaction(async tx => {
      await attendancePolicyRepository.lock(ctx.tenantId, policy.id, { dbc: tx });
      /* Read under the lock: a register for today taken meanwhile is already committed */
      const today = await tenantToday(ctx.tenantId);
      if (Object.keys(settings).length) {
        await attendancePolicyRepository.update(ctx.tenantId, policy.id, settings, { dbc: tx });
      }
      return mode
        ? attendanceModeService.schedule(ctx, { mode, effectiveFrom: modeEffectiveFrom }, { dbc: tx, today })
        : null;
    });
    return { ...(await attendancePolicyService.get(ctx)), change };
  }
};

export const attendanceService = {
  /* Take (or retake) a register. -> { session, summary, created } */
  record: async (
    ctx,
    { sectionId, date, kind: requestedKind, periodNumber = 0, subjectId, remarks, records, overrideReason }
  ) => {
    const kind = requestedKind ?? (periodNumber ? "PERIOD" : "DAY");
    const { section, academicYear } = await loadSection(ctx, sectionId);

    /* Period registers: a teacher of the section (substitutes included) or the timetabled one */
    const lesson = kind === "PERIOD" ? await lessonAt(ctx, section, date, periodNumber) : null;
    if (lesson) await assertPeriodRecorder(ctx, section, lesson, date);
    else await assertSessionRecorder(ctx, section, kind);
    /* A planned substitute's subject is the register's unless another one is sent */
    const plan = lesson?.slot ? await substitutionService.planAt(ctx, { timetableSlotId: lesson.slot.id, date }) : null;

    const today = await tenantToday(ctx.tenantId);
    if (date > today) throw unprocessable("Attendance cannot be recorded for a future date");
    const closure = await closureOf(ctx, academicYear, date);
    if (closure) throw unprocessable(`Attendance cannot be recorded on ${date}: it is ${closure}`);
    if (SESSION_KINDS.includes(kind) && records.some(record => record.status === "HALF_DAY")) {
      throw unprocessable(
        "HALF_DAY is not used in forenoon and afternoon registers: mark the session PRESENT, LATE, ABSENT or EXCUSED (present in one session and absent in the other makes a half day)"
      );
    }

    const roster = await enrollmentService.findRoster(ctx, sectionId);
    const enrolled = new Set(roster.map(enrollment => enrollment.studentId));
    const strangers = records.filter(record => !enrolled.has(record.studentId)).map(record => record.studentId);
    if (strangers.length) {
      throw unprocessable(`${strangers.length} student(s) are not enrolled in this section: ${strangers.join(", ")}`);
    }

    const { id: policyId } = await attendancePolicyRepository.ensure(ctx.tenantId);
    const result = await transaction(async tx => {
      const policy = await policyForWrite(ctx, policyId, date, today, tx);
      const mode = await attendanceModeService.modeOn(ctx, date, { dbc: tx });
      assertKindFits(mode, kind, date);
      const subject = lesson ? await subjectOf(ctx, section, date, lesson, subjectId ?? plan?.subjectId ?? undefined) : null;
      /* A trigger holds the same line against a free period marked meanwhile */
      if (lesson) await assertNotFree(ctx, section, date, lesson.period, { dbc: tx });
      const substitute = lesson ? await isSubstitute(ctx, lesson) : false;
      const override = checkLock(ctx, policy, date, today, overrideReason);

      const session = await attendanceSessionRepository.upsert(
        ctx.tenantId,
        {
          academicYearId: academicYear.id,
          sectionId,
          date,
          kind,
          periodNumber,
          subjectId: subject?.id ?? null,
          takenBy: ctx.userId,
          isSubstitute: substitute,
          remarks: remarks ?? null,
          lockOverrideReason: override?.lockOverrideReason ?? null,
          lockOverriddenBy: override?.lockOverriddenBy ?? null,
          lockOverriddenAt: override?.lockOverriddenAt ?? null
        },
        { dbc: tx }
      );
      await attendanceRecordRepository.upsertMany(
        ctx.tenantId,
        records.map(record => ({
          sessionId: session.id,
          academicYearId: academicYear.id,
          sectionId,
          studentId: record.studentId,
          date,
          kind,
          periodNumber,
          status: record.status,
          remarks: record.remarks ?? null
        })),
        { dbc: tx }
      );
      return { session, mode, subject, substitute, override };
    });

    const counts = emptyCounts();
    for (const record of records) counts[record.status]++;
    const { subject } = result;

    await publish(ATTENDANCE_RECORDED, {
      tenantId: ctx.tenantId,
      sessionId: result.session.id,
      sectionId,
      date,
      kind,
      periodNumber,
      absentStudentIds: records.filter(r => r.status === "ABSENT").map(r => r.studentId)
    });

    return {
      created: result.session.created,
      overridden: Boolean(result.override),
      session: {
        id: result.session.id,
        sectionId,
        sectionName: section.sectionName,
        date,
        mode: result.mode,
        kind,
        periodNumber,
        label: registerLabel({
          kind,
          periodNumber,
          periodName: lesson?.period.name,
          subjectName: subject?.subjectName
        }),
        subject: subject && { id: subject.id, subjectName: subject.subjectName },
        takenBy: ctx.userId,
        substitute: result.substitute
      },
      summary: { rosterSize: roster.length, marked: records.length, unmarked: roster.length - records.length, counts }
    };
  },

  /* A section's day: the registers the school's mode expects (and any taken), the free
     periods with their reason, and every enrolled student's marks. With `kind` (and
     periodNumber for a period), or in DAILY mode, one register; otherwise the whole day,
     with each student's day status. A teacher outside the section reads nothing, except
     the slot's timetabled teacher: that one period's register. */
  register: async (ctx, { sectionId, date, kind, periodNumber }) => {
    const { section } = await loadSection(ctx, sectionId);
    const outsider = !(await teachingScope.canAccessSection(ctx, sectionId));
    if (outsider) await assertTimetabledReader(ctx, section, { date, kind, periodNumber });

    const day = { sectionIds: [sectionId], from: date, to: date };
    const [mode, sessions, free, marks, roster, policy, today] = await Promise.all([
      attendanceModeService.modeOn(ctx, date),
      attendanceSessionRepository.findInRange(ctx.tenantId, day),
      attendanceFreePeriodRepository.findInRange(ctx.tenantId, day),
      attendanceRecordRepository.findInRange(ctx.tenantId, { sectionId, from: date, to: date }),
      enrollmentService.findRoster(ctx, sectionId),
      attendancePolicyRepository.ensure(ctx.tenantId),
      tenantToday(ctx.tenantId)
    ]);

    /* Expected registers of the mode, then any other register taken or period freed that day */
    let expected = ATTENDANCE_MODE_KINDS[mode].filter(k => k !== "PERIOD").map(k => ({ kind: k, periodNumber: 0 }));
    if (mode === "PERIOD_WISE") {
      expected = (await timetableService.lessonsOf(ctx, sectionId))
        .filter(lesson => lesson.weekday === isoWeekday(date))
        .map(lesson => ({
          kind: "PERIOD",
          periodNumber: lesson.period.periodNumber,
          periodName: lesson.period.name,
          subject: lesson.subject,
          teacher: lesson.teacher
        }));
    }
    const taken = new Map(sessions.map(session => [registerKey(session), session]));
    const freed = new Map(free.map(row => [registerKey({ kind: "PERIOD", periodNumber: row.periodNumber }), row]));
    const all = [...expected];
    for (const other of [...sessions, ...free.map(row => ({ kind: "PERIOD", periodNumber: row.periodNumber }))]) {
      if (!all.some(register => registerKey(register) === registerKey(other))) all.push(other);
    }
    all.sort((a, b) => a.periodNumber - b.periodNumber);
    const registers = all.map(register => {
      const session = taken.get(registerKey(register));
      const freePeriod = freed.get(registerKey(register));
      /* The subject taught (a substitute may have taught their own), else the timetable's */
      const subject = session?.subjectId
        ? { id: session.subjectId, subjectName: session.subjectName }
        : (register.subject ?? null);
      return {
        key: registerKey(register),
        kind: register.kind,
        periodNumber: register.periodNumber,
        label: registerLabel({ ...register, subjectName: subject?.subjectName }),
        subject: subject && { id: subject.id, subjectName: subject.subjectName },
        teacher: register.teacher
          ? {
              id: register.teacher.id,
              name: `${register.teacher.user?.firstName ?? ""} ${register.teacher.user?.lastName ?? ""}`.trim()
            }
          : null,
        taken: Boolean(session),
        takenAt: session?.takenAt ?? null,
        takenBy: session?.takenBy ?? null,
        substitute: session?.isSubstitute ?? false,
        /* A free period: no register, counted in nobody's attendance */
        free: freePeriod ? freeView(freePeriod) : null,
        lockOverride: session?.lockOverriddenAt
          ? { reason: session.lockOverrideReason, by: session.lockOverriddenBy, at: session.lockOverriddenAt }
          : null
      };
    });

    const single = kind
      ? { kind, periodNumber: kind === "PERIOD" ? periodNumber : 0 }
      : mode === "DAILY"
        ? { kind: "DAY", periodNumber: 0 }
        : null;
    const singleKey = single && registerKey(single);
    const one =
      single &&
      (registers.find(r => r.key === singleKey) ?? {
        taken: false,
        takenAt: null,
        takenBy: null,
        substitute: false,
        free: null,
        lockOverride: null
      });
    /* Free periods need no register */
    const due = registers.filter(r => !r.free);
    const byStudent = marksByStudentDay(marks);

    return {
      section: sectionView(section),
      date,
      mode,
      kind: single?.kind ?? null,
      periodNumber: single?.periodNumber ?? null,
      taken: one ? one.taken : due.length > 0 && due.every(r => r.taken),
      takenAt: one?.takenAt ?? null,
      takenBy: one?.takenBy ?? null,
      substitute: one?.substitute ?? false,
      free: one?.free ?? null,
      ...lockState(policy, date, today),
      lockOverride: one?.lockOverride ?? null,
      /* The timetabled teacher from outside the section: their period only */
      registers: outsider ? registers.filter(r => r.key === singleKey) : registers,
      students: roster.map(enrollment => {
        const own = byStudent.get(`${enrollment.studentId}|${date}`) ?? NO_MARKS;
        const base = {
          studentId: enrollment.studentId,
          rollNumber: enrollment.rollNumber,
          firstName: enrollment.student?.user?.firstName,
          lastName: enrollment.student?.user?.lastName
        };
        if (single)
          return { ...base, status: own.get(singleKey)?.status ?? null, remarks: own.get(singleKey)?.remarks ?? null };
        return {
          ...base,
          status: dayOf(sessions, own, policy.periodPresenceThreshold).status,
          marks: Object.fromEntries(registers.map(r => [r.key, own.get(r.key)?.status ?? null]))
        };
      })
    };
  },

  /* Per-student totals for a section over a date range (defaults: year start..today) */
  sectionSummary: async (ctx, { sectionId, from, to }) => {
    const { section, academicYear } = await loadSection(ctx, sectionId);
    await teachingScope.assertSection(ctx, sectionId);

    const { workingDays, from: rangeFrom, to: rangeTo } = await rangeOf(ctx, academicYear, { from, to });
    const [roster, sessions, marks, modeOn, policy] = await Promise.all([
      enrollmentService.findRoster(ctx, sectionId),
      attendanceSessionRepository.findInRange(ctx.tenantId, { sectionIds: [sectionId], from: rangeFrom, to: rangeTo }),
      attendanceRecordRepository.findInRange(ctx.tenantId, { sectionId, from: rangeFrom, to: rangeTo }),
      attendanceModeService.timeline(ctx),
      attendancePolicyRepository.ensure(ctx.tenantId)
    ]);

    const registersOn = groupBy(sessions, session => session.date);
    const byStudent = marksByStudentDay(marks);
    /* The school may have switched modes within the range: each day has its own */
    const modes = workingDays.map(modeOn);
    const periodWise = workingDays.length > 0 && modes.every(mode => mode === "PERIOD_WISE");

    const students = roster.map(enrollment => ({
      studentId: enrollment.studentId,
      rollNumber: enrollment.rollNumber,
      firstName: enrollment.student?.user?.firstName,
      lastName: enrollment.student?.user?.lastName,
      ...summariseDays(
        workingDays.map(day =>
          dayOf(
            registersOn.get(day) ?? [],
            byStudent.get(`${enrollment.studentId}|${day}`) ?? NO_MARKS,
            policy.periodPresenceThreshold
          )
        ),
        { periodWise }
      )
    }));
    const percentages = students.map(s => s.percentage).filter(p => p !== null);

    return {
      section: sectionView(section),
      from: rangeFrom,
      to: rangeTo,
      workingDays: workingDays.length,
      modes: modeSegments(workingDays, modes),
      basis: periodWise ? "PERIODS" : "DAYS",
      periodPresenceThreshold: policy.periodPresenceThreshold,
      averagePercentage: percentages.length
        ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) / 10
        : null,
      students
    };
  },

  /* One student's days (with each register's mark) and totals in an academic year
     (for staff and the portal) */
  studentAttendance: async (ctx, studentId, { from, to, academicYearId }) => {
    const academicYear = academicYearId
      ? await academicYearService.findById(ctx, academicYearId)
      : await academicYearService.findCurrent(ctx);
    if (!academicYear) throw unprocessable("No academic year found for this request");

    const enrollment = await enrollmentService.findForStudent(ctx, studentId, academicYear.id);
    if (!enrollment) throw notFound("Enrollment for this student in the academic year");
    await teachingScope.assertSection(ctx, enrollment.sectionId);

    const { workingDays, from: rangeFrom, to: rangeTo } = await rangeOf(ctx, academicYear, { from, to });
    const marks = await attendanceRecordRepository.findInRange(ctx.tenantId, {
      studentId,
      academicYearId: academicYear.id,
      from: rangeFrom,
      to: rangeTo
    });
    /* A student who changed section mid-year: each day uses the registers of the section marked in */
    const sectionOn = new Map(marks.map(mark => [mark.date, mark.sectionId]));
    const sectionIds = [...new Set([enrollment.sectionId, ...sectionOn.values()])];
    const [sessions, modeOn, policy] = await Promise.all([
      attendanceSessionRepository.findInRange(ctx.tenantId, { sectionIds, from: rangeFrom, to: rangeTo }),
      attendanceModeService.timeline(ctx),
      attendancePolicyRepository.ensure(ctx.tenantId)
    ]);
    const registersOn = groupBy(sessions, session => `${session.sectionId}|${session.date}`);
    const byStudent = marksByStudentDay(marks);
    const modes = workingDays.map(modeOn);

    const results = workingDays.map(day => {
      const registers = registersOn.get(`${sectionOn.get(day) ?? enrollment.sectionId}|${day}`) ?? [];
      const own = byStudent.get(`${studentId}|${day}`) ?? NO_MARKS;
      return { day, registers, own, result: dayOf(registers, own, policy.periodPresenceThreshold) };
    });

    return {
      studentId,
      academicYearId: academicYear.id,
      from: rangeFrom,
      to: rangeTo,
      mode: modes.at(-1) ?? null,
      periodPresenceThreshold: policy.periodPresenceThreshold,
      ...summariseDays(
        results.map(r => r.result),
        { periodWise: workingDays.length > 0 && modes.every(mode => mode === "PERIOD_WISE") }
      ),
      days: results
        .filter(({ result }) => result.status)
        .map(({ day, registers, own, result }) => ({
          date: day,
          status: result.status,
          remarks: own.get("DAY")?.remarks ?? null,
          attended: result.credit,
          ...(result.periods && { periods: result.periods }),
          breakdown: registers.map(register => ({
            kind: register.kind,
            periodNumber: register.periodNumber,
            label: registerLabel(register),
            subject: register.subjectId ? { id: register.subjectId, subjectName: register.subjectName } : null,
            status: own.get(registerKey(register))?.status ?? null,
            remarks: own.get(registerKey(register))?.remarks ?? null
          }))
        }))
    };
  },

  /* For absence alerts: the periods a student was marked ABSENT in on a day */
  absentPeriods: async (ctx, studentId, date) => {
    const marks = (
      await attendanceRecordRepository.findInRange(ctx.tenantId, { studentId, from: date, to: date })
    ).filter(mark => mark.kind === "PERIOD" && mark.status === "ABSENT");
    if (!marks.length) return [];
    const sessions = await attendanceSessionRepository.findInRange(ctx.tenantId, {
      sectionIds: [...new Set(marks.map(mark => mark.sectionId))],
      from: date,
      to: date
    });
    const subjectOf = new Map(sessions.map(s => [`${s.sectionId}|${registerKey(s)}`, s.subjectName]));
    return marks.map(mark => ({
      periodNumber: mark.periodNumber,
      subjectName: subjectOf.get(`${mark.sectionId}|${registerKey(mark)}`) ?? null
    }));
  },

  /* For approved student leave: the student's ABSENT marks on those dates, in registers of
     these kinds, become EXCUSED, locked registers included (the leave is the record of why)
     -> the marks changed */
  excuseForLeave: (ctx, { studentId, dates, kinds }, { dbc } = {}) =>
    dates.length
      ? attendanceRecordRepository.excuseAbsences(
          ctx.tenantId,
          { studentId, dates, kinds, remarks: "On approved leave" },
          { dbc }
        )
      : [],

  /* The school's edit window: how far back a day's attendance can still be changed */
  editWindowDays: async ctx => (await attendancePolicyRepository.ensure(ctx.tenantId)).editWindowDays
};
