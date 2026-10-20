import { forbidden, notFound } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { isoWeekday, minDate } from "../../../../common/utils/date.util.js";
import { teacherService } from "../../../users/teachers/index.js";
import { academicYearService } from "../../academic-years/index.js";
import { calendarService } from "../../calendar/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { sectionService } from "../../sections/index.js";
import { ATTENDANCE_MODE_KINDS, WEEKDAY_NAMES } from "../../shared/constants/academic.constants.js";
import { substitutionService } from "../../substitutions/index.js";
import { teacherAssignmentService, teachingScope } from "../../teacher-assignments/index.js";
import { timetableService } from "../../timetable/index.js";
import { attendanceFreePeriodRepository, attendanceSessionRepository } from "../repositories/attendance.repository.js";
import { freeView, groupBy, registerLabel, sectionLabel } from "./attendance.service.js";
import { registerKey } from "./attendanceCalculation.service.js";
import { attendanceModeService } from "./attendanceMode.service.js";

/* Registers nobody took (D-66). An untaken session still counts against the students;
   on a working day someone answers for it:
   - DAY, FORENOON, AFTERNOON: the class teacher;
   - PERIOD: the substitute planned for it when the timetabled teacher is away, else the
     teacher timetabled in the slot, else (their account is no longer active) the teacher
     assigned that subject in the section.
   Only expected registers count: working days, the school's mode on that date, and on
   period-wise days only the periods the timetable fills on that weekday. Sections with
   no students expect none. A period marked free expects no register: it is listed apart,
   as is a leisure period (its teacher was away and nobody was planned to cover it). */

const nameOf = teacher => `${teacher.user?.firstName ?? ""} ${teacher.user?.lastName ?? ""}`.trim();
const personOf = teacher => ({ teacherId: teacher.id, userId: teacher.userId, name: nameOf(teacher) });

/* Who answers for one missing register -> { responsible, responsibleAs, reason } */
const answerableFor = (register, section, { teachers, subjectTeacherOf, substituteOf }) => {
  const label = sectionLabel(section);
  if (register.kind !== "PERIOD") {
    const classTeacher = teachers.get(section.classTeacherId);
    if (classTeacher) {
      return {
        responsible: personOf(classTeacher),
        responsibleAs: "CLASS_TEACHER",
        reason: `Class teacher of ${label}`
      };
    }
    return { responsible: null, responsibleAs: null, reason: `${label} has no class teacher with an active account` };
  }

  const { slot } = register;
  const subjectName = slot.subject.subjectName;
  const substitute = teachers.get(substituteOf(register));
  if (substitute) {
    return {
      responsible: personOf(substitute),
      responsibleAs: "SUBSTITUTE",
      reason: `Planned to cover ${slot.period.name} of ${label} that day (the timetabled teacher was away)`
    };
  }
  const timetabled = teachers.get(slot.teacherId);
  if (timetabled) {
    return {
      responsible: personOf(timetabled),
      responsibleAs: "TIMETABLED_TEACHER",
      reason: `Timetabled for ${subjectName} in ${slot.period.name} on ${WEEKDAY_NAMES[slot.weekday]}s`
    };
  }
  const subjectTeacher = teachers.get(subjectTeacherOf.get(`${section.id}|${slot.subjectId}`));
  if (subjectTeacher) {
    return {
      responsible: personOf(subjectTeacher),
      responsibleAs: "SUBJECT_TEACHER",
      reason: `Teaches ${subjectName} in ${label} (the timetabled teacher's account is no longer active)`
    };
  }
  return {
    responsible: null,
    responsibleAs: null,
    reason: `Nobody with an active account teaches ${subjectName} in ${label}`
  };
};

/* Every expected register of the year's working days in [from, to] (up to today) that
   nobody took, by date, class, section and bell order, and the expected periods marked
   free instead -> { from, to, rows, free } */
