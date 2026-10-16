import { transaction } from "../../../../common/database/postgres.js";
import { publish } from "../../../../common/events/events.js";
import { forbidden, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { addDays, isoWeekday, minDate } from "../../../../common/utils/date.util.js";
import { academicYearService } from "../../academic-years/index.js";
import { calendarService } from "../../calendar/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { sectionService } from "../../sections/index.js";
import { ATTENDANCE_MODE_KINDS, WEEKDAY_NAMES } from "../../shared/constants/academic.constants.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { periodService, timetableService } from "../../timetable/index.js";
import {
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

const sectionLabel = section => `${section.class?.className}-${section.sectionName}`;
const sectionView = section => ({
  id: section.id,
  sectionName: section.sectionName,
  className: section.class?.className
});

const loadSection = async (ctx, sectionId) => {
  const section = await sectionService.findById(ctx, sectionId);
  if (!section) throw notFound("Section");
  const academicYear = await academicYearService.findById(ctx, section.academicYearId);
  return { section, academicYear };
};

/* Locked once the edit window after the date has passed */
const lockState = (policy, date, today) => {
  const lastEditable = addDays(date, policy.editWindowDays);
  return { locked: lastEditable < today, editableUntil: lastEditable };
};

/* A locked register: override roles only, with a reason -> the override to record (or null) */
const checkLock = (ctx, policy, date, today, overrideReason) => {
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

/* The register must be one the class's mode takes on that date */
const assertKindFits = (mode, kind, label, date) => {
  if (!ATTENDANCE_MODE_KINDS[mode].includes(kind)) {
    throw unprocessable(`On ${date} ${label} takes attendance ${MODE_TEXT[mode]}: record ${EXPECTED[mode]}`);
  }
};

/* A period register needs a real class: a period of the bell schedule that the
   section's timetable fills on that weekday. -> { period, slot } */
const lessonFor = async (ctx, section, date, periodNumber, subjectId) => {
  const weekday = isoWeekday(date);
  const period = (await periodService.findAllInYear(ctx, section.academicYearId)).find(
    p => p.periodNumber === periodNumber
  );
  if (!period) throw unprocessable(`Period ${periodNumber} is not in the bell schedule of the academic year`);
  if (period.isBreak) throw unprocessable(`${period.name} is a break: no register is taken in it`);
  const slot = await timetableService.lessonAt(ctx, section.id, weekday, period.id);
  if (!slot)
    throw unprocessable(`${sectionLabel(section)} has no class in ${period.name} on ${WEEKDAY_NAMES[weekday]}s`);
  if (subjectId && subjectId !== slot.subjectId) {
    throw unprocessable(
      `The timetable has ${slot.subject.subjectName} in ${period.name} on ${WEEKDAY_NAMES[weekday]}s, not the subject sent`
    );
  }
  return { period, slot };
};

/* Daily and half-day registers: the class teacher. A period: its subject's teacher
   (timetable or teacher assignment) or the class teacher. ADMIN/PRINCIPAL: any. */
const assertRecorder = async (ctx, section, kind, lesson) => {
  const scope = await teachingScope.of(ctx);
  if (!scope || scope.classTeacherOf.has(section.id)) return;
  if (kind !== "PERIOD") {
    throw forbidden(`Only the class teacher of ${sectionLabel(section)} can take its ${KIND_LABELS[kind]} register`);
  }
  const { slot, period } = lesson;
  const teaches = slot.teacherId === scope.teacherId || scope.subjectsBySection.get(section.id)?.has(slot.subjectId);
  if (!teaches) {
    throw forbidden(
      `Only the teacher of ${slot.subject.subjectName} in ${sectionLabel(section)} or its class teacher can take the ${period.name} register`
    );
  }
};

/* "Period 2 (English)", "Forenoon" … */
const registerLabel = ({ kind, periodNumber, periodName, subjectName }) => {
  if (kind === "PERIOD") return `${periodName ?? `Period ${periodNumber}`}${subjectName ? ` (${subjectName})` : ""}`;
  return { DAY: "Day", FORENOON: "Forenoon", AFTERNOON: "Afternoon" }[kind];
};

const groupBy = (rows, keyOf) => {
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

  update: async (ctx, { mode, classModes, modeEffectiveFrom, ...settings }) => {
    const policy = await attendancePolicyRepository.ensure(ctx.tenantId);
    const today = await tenantToday(ctx.tenantId);
    const change = await transaction(async tx => {
      await attendancePolicyRepository.lock(ctx.tenantId, policy.id, { dbc: tx });
      if (Object.keys(settings).length) {
        await attendancePolicyRepository.update(ctx.tenantId, policy.id, settings, { dbc: tx });
      }
      return mode || classModes?.length
        ? attendanceModeService.schedule(
            ctx,
            { mode, classModes, effectiveFrom: modeEffectiveFrom },
            { dbc: tx, today }
          )
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
    const label = sectionLabel(section);

    /* Strangers are turned away first; who may take this very register is checked below */
    const scope = await teachingScope.of(ctx);
    const timetabled =
      kind === "PERIOD" && scope?.teacherId && (await timetableService.teachesIn(ctx, scope.teacherId, sectionId));
    if (!timetabled) await teachingScope.assertSection(ctx, sectionId);

    const today = await tenantToday(ctx.tenantId);
    if (date > today) throw unprocessable("Attendance cannot be recorded for a future date");
    const closure = await calendarService.closureOn(ctx, academicYear, date);
    if (closure)
      throw unprocessable(`Attendance cannot be recorded on ${date}: it is ${CLOSURE_LABELS[closure] ?? closure}`);
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
      /* FOR SHARE: a concurrent mode change waits for this register, and vice versa */
      const policy = await attendancePolicyRepository.lock(ctx.tenantId, policyId, { dbc: tx, strength: "share" });
      const mode = await attendanceModeService.modeOn(ctx, section.classId, date, { dbc: tx });
      assertKindFits(mode, kind, label, date);
      const lesson = kind === "PERIOD" ? await lessonFor(ctx, section, date, periodNumber, subjectId) : null;
      await assertRecorder(ctx, section, kind, lesson);
      const override = checkLock(ctx, policy, date, today, overrideReason);

      const session = await attendanceSessionRepository.upsert(
        ctx.tenantId,
        {
          academicYearId: academicYear.id,
          sectionId,
          date,
          kind,
          periodNumber,
          subjectId: lesson?.slot.subjectId ?? null,
          takenBy: ctx.userId,
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
      return { session, mode, lesson, override };
    });

    const counts = emptyCounts();
    for (const record of records) counts[record.status]++;
    const subject = result.lesson?.slot.subject ?? null;

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
          periodName: result.lesson?.period.name,
          subjectName: subject?.subjectName
        }),
        subject: subject && { id: subject.id, subjectName: subject.subjectName }
      },
      summary: { rosterSize: roster.length, marked: records.length, unmarked: roster.length - records.length, counts }
    };
  },

  /* A section's day: the registers the mode expects (and any taken), and every enrolled
     student's marks. With `kind` (and periodNumber for a period), or in DAILY mode, one
     register; otherwise the whole day, with each student's day status. */
  register: async (ctx, { sectionId, date, kind, periodNumber }) => {
    const { section } = await loadSection(ctx, sectionId);
    await teachingScope.assertSection(ctx, sectionId);

    const [mode, sessions, marks, roster, policy, today] = await Promise.all([
      attendanceModeService.modeOn(ctx, section.classId, date),
      attendanceSessionRepository.findInRange(ctx.tenantId, { sectionIds: [sectionId], from: date, to: date }),
      attendanceRecordRepository.findInRange(ctx.tenantId, { sectionId, from: date, to: date }),
      enrollmentService.findRoster(ctx, sectionId),
      attendancePolicyRepository.ensure(ctx.tenantId),
      tenantToday(ctx.tenantId)
    ]);

    /* Expected registers of the mode, then any other register taken that day */
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
    const all = [...expected, ...sessions.filter(s => !expected.some(e => registerKey(e) === registerKey(s)))];
    const registers = all.map(register => {
      const session = taken.get(registerKey(register));
      const subject =
        register.subject ?? (session?.subjectId ? { id: session.subjectId, subjectName: session.subjectName } : null);
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
      (registers.find(r => r.key === singleKey) ?? { taken: false, takenAt: null, takenBy: null, lockOverride: null });
    const byStudent = marksByStudentDay(marks);

    return {
      section: sectionView(section),
      date,
      mode,
      kind: single?.kind ?? null,
      periodNumber: single?.periodNumber ?? null,
      taken: one ? one.taken : registers.length > 0 && registers.every(r => r.taken),
      takenAt: one?.takenAt ?? null,
      takenBy: one?.takenBy ?? null,
      ...lockState(policy, date, today),
      lockOverride: one?.lockOverride ?? null,
      registers,
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
    const [roster, sessions, marks, resolve, policy] = await Promise.all([
      enrollmentService.findRoster(ctx, sectionId),
      attendanceSessionRepository.findInRange(ctx.tenantId, { sectionIds: [sectionId], from: rangeFrom, to: rangeTo }),
      attendanceRecordRepository.findInRange(ctx.tenantId, { sectionId, from: rangeFrom, to: rangeTo }),
      attendanceModeService.resolver(ctx),
      attendancePolicyRepository.ensure(ctx.tenantId)
    ]);

    const registersOn = groupBy(sessions, session => session.date);
    const byStudent = marksByStudentDay(marks);
    const modes = workingDays.map(day => resolve(section.classId, day));
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
    const [sessions, section, resolve, policy] = await Promise.all([
      attendanceSessionRepository.findInRange(ctx.tenantId, { sectionIds, from: rangeFrom, to: rangeTo }),
      sectionService.findById(ctx, enrollment.sectionId),
      attendanceModeService.resolver(ctx),
      attendancePolicyRepository.ensure(ctx.tenantId)
    ]);
    const registersOn = groupBy(sessions, session => `${session.sectionId}|${session.date}`);
    const byStudent = marksByStudentDay(marks);
    const modes = workingDays.map(day => resolve(section.classId, day));

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
  }
};
