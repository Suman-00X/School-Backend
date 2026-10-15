import { eq } from "drizzle-orm";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { parentService } from "../../parents/index.js";
import { USER_SUMMARY_COLUMNS } from "../../shared/constants/user.constants.js";
import { studentParents } from "../models/studentParent.schema.js";
import { studentParentRepository } from "../repositories/studentParent.repository.js";
import { studentService } from "./student.service.js";

const withParent = {
  parent: {
    columns: { id: true, parentCode: true, occupation: true },
    with: { user: { columns: USER_SUMMARY_COLUMNS } }
  }
};

const assertStudent = async (ctx, studentId) => {
  if (!(await studentService.exists(ctx, studentId))) throw notFound("Student");
};

const linkConditions = (studentId, parentId) => [
  eq(studentParents.studentId, studentId),
  eq(studentParents.parentId, parentId)
];

export const studentParentService = {
  list: async (ctx, studentId, { page, limit }) => {
    await assertStudent(ctx, studentId);
    return studentParentRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: [eq(studentParents.studentId, studentId)],
      with: withParent
    });
  },

  link: async (ctx, studentId, { parentId, relation, isPrimaryContact }) => {
    await assertStudent(ctx, studentId);
    if (!(await parentService.exists(ctx, parentId))) {
      throw unprocessable("parentId does not refer to an existing parent");
    }
    if (await studentParentRepository.exists(ctx.tenantId, linkConditions(studentId, parentId))) {
      throw conflict("This parent is already linked to the student");
    }
    return studentParentRepository.create(ctx.tenantId, { studentId, parentId, relation, isPrimaryContact });
  },

  /* For other modules: active links of a parent (their children) */
  childrenOf: (ctx, parentId) =>
    studentParentRepository.findMany(ctx.tenantId, { conditions: [eq(studentParents.parentId, parentId)] }),

  isLinked: (ctx, studentId, parentId) =>
    studentParentRepository.exists(ctx.tenantId, linkConditions(studentId, parentId)),

  unlink: async (ctx, studentId, parentId) => {
    const link = await studentParentRepository.findOne(ctx.tenantId, linkConditions(studentId, parentId));
    if (!link) throw notFound("Parent link");
    return studentParentRepository.softDelete(ctx.tenantId, link.id);
  }
};
