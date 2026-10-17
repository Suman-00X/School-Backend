import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { isoWeekday } from "../../../../common/utils/date.util.js";
import { academicYearService } from "../../academic-years/index.js";
import { calendarService } from "../../calendar/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { subjectService } from "../../subjects/index.js";
import { periodService, timetableService } from "../../timetable/index.js";
import { attendanceSessionRepository } from "../repositories/attendance.repository.js";
import { attendanceModeService } from "./attendanceMode.service.js";

const label = section => `${section.class?.className}-${section.sectionName}`;
const nameOf = user => `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || null;
const byClassThenName = (a, b) =>
  (a.class?.classOrder ?? 0) - (b.class?.classOrder ?? 0) || a.sectionName.localeCompare(b.sectionName);

/* Covering a class (D-66): what a teacher needs to take a period register in a section
   they may not teach, today only. Substitutes exist only where attendance is taken by
   period; daily and half-day registers stay with the class teacher, the deputy, or an
   administrator. Names only: the students appear when the register is opened. */
export const coverService = {
  /* Step 1: the sections taking attendance by period today */
  sections: async ctx => {
    const date = await tenantToday(ctx.tenantId);
    const year = await academicYearService.findCurrent(ctx);
    if (!year) return { date, workingDay: false, sections: [] };
    const [all, modeOf, { workingDays }] = await Promise.all([
      sectionService.findAllInYear(ctx, year.id),
      attendanceModeService.resolver(ctx),
      calendarService.workingDays(ctx, year, date, date)
    ]);
    return {
      date,
      workingDay: workingDays.includes(date),
      sections: all
        .filter(section => modeOf(section.classId, date) === "PERIOD_WISE")
        .sort(byClassThenName)
        .map(section => ({ id: section.id, label: label(section), className: section.class?.className }))
    };
  },

  /* Step 2: one section's periods today (timetabled subject and teacher, taken or not),
     and the subjects taught in it, for the subject picker */
  section: async (ctx, sectionId) => {
    const date = await tenantToday(ctx.tenantId);
    const section = await sectionService.findById(ctx, sectionId);
    if (!section) throw notFound("Section");
    const year = await academicYearService.findCurrent(ctx);
    if (section.academicYearId !== year?.id)
      throw unprocessable("Only sections of the current academic year can be covered");
    if ((await attendanceModeService.modeOn(ctx, section.classId, date)) !== "PERIOD_WISE") {
      throw unprocessable(
        `${label(section)} does not take attendance by period today: its register is taken by the class teacher, the deputy or an administrator`
      );
    }
    const weekday = isoWeekday(date);
    const [periods, lessons, sessions, taught] = await Promise.all([
      periodService.findAllInYear(ctx, section.academicYearId),
      timetableService.lessonsOf(ctx, sectionId),
      attendanceSessionRepository.findInRange(ctx.tenantId, { sectionIds: [sectionId], from: date, to: date }),
      sectionSubjectService.findForSections(ctx, [sectionId])
    ]);
    const subjects = await subjectService.findManyByIds(
      ctx,
      taught.map(row => row.subjectId)
    );
    return {
      date,
      section: { id: section.id, label: label(section) },
      periods: periods
        .filter(period => !period.isBreak)
        .sort((a, b) => a.periodNumber - b.periodNumber)
        .map(period => {
          const lesson = lessons.find(l => l.weekday === weekday && l.period.periodNumber === period.periodNumber);
          const session = sessions.find(s => s.kind === "PERIOD" && s.periodNumber === period.periodNumber);
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
            subjectTaught: session?.subjectId ? { id: session.subjectId, subjectName: session.subjectName } : null
          };
        }),
      subjects: subjects
        .map(subject => ({ id: subject.id, subjectName: subject.subjectName }))
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName))
    };
  }
};