const collect = async (ctx, academicYear, { from, to, sectionId }) => {
  const today = await tenantToday(ctx.tenantId);
  const range = await calendarService.workingDays(ctx, academicYear, from, minDate(to, today));
  if (!range.workingDays.length) return { from: range.from, to: range.to, rows: [], free: [] };

  const [allSections, withStudents, modeOn, lessons, assignments] = await Promise.all([
    sectionService.findAllInYear(ctx, academicYear.id),
    enrollmentService.sectionIdsWithStudents(ctx, academicYear.id),
    attendanceModeService.timeline(ctx),
    timetableService.lessonsInYear(ctx, academicYear.id),
    teacherAssignmentService.findInYear(ctx, academicYear.id)
  ]);
  const sections = allSections
    .filter(section => withStudents.has(section.id) && (!sectionId || section.id === sectionId))
    .sort((a, b) => a.class.classOrder - b.class.classOrder || a.sectionName.localeCompare(b.sectionName));
  const inRange = { sectionIds: sections.map(section => section.id), from: range.from, to: range.to };
  const [sessions, freePeriods, coverage] = await Promise.all([
    attendanceSessionRepository.findInRange(ctx.tenantId, inRange),
    attendanceFreePeriodRepository.findInRange(ctx.tenantId, inRange),
    substitutionService.coverage(ctx, academicYear, range.from, range.to)
  ]);
  /* How an away teacher's lesson was covered: { away, plan } (a plan for a teacher who
     was not away after all is ignored) */
  const coverOf = (slot, date) => {
    const cover = slot && coverage.get(`${slot.id}|${date}`);
    return cover?.away ? cover : null;
  };
  const isLeisure = cover =>
    Boolean(cover) &&
    (!cover.plan || cover.plan.kind === "LEISURE" || (cover.plan.kind === "ACTIVITY" && !cover.plan.substituteTeacherId));

  const taken = new Set(sessions.map(session => `${session.sectionId}|${session.date}|${registerKey(session)}`));
  const freeAt = new Map(
    freePeriods.map(free => [`${free.sectionId}|${free.date}|${registerKey({ kind: "PERIOD", ...free })}`, free])
  );
  const lessonsOn = groupBy(lessons, lesson => `${lesson.sectionId}|${lesson.weekday}`);
  const subjectTeacherOf = new Map(assignments.map(a => [`${a.sectionId}|${a.subjectId}`, a.teacherId]));
  const teacherIds = [
    ...new Set([
      ...sections.map(section => section.classTeacherId),
      ...lessons.map(lesson => lesson.teacherId),
      ...assignments.map(assignment => assignment.teacherId),
      ...[...coverage.values()].map(cover => cover.plan?.substituteTeacherId)
    ])
  ].filter(Boolean);
  const teachers = new Map((await teacherService.findActiveByIds(ctx, teacherIds)).map(t => [t.id, t]));

  const rows = [];
  const free = [];
  for (const date of range.workingDays) {
    const mode = modeOn(date);
    for (const section of sections) {
      const expected =
        mode === "PERIOD_WISE"
          ? (lessonsOn.get(`${section.id}|${isoWeekday(date)}`) ?? []).map(slot => ({
              kind: "PERIOD",
              periodNumber: slot.period.periodNumber,
              slot
            }))
          : ATTENDANCE_MODE_KINDS[mode].map(kind => ({ kind, periodNumber: 0 }));
      for (const register of expected) {
        const key = `${section.id}|${date}|${registerKey(register)}`;
        if (taken.has(key)) continue;
        const subject = register.slot?.subject ?? null;
        const cover = coverOf(register.slot, date);
        const leisure = !freeAt.has(key) && isLeisure(cover);
        const freePeriod =
          freeAt.get(key) ??
          (leisure
            ? {
                id: null,
                reason: `Leisure: ${nameOf(teachers.get(register.slot.teacherId) ?? {}) || "the teacher"} was away and nobody was planned to cover it`,
                markedBy: null,
                markedAt: null
              }
            : null);
        const substituteOf = () => (cover?.plan?.kind === "NOT_NEEDED" ? null : cover?.plan?.substituteTeacherId);
        (freePeriod ? free : rows).push({
          date,
          section: { id: section.id, name: sectionLabel(section) },
          mode,
          kind: register.kind,
          periodNumber: register.periodNumber,
          label: registerLabel({
            ...register,
            periodName: register.slot?.period.name,
            subjectName: subject?.subjectName
          }),
          subject: subject && { id: subject.id, subjectName: subject.subjectName },
          ...answerableFor(register, section, { teachers, subjectTeacherOf, substituteOf }),
          ...(freePeriod && { free: { ...freeView(freePeriod), leisure } })
        });
      }
    }
  }
  return { from: range.from, to: range.to, rows, free };
};

/* [{ teacherId, name, missing }], most missed first */
const countByTeacher = rows =>
  [
    ...groupBy(
      rows.filter(row => row.responsible),
      row => row.responsible.teacherId
    ).values()
  ]
    .map(own => ({ teacherId: own[0].responsible.teacherId, name: own[0].responsible.name, missing: own.length }))
    .sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name));

export const missingRegisterService = {
  /* ADMIN and PRINCIPAL: every missing register (filter by section or teacher).
     A teacher: only the ones they answer for. Year-scoped unless a section is named. */
  list: async (ctx, { from, to, sectionId, teacherId }) => {
    const scope = await teachingScope.of(ctx);
    if (scope && teacherId && teacherId !== scope.teacherId) {
      throw forbidden("You can only see the registers you were responsible for");
    }
    let academicYear = ctx.academicYear;
    if (sectionId) {
      const section = await sectionService.findById(ctx, sectionId);
      if (!section) throw notFound("Section");
      academicYear = await academicYearService.findById(ctx, section.academicYearId);
    }

    const result = await collect(ctx, academicYear, { from, to, sectionId });
    const whose = scope ? scope.teacherId : teacherId;
    const theirs = list => (whose ? list.filter(row => row.responsible?.teacherId === whose) : list);
    const rows = theirs(result.rows);
    return {
      academicYearId: academicYear.id,
      from: result.from,
      to: result.to,
      total: rows.length,
      byTeacher: countByTeacher(rows),
      unassigned: rows.filter(row => !row.responsible).length,
      registers: rows,
      /* Expected periods marked free: no register was due */
      freePeriods: theirs(result.free)
    };
  },

  /* For the evening reminder: one day's missing registers, per teacher who answers for
     them -> [{ teacher: { teacherId, userId, name }, registers }], or null when the
     school is closed that day */
  missedByTeacher: async (ctx, date) => {
    const academicYear = await academicYearService.findCurrent(ctx);
    if (!academicYear || (await calendarService.closureOn(ctx, academicYear, date))) return null;
    const { rows } = await collect(ctx, academicYear, { from: date, to: date });
    return [
      ...groupBy(
        rows.filter(row => row.responsible),
        row => row.responsible.teacherId
      ).values()
    ].map(registers => ({ teacher: registers[0].responsible, registers }));
  }
};
