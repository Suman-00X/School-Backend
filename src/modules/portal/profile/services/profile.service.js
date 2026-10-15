import { ROLES, ROLE_GROUPS } from "../../../../common/auth/roles.js";
import { accountService } from "../../../users/accounts/index.js";
import { parentService } from "../../../users/parents/index.js";
import { staffService } from "../../../users/staff/index.js";
import { studentService } from "../../../users/students/index.js";
import { teacherService } from "../../../users/teachers/index.js";

const profileFinder = role => {
  if (role === ROLES.STUDENT) return studentService;
  if (role === ROLES.PARENT) return parentService;
  if (role === ROLES.TEACHER) return teacherService;
  if (ROLE_GROUPS.STAFF_ROLES.includes(role)) return staffService;
  return null;
};

export const profileService = {
  /* The signed-in account and the role profile behind it */
  me: async ctx => {
    const account = await accountService.getById(ctx, ctx.userId);
    const profile = (await profileFinder(ctx.role)?.findByUserId(ctx, ctx.userId)) ?? null;
    if (profile) delete profile.user;
    return { role: ctx.role, account, profile };
  }
};
