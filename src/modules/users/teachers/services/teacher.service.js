import { eq } from "drizzle-orm";
import { ROLES } from "../../../../common/auth/roles.js";
import { createProfileService } from "../../shared/services/profileService.factory.js";
import { nextTeacherCode } from "../../shared/utils/codes.util.js";
import { teachers } from "../models/teacher.schema.js";
import { teacherRepository } from "../repositories/teacher.repository.js";

const base = createProfileService({
  repository: teacherRepository,
  entity: "Teacher",
  codeField: "employeeCode",
  nextCode: (ctx, profile, options) => nextTeacherCode(ctx.tenantId, profile.joiningDate, options)
});

export const teacherService = {
  ...base,

  create: (ctx, { user, profile }) => base.createWithAccount(ctx, { role: ROLES.TEACHER, user, profile }),

  /* For other modules */
  exists: (ctx, teacherId) => teacherRepository.exists(ctx.tenantId, [eq(teachers.id, teacherId)]),

  /* Teacher profile of a user account (null for non-teachers) */
  findByUserId: (ctx, userId) => teacherRepository.findOne(ctx.tenantId, [eq(teachers.userId, userId)])
};
