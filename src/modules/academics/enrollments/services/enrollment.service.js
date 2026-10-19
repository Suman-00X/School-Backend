import { eq } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { transaction } from "../../../../common/database/postgres.js";
import { publish } from "../../../../common/events/events.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { studentService } from "../../../users/students/index.js";
import { sectionService } from "../../sections/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { nextRollNumber } from "../../shared/utils/codes.util.js";
import { studentEnrollments as enrollments } from "../models/enrollment.schema.js";
import { enrollmentRepository } from "../repositories/enrollment.repository.js";
import { rollNumberService } from "./rollNumber.service.js";

/* A student left the school (not a promotion): other modules release what they hold
   (transport seat, hostel bed). Payload: { tenantId, studentId, academicYearId, enrollmentId } */
export const STUDENT_LEFT = "academics.enrollment.left";

const announceLeaving = (ctx, enrollment) =>
  publish(STUDENT_LEFT, {
    tenantId: ctx.tenantId,
    studentId: enrollment.studentId,
    academicYearId: enrollment.academicYearId,
    enrollmentId: enrollment.id
  });

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
  list: async (ctx, { page, limit, sectionId }) => {
    await teachingScope.assertSection(ctx, sectionId);
    return base.list(ctx, { page, limit }, [
      eq(enrollments.academicYearId, ctx.academicYearId),
      eq(enrollments.sectionId, sectionId)
    ]);
  },

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
    const updated = await enrollmentRepository.update(ctx.tenantId, enrollmentId, data);
    if (data.status === "LEFT" && existing.status !== "LEFT") await announceLeaving(ctx, updated);
    return updated;
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

  /* Year-end promotion of a whole section. Every active student is promoted to
     toSectionId unless an override says REPEAT (into another section of the
     target year) or LEAVE (enrollment closed, no new one). All in one transaction.
     Students are enrolled in the order of the school's roll-number rule for the target
     year, so a new section is numbered by the rule; one that already has students keeps
     their numbers and the newcomers follow, in rule order. */
  promoteSection: async (ctx, { fromSectionId, toAcademicYearId, toSectionId, overrides = [] }) => {
    const fromSection = await sectionService.findById(ctx, fromSectionId);
    if (!fromSection) throw notFound("Section");
    if (fromSection.academicYearId === toAcademicYearId) {
      throw unprocessable("Students must be promoted into a different academic year");
    }

    const roster = await enrollmentService.findRoster(ctx, fromSectionId);
    const actionOf = new Map(overrides.map(o => [o.studentId, o]));
    const strangers = overrides.filter(o => !roster.some(e => e.studentId === o.studentId));
    if (strangers.length) {
      throw unprocessable(`${strangers.length} override(s) name students who are not active in the section`);
    }

    /* Resolve each target section once */
    const placements = new Map();
    const placementFor = async sectionId => {
      if (!placements.has(sectionId))
        placements.set(sectionId, await sectionService.getPlacement(ctx, toAcademicYearId, sectionId));
      return placements.get(sectionId);
    };
    const { academicYear: toYear } = await placementFor(toSectionId);
    for (const override of overrides) {
      if (override.action === "REPEAT") await placementFor(override.toSectionId);
    }
    const inRuleOrder = await rollNumberService.orderForYear(ctx, toYear, fromSectionId, roster);

    const summary = { promoted: 0, repeated: 0, left: 0, skipped: [] };
    const created = [];
    const leavers = [];

    await transaction(async tx => {
      for (const enrollment of inRuleOrder) {
        const override = actionOf.get(enrollment.studentId);
        const action = override?.action ?? "PROMOTE";

        if (action !== "LEAVE" && (await isEnrolledInYear(ctx, toAcademicYearId, enrollment.studentId, { dbc: tx }))) {
          summary.skipped.push({
            studentId: enrollment.studentId,
            reason: "Already enrolled in the target academic year"
          });
          continue;
        }

        if (action !== "LEAVE") {
          const target = action === "REPEAT" ? override.toSectionId : (override?.toSectionId ?? toSectionId);
          created.push(
            await enrollmentService.enroll(
              ctx,
              {
                studentId: enrollment.studentId,
                sectionId: target,
                admissionType: action === "REPEAT" ? "REPEAT" : "PROMOTED"
              },
              { dbc: tx, placement: await placementFor(target) }
            )
          );
        }
        await enrollmentRepository.update(ctx.tenantId, enrollment.id, { status: "LEFT" }, { dbc: tx });

        if (action === "PROMOTE") summary.promoted++;
        else if (action === "REPEAT") summary.repeated++;
        else {
          summary.left++;
          leavers.push(enrollment);
        }
      }
    });
    /* After commit: only students who really left are announced */
    for (const enrollment of leavers) await announceLeaving(ctx, enrollment);

    return { ...summary, enrollments: created };
  },

  /* For other submodules */

  /* Students currently in a section (status ACTIVE), by roll number */
  findRoster: (ctx, sectionId, { includeLeft = false } = {}) =>
    enrollmentRepository.findMany(ctx.tenantId, {
      conditions: [eq(enrollments.sectionId, sectionId), !includeLeft && eq(enrollments.status, "ACTIVE")].filter(
        Boolean
      ),
      with: {
        student: {
          columns: { id: true, studentCode: true, admissionNumber: true, userId: true },
          with: { user: { columns: { firstName: true, lastName: true } } }
        }
      }
    }),

  /* Sections of a year with at least one student currently in them */
  sectionIdsWithStudents: async (ctx, academicYearId) =>
    new Set(
      (
        await enrollmentRepository.findMany(ctx.tenantId, {
          conditions: [eq(enrollments.academicYearId, academicYearId), eq(enrollments.status, "ACTIVE")]
        })
      ).map(enrollment => enrollment.sectionId)
    ),

  /* A student's enrollment in a year (any status), or null */
  findForStudent: (ctx, studentId, academicYearId) =>
    enrollmentRepository.findOne(ctx.tenantId, [
      eq(enrollments.studentId, studentId),
      eq(enrollments.academicYearId, academicYearId)
    ]),

  /* Every enrollment of a student, newest year first */
  findAllForStudent: (ctx, studentId) =>
    enrollmentRepository.findMany(ctx.tenantId, {
      conditions: [eq(enrollments.studentId, studentId)],
      with: { section: { columns: { id: true, sectionName: true, academicYearId: true, classId: true } } }
    }),

  /* activeOnly: the student must still be in the section (not LEFT) */
  isStudentInSection: (ctx, studentId, sectionId, academicYearId, { activeOnly = false } = {}) =>
    enrollmentRepository.exists(
      ctx.tenantId,
      [
        eq(enrollments.studentId, studentId),
        eq(enrollments.sectionId, sectionId),
        eq(enrollments.academicYearId, academicYearId),
        activeOnly && eq(enrollments.status, "ACTIVE")
      ].filter(Boolean)
    )
};
