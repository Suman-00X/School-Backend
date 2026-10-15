import { eq } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { studentService } from "../../../users/students/index.js";
import { sectionService } from "../../sections/index.js";
import { nextRollNumber } from "../../shared/utils/codes.util.js";
import { studentEnrollments as enrollments } from "../models/enrollment.schema.js";
import { enrollmentRepository } from "../repositories/enrollment.repository.js";

const base = createCrudService(enrollmentRepository, {
  entity: "Enrollment",
  with: {
    student: {
      columns: { id: true, studentCode: true, admissionNumber: true },
      with: { user: { columns: { firstName: true, lastName: true } } }
    },
    section: { columns: { id: true, sectionName: true } }
  }
});

const isEnrolledInYear = (ctx, academicYearId, studentId, options) =>
  enrollmentRepository.exists(
    ctx.tenantId,
    [eq(enrollments.academicYearId, academicYearId), eq(enrollments.studentId, studentId)],
    options
  );

export const enrollmentService = {
  /* Year-scoped: students of one section */
  list: (ctx, { page, limit, sectionId }) =>
    base.list(ctx, { page, limit }, [
      eq(enrollments.academicYearId, ctx.academicYearId),
      eq(enrollments.sectionId, sectionId)
    ]),

  /* POST /enrollments: an existing student into a section of the resolved year */
  create: async (ctx, data) => {
    if (!(await studentService.exists(ctx, data.studentId))) {
      throw unprocessable("studentId does not refer to an existing student");
    }
    return enrollmentService.enroll(ctx, data);
  },

  /* Shared by create, admission and promotion. `placement` (from
     sectionService.getPlacement) skips re-reading the section; `dbc` joins a transaction. */
  enroll: async (
    ctx,
    { studentId, sectionId, rollNumber, admissionType = "NEW", description },
    { dbc, placement } = {}
  ) => {
    const place = placement ?? (await sectionService.getPlacement(ctx, ctx.academicYearId, sectionId));
    const academicYearId = place.academicYear.id;

    if (await isEnrolledInYear(ctx, academicYearId, studentId, { dbc })) {
      throw conflict("The student is already enrolled in this academic year");
    }

    if (rollNumber) {
      const taken = await enrollmentRepository.exists(
        ctx.tenantId,
        [eq(enrollments.sectionId, place.section.id), eq(enrollments.rollNumber, rollNumber)],
        { dbc }
      );
      if (taken) throw conflict("This roll number is already taken in the section");
    }

    return enrollmentRepository.create(
      ctx.tenantId,
      {
        academicYearId,
        studentId,
        sectionId: place.section.id,
        rollNumber: rollNumber ?? (await nextRollNumber(ctx.tenantId, place, { dbc })),
        admissionType,
        description,
        status: "ACTIVE"
      },
      { dbc }
    );
  },

  update: async (ctx, enrollmentId, data) => {
    const existing = await enrollmentRepository.findById(ctx.tenantId, enrollmentId);
    if (!existing) throw notFound("Enrollment");

    if (data.sectionId && !(await sectionService.isInAcademicYear(ctx, existing.academicYearId, data.sectionId))) {
      throw unprocessable("The new section must belong to the same academic year as the enrollment");
    }
    return enrollmentRepository.update(ctx.tenantId, enrollmentId, data);
  },

  /* Move a student from their section in one year to a section in the next */
  promote: async (ctx, { studentId, fromAcademicYearId, toAcademicYearId, toSectionId, admissionType }) => {
    const placement = await sectionService.getPlacement(ctx, toAcademicYearId, toSectionId);

    if (await isEnrolledInYear(ctx, toAcademicYearId, studentId)) {
      throw conflict("The student has already been promoted to this academic year");
    }

    const previous = await enrollmentRepository.findOne(ctx.tenantId, [
      eq(enrollments.studentId, studentId),
      eq(enrollments.academicYearId, fromAcademicYearId),
      eq(enrollments.status, "ACTIVE")
    ]);
    if (!previous) throw unprocessable("The student has no active enrollment in the source academic year");

    return transaction(async tx => {
      const enrollment = await enrollmentService.enroll(
        ctx,
        { studentId, sectionId: toSectionId, admissionType },
        { dbc: tx, placement }
      );
      await enrollmentRepository.update(ctx.tenantId, previous.id, { status: "LEFT" }, { dbc: tx });
      return enrollment;
    });
  },

  /* For other submodules */
  isStudentInSection: (ctx, studentId, sectionId, academicYearId) =>
    enrollmentRepository.exists(ctx.tenantId, [
      eq(enrollments.studentId, studentId),
      eq(enrollments.sectionId, sectionId),
      eq(enrollments.academicYearId, academicYearId)
    ])
};
