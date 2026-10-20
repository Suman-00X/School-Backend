import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { teacherService } from "../../../users/teachers/index.js";
import { studentService } from "../../../users/students/index.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { attendanceService } from "../../../academics/attendance/index.js";
import { calendarService } from "../../../academics/calendar/index.js";
import { enrollmentService } from "../../../academics/enrollments/index.js";
import { reportCardPdfService, reportSnapshotService } from "../../../academics/report-cards/index.js";
import { sectionService } from "../../../academics/sections/index.js";
import { teachingScope } from "../../../academics/teacher-assignments/index.js";
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

  /* The published version of each exam and assessment scheme, exactly as published (report snapshots) */
  reportCards: async (ctx, studentId, query) => {
    await studentAccess.assert(ctx, studentId);
    return reportSnapshotService.forFamily(ctx, studentId, query);
  },

  /* Rendered from the published snapshot, never from live marks */
  reportCardPdf: async (ctx, studentId, query) => {
    await studentAccess.assert(ctx, studentId);
    return reportCardPdfService.renderSnapshot(ctx, await reportSnapshotService.familySnapshot(ctx, studentId, query));
  },

  /* This year's issued admit cards (none for a student who is not eligible) */
  admitCards: async (ctx, studentId) => {
    await studentAccess.assert(ctx, studentId);
    return admitCardService.forStudent(ctx, studentId);
  },

  admitCardPdf: async (ctx, studentId, admitCardId) => {
    await studentAccess.assert(ctx, studentId);
    return admitCardPdfService.renderOne(ctx, await admitCardService.issuedToStudent(ctx, studentId, admitCardId));
  },

  calendar: (ctx, query) => calendarService.list(ctx, query),

  /* Teachers: weekly timetable and the sections they teach this year */
  teacherTimetable: async ctx => {
    const teacher = await teacherService.findByUserId(ctx, ctx.userId);
    if (!teacher) throw notFound("Teacher profile");
    return timetableService.forTeacher(ctx, teacher.id, await currentYear(ctx));
  },

  /* The current year's sections from the teacher's scope (D-11), with their role in each */
  teacherSections: async ctx => {
    const scope = await teachingScope.of(ctx);
    if (!scope?.teacherId) throw notFound("Teacher profile");
    const year = await currentYear(ctx);
    const inYear = new Map((await sectionService.findAllInYear(ctx, year.id)).map(section => [section.id, section]));
    const sectionIds = await teachingScope.sectionIds(ctx);

    return sectionIds
      .filter(sectionId => inYear.has(sectionId))
      .map(sectionId => ({
        sectionId,
        section: sectionName(inYear.get(sectionId)),
        isClassTeacher: scope.classTeacherOf.has(sectionId),
        isDeputyClassTeacher: scope.deputyOf.has(sectionId),
        subjectIds: [...(scope.subjectsBySection.get(sectionId) ?? [])]
      }));
  }
};
