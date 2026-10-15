import { eq } from "drizzle-orm";
import { ROLES } from "../../../../common/auth/roles.js";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { transaction } from "../../../../common/database/postgres.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { accountService } from "../../accounts/index.js";
import { parentService } from "../../parents/index.js";
import { sectionService } from "../../../academics/sections/index.js";
import { enrollmentService } from "../../../academics/enrollments/index.js";
import { USER_SUMMARY_COLUMNS, toUserSummary } from "../../shared/constants/user.constants.js";
import { nextStudentCode } from "../../shared/utils/codes.util.js";
import { students } from "../models/student.schema.js";
import { studentRepository } from "../repositories/student.repository.js";
import { studentParentRepository } from "../repositories/studentParent.repository.js";

const base = createCrudService(studentRepository, {
  entity: "Student",
  with: { user: { columns: USER_SUMMARY_COLUMNS } }
});

export const studentService = {
  list: base.list,
  getById: base.getById,
  update: base.update,

  /* Admission: student account + profile, parents (new or existing) and
     their links, and the enrollment in a section, all in one transaction */
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
      const student = await studentRepository.create(
        ctx.tenantId,
        { ...profile, userId: account.id, studentCode },
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
  exists: (ctx, studentId) => studentRepository.exists(ctx.tenantId, [eq(students.id, studentId)])
};
