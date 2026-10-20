import { and, eq, inArray, sql } from "drizzle-orm";
import { ROLES } from "../../../../common/auth/roles.js";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { db, transaction } from "../../../../common/database/postgres.js";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { accountService } from "../../accounts/index.js";
import { parentService } from "../../parents/index.js";
import { sectionService } from "../../../academics/sections/index.js";
import { enrollmentService } from "../../../academics/enrollments/index.js";
import { studentEnrollments } from "../../../academics/enrollments/models/enrollment.schema.js";
import { teachingScope } from "../../../academics/teacher-assignments/index.js";
import { USER_SUMMARY_COLUMNS, toUserSummary } from "../../shared/constants/user.constants.js";
import { nextAdmissionNumber, nextStudentCode } from "../../shared/utils/codes.util.js";
import { students } from "../models/student.schema.js";
import { studentRepository } from "../repositories/student.repository.js";
import { studentParentRepository } from "../repositories/studentParent.repository.js";

const base = createCrudService(studentRepository, {
  entity: "Student",
  with: { user: { columns: USER_SUMMARY_COLUMNS } }
});

/* The next admission number of the admitting year. A number already held (data from
   before numbers were generated, soft-deleted students included) is skipped. */
const newAdmissionNumber = async (ctx, yearYY, dbc) => {
  for (;;) {
    const candidate = await nextAdmissionNumber(ctx.tenantId, yearYY, { dbc });
    const [held] = await dbc
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.tenantId, ctx.tenantId), eq(students.admissionNumber, candidate)))
      .limit(1);
    if (!held) return candidate;
  }
};

/* Teachers only see students currently enrolled in sections they teach */
const scopeCondition = async ctx => {
  const sectionIds = await teachingScope.sectionIds(ctx);
  if (sectionIds === null) return undefined;
  if (!sectionIds.length) return sql`false`;
  return inArray(
    students.id,
    db
      .select({ id: studentEnrollments.studentId })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.tenantId, ctx.tenantId),
          eq(studentEnrollments.isActive, true),
          eq(studentEnrollments.status, "ACTIVE"),
          inArray(studentEnrollments.sectionId, sectionIds)
        )
      )
  );
};

export const studentService = {
  list: async (ctx, query) => base.list(ctx, query, [await scopeCondition(ctx)].filter(Boolean)),

  getById: async (ctx, studentId) => {
    const scope = await scopeCondition(ctx);
    const student = await studentRepository.findOne(ctx.tenantId, [eq(students.id, studentId), scope].filter(Boolean), {
      with: { user: { columns: USER_SUMMARY_COLUMNS } }
    });
    if (!student) throw notFound("Student");
    return student;
  },

  update: base.update,

  /* Admission: student account + profile, parents (new or existing) and
     their links, and the enrollment in a section, all in one transaction.
     The admission number (ADM26-0001, the admitting year's start year) and the student
     code are generated; the roll number is the next one in the section. */
  admit: async (ctx, { user, profile, parents, enrollment }) => {
    const placement = await sectionService.getPlacement(ctx, enrollment.academicYearId, enrollment.sectionId);

    for (const [index, parent] of parents.entries()) {
      if (parent.parentId && !(await parentService.exists(ctx, parent.parentId))) {
        throw unprocessable(`parents[${index}].parentId does not refer to an existing parent`);
      }
    }

    return transaction(async tx => {
      const account = await accountService.createAccount(ctx, user, ROLES.STUDENT, { dbc: tx });
      const studentCode = await nextStudentCode(ctx.tenantId, placement, { dbc: tx });
      const admissionNumber = await newAdmissionNumber(ctx, placement.yearYY, tx);
      const student = await studentRepository.create(
        ctx.tenantId,
        { ...profile, userId: account.id, studentCode, admissionNumber },
        { dbc: tx }
      );

      const parentLinks = [];
      for (const parent of parents) {
        const parentId = parent.parentId ?? (await parentService.create(ctx, parent, { dbc: tx })).id;
        parentLinks.push(
          await studentParentRepository.create(
            ctx.tenantId,
            { studentId: student.id, parentId, relation: parent.relation, isPrimaryContact: parent.isPrimaryContact },
            { dbc: tx }
          )
        );
      }

      const studentEnrollment = await enrollmentService.enroll(
        ctx,
        { studentId: student.id, sectionId: enrollment.sectionId, admissionType: enrollment.admissionType },
        { dbc: tx, placement }
      );

      return { ...student, user: toUserSummary(account), parents: parentLinks, enrollment: studentEnrollment };
    });
  },

  /* For other modules */
  exists: (ctx, studentId) => studentRepository.exists(ctx.tenantId, [eq(students.id, studentId)]),

  /* For other modules (the admin console): students on the school's roll (not removed) */
  countActive: ctx => studentRepository.count(ctx.tenantId),

  findByUserId: (ctx, userId) =>
    studentRepository.findOne(ctx.tenantId, [eq(students.userId, userId)], {
      with: { user: { columns: USER_SUMMARY_COLUMNS } }
    }),

  findManyByIds: (ctx, studentIds) =>
    studentIds.length
      ? studentRepository.findMany(ctx.tenantId, {
          conditions: [inArray(students.id, studentIds)],
          with: { user: { columns: USER_SUMMARY_COLUMNS } }
        })
      : []
};
