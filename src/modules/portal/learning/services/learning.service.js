import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { teacherService } from "../../../users/teachers/index.js";
import { studentService } from "../../../users/students/index.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { attendanceService } from "../../../academics/attendance/index.js";
import { calendarService } from "../../../academics/calendar/index.js";
import { enrollmentService } from "../../../academics/enrollments/index.js";
import { reportCardPdfService, reportCardService } from "../../../academics/report-cards/index.js";
import { sectionService } from "../../../academics/sections/index.js";
import { teacherAssignmentService } from "../../../academics/teacher-assignments/index.js";
import { timetableService } from "../../../academics/timetable/index.js";
import { studentAccess } from "../../shared/services/studentAccess.service.js";

const currentYear = async ctx => {
  const year = await academicYearService.findCurrent(ctx);
  if (!year) throw unprocessable("The school has not set a current academic year yet");
  return year;
};

const sectionName = section => (section ? `${section.class?.className}-${section.sectionName}` : null);

export const learningService = {
  /* Students the caller can see, with their current class and roll number */
  students: async ctx => {
    const ids = await studentAccess.visibleStudentIds(ctx);
    const [students, year] = await Promise.all([
      studentService.findManyByIds(ctx, ids),
      academicYearService.findCurrent(ctx)
    ]);

    return Promise.all(
      students.map(async student => {
        const enrollment = year ? await enrollmentService.findForStudent(ctx, student.id, year.id) : null;
        const section = enrollment ? await sectionService.findById(ctx, enrollment.sectionId) : null;
        return {
          id: student.id,
          studentCode: student.studentCode,
          admissionNumber: student.admissionNumber,
          firstName: student.user?.firstName,
          lastName: student.user?.lastName,
          current: enrollment
            ? {
                academicYearId: year.id,
                sectionId: section?.id,
                section: sectionName(section),
                rollNumber: enrollment.rollNumber,
                status: enrollment.status
              }
            : null
        };
      })
    );
  },

  timetable: async (ctx, studentId) => {
    await studentAccess.assert(ctx, studentId);
    const year = await currentYear(ctx);
    const enrollment = await enrollmentService.findForStudent(ctx, studentId, year.id);
    if (!enrollment) throw notFound("Current enrollment");
    return timetableService.forSection(ctx, enrollment.sectionId);
  },

  attendance: async (ctx, studentId, query) => {
    await studentAccess.assert(ctx, studentId);
    return attendanceService.studentAttendance(ctx, studentId, query);
  },

  /* Only exams whose results are published */
  reportCards: async (ctx, studentId, query) => {
    await studentAccess.assert(ctx, studentId);
    return reportCardService.forStudent(ctx, studentId, { ...query, publishedOnly: true });
  },

  reportCardPdf: async (ctx, studentId, { examId }) => {
    await studentAccess.assert(ctx, studentId);
    return reportCardPdfService.render(ctx, studentId, { examId, publishedOnly: true });
  },

  calendar: (ctx, query) => calendarService.list(ctx, query),

  /* Teachers: weekly timetable and the sections they teach this year */
  teacherTimetable: async ctx => {
    const teacher = await teacherService.findByUserId(ctx, ctx.userId);
    if (!teacher) throw notFound("Teacher profile");
    return timetableService.forTeacher(ctx, teacher.id, await currentYear(ctx));
  },

  teacherSections: async ctx => {
    const teacher = await teacherService.findByUserId(ctx, ctx.userId);
    if (!teacher) throw notFound("Teacher profile");
    const year = await currentYear(ctx);

    const [assignments, classSections, sections] = await Promise.all([
      teacherAssignmentService.findForTeacher(ctx, teacher.id),
      sectionService.findByClassTeacher(ctx, teacher.id),
      sectionService.findAllInYear(ctx, year.id)
    ]);
    const inYear = new Map(sections.map(section => [section.id, section]));
    const classTeacherOf = new Set(classSections.map(s => s.id));

    const bySection = new Map();
    for (const section of [...classSections, ...assignments.map(a => ({ id: a.sectionId }))]) {
      if (inYear.has(section.id) && !bySection.has(section.id)) bySection.set(section.id, { subjectIds: [] });
    }
    for (const assignment of assignments) bySection.get(assignment.sectionId)?.subjectIds.push(assignment.subjectId);

    return [...bySection.entries()].map(([sectionId, { subjectIds }]) => ({
      sectionId,
      section: sectionName(inYear.get(sectionId)),
      isClassTeacher: classTeacherOf.has(sectionId),
      subjectIds
    }));
  }
};
