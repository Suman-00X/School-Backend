import { eq, inArray, sql } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { conflict, unprocessable } from "../../../../common/http/errors.js";
import { teacherService } from "../../../users/teachers/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { teacherAssignments } from "../models/teacherAssignment.schema.js";
import { teacherAssignmentRepository } from "../repositories/teacherAssignment.repository.js";
import { teachingScope } from "./teachingScope.service.js";

const base = createCrudService(teacherAssignmentRepository, {
  entity: "Teacher assignment",
  with: {
    teacher: {
      columns: { id: true, employeeCode: true },
      with: { user: { columns: { firstName: true, lastName: true } } }
    },
    section: { columns: { id: true, sectionName: true } },
    subject: { columns: { id: true, subjectName: true, subjectCode: true } }
  }
});

export const teacherAssignmentService = {
  remove: base.remove,

  /* For other submodules: every active assignment of a teacher in an academic year */
  findForTeacher: (ctx, teacherId, academicYearId) =>
    teacherAssignmentRepository.findMany(ctx.tenantId, {
      conditions: [eq(teacherAssignments.teacherId, teacherId), eq(teacherAssignments.academicYearId, academicYearId)]
    }),

  /* Assignments of one section */
  findForSection: (ctx, sectionId) =>
    teacherAssignmentRepository.findMany(ctx.tenantId, { conditions: [eq(teacherAssignments.sectionId, sectionId)] }),

  /* Every assignment of an academic year */
  findInYear: (ctx, academicYearId) =>
    teacherAssignmentRepository.findMany(ctx.tenantId, {
      conditions: [eq(teacherAssignments.academicYearId, academicYearId)]
    }),

  /* Year-scoped; filter by section and/or teacher. Teachers: their sections only. */
  list: async (ctx, { page, limit, sectionId, teacherId }) => {
    if (sectionId) await teachingScope.assertSection(ctx, sectionId);
    const visible = sectionId ? null : await teachingScope.sectionIds(ctx);
    return base.list(
      ctx,
      { page, limit },
      [
        eq(teacherAssignments.academicYearId, ctx.academicYearId),
        sectionId && eq(teacherAssignments.sectionId, sectionId),
        teacherId && eq(teacherAssignments.teacherId, teacherId),
        visible && (visible.length ? inArray(teacherAssignments.sectionId, visible) : sql`false`)
      ].filter(Boolean)
    );
  },

  create: async (ctx, { teacherId, sectionId, subjectId, description }) => {
    const academicYearId = ctx.academicYearId;

    if (!(await sectionService.isInAcademicYear(ctx, academicYearId, sectionId))) {
      throw unprocessable("The section does not belong to the selected academic year");
    }
    if (!(await teacherService.exists(ctx, teacherId))) {
      throw unprocessable("teacherId does not refer to an existing teacher");
    }
    if (!(await sectionSubjectService.isTaught(ctx, academicYearId, sectionId, subjectId))) {
      throw unprocessable("This subject is not taught in the section. Add it to the section first.");
    }

    const taken = await teacherAssignmentRepository.exists(ctx.tenantId, [
      eq(teacherAssignments.academicYearId, academicYearId),
      eq(teacherAssignments.sectionId, sectionId),
      eq(teacherAssignments.subjectId, subjectId)
    ]);
    if (taken) throw conflict("This subject already has a teacher in the section");

    return teacherAssignmentRepository.create(ctx.tenantId, {
      academicYearId,
      teacherId,
      sectionId,
      subjectId,
      description
    });
  }
};
