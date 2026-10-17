import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { isoWeekday } from "../../../../common/utils/date.util.js";
import { academicYearService } from "../../academic-years/index.js";
import { calendarService } from "../../calendar/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { subjectService } from "../../subjects/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { periodService, timetableService } from "../../timetable/index.js";
import { attendanceFreePeriodRepository, attendanceSessionRepository } from "../repositories/attendance.repository.js";
import { freeView, sectionLabel } from "./attendance.service.js";
import { MODE_TEXT, attendanceModeService } from "./attendanceMode.service.js";

const nameOf = user => `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || null;
const byClassThenName = (a, b) =>
  (a.class?.classOrder ?? 0) - (b.class?.classOrder ?? 0) || a.sectionName.localeCompare(b.sectionName);

/* Covering a period: a teacher's own sections that take attendance by period today, then
   one section's periods. Only a teacher of the section (its subject teachers, class teacher
   or deputy) stands in for an absent one; with nobody to cover it, the period is marked
   free. Daily and half-day registers stay with the class teacher, the deputy, or an
   administrator. ADMIN and PRINCIPAL see every section. Names only: the students appear
   when the register is opened. */
export const coverService = {
  /* Step 1: my sections, when the school takes attendance by period today */
  sections: async ctx => {
    const date = await tenantToday(ctx.tenantId);
    const [year, mode] = await Promise.all([
      academicYearService.findCurrent(ctx),
      attendanceModeService.modeOn(ctx, date)
    ]);
    if (!year) return { date, mode, workingDay: false, sections: [] };
    const [all, mine, { workingDays }] = await Promise.all([
      sectionService.findAllInYear(ctx, year.id),
      teachingScope.sectionIds(ctx),
      calendarService.workingDays(ctx, year, date, date)
    ]);
    return {
      date,
      mode,
      workingDay: workingDays.includes(date),
      sections:
        mode === "PERIOD_WISE"
          ? all
              .filter(section => !mine || mine.includes(section.id))
              .sort(byClassThenName)
              .map(section => ({ id: section.id, label: sectionLabel(section), className: section.class?.className }))
          : []
    };
  },

  /* Step 2: one section's periods today (timetabled subject and teacher, taken, or free
     with its reason), and the subjects taught in it, for the subject picker */
  section: async (ctx, sectionId) => {
    const date = await tenantToday(ctx.tenantId);
    const section = await sectionService.findById(ctx, sectionId);
    if (!section) throw notFound("Section");
    await teachingScope.assertSection(ctx, sectionId);
    const year = await academicYearService.findCurrent(ctx);
    if (section.academicYearId !== year?.id)
      throw unprocessable("Only sections of the current academic year can be covered");
    const mode = await attendanceModeService.modeOn(ctx, date);
    if (mode !== "PERIOD_WISE") {
      throw unprocessable(
        `The school takes attendance ${MODE_TEXT[mode]} today, not by period: ${sectionLabel(section)}'s register is taken by the class teacher, the deputy or an administrator`
      );
    }
    const weekday = isoWeekday(date);
    const today = { sectionIds: [sectionId], from: date, to: date };
    const [periods, lessons, sessions, free, taught] = await Promise.all([
      periodService.findAllInYear(ctx, section.academicYearId),
      timetableService.lessonsOf(ctx, sectionId),
      attendanceSessionRepository.findInRange(ctx.tenantId, today),
      attendanceFreePeriodRepository.findInRange(ctx.tenantId, today),
      sectionSubjectService.findForSections(ctx, [sectionId])
    ]);
    const subjects = await subjectService.findManyByIds(
      ctx,
      taught.map(row => row.subjectId)
    );
    return {
      date,
      section: { id: section.id, label: sectionLabel(section) },
      periods: periods
        .filter(period => !period.isBreak)
        .sort((a, b) => a.periodNumber - b.periodNumber)
        .map(period => {
          const lesson = lessons.find(l => l.weekday === weekday && l.period.periodNumber === period.periodNumber);
          const session = sessions.find(s => s.kind === "PERIOD" && s.periodNumber === period.periodNumber);
          const freePeriod = free.find(f => f.periodNumber === period.periodNumber);
          return {
            periodNumber: period.periodNumber,
            name: period.name,
            startTime: period.startTime,
            endTime: period.endTime,
            timetabled: lesson
              ? {
                  subject: { id: lesson.subject.id, subjectName: lesson.subject.subjectName },
                  teacher: lesson.teacher ? { id: lesson.teacher.id, name: nameOf(lesson.teacher.user) } : null
                }
              : null,
            taken: Boolean(session),
            takenBy: session?.takenBy ?? null,
            substitute: session?.isSubstitute ?? false,
            subjectTaught: session?.subjectId ? { id: session.subjectId, subjectName: session.subjectName } : null,
            free: freePeriod ? freeView(freePeriod) : null
          };
        }),
      subjects: subjects
        .map(subject => ({ id: subject.id, subjectName: subject.subjectName }))
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName))
    };
  }
};
