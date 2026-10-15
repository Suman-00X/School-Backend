import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";
import { users } from "../../accounts/models/user.schema.js";
import { createProfileService } from "../../shared/services/profileService.factory.js";
import { nextStaffCode } from "../../shared/utils/codes.util.js";
import { staffMembers } from "../models/staffMember.schema.js";
import { staffMemberRepository } from "../repositories/staffMember.repository.js";

const base = createProfileService({
  repository: staffMemberRepository,
  entity: "Staff member",
  codeField: "employeeCode",
  nextCode: (ctx, profile, options) => nextStaffCode(ctx.tenantId, profile.joiningDate, options)
});

export const staffService = {
  ...base,

  /* ?role=PRINCIPAL filters by the account's role */
  list: (ctx, { page, limit, role }) => {
    const conditions = role
      ? [inArray(staffMembers.userId, db.select({ id: users.id }).from(users).where(and(eq(users.tenantId, ctx.tenantId), eq(users.role, role))))]
      : [];
    return base.list(ctx, { page, limit }, conditions);
  },

  create: (ctx, { role, user, profile }) => base.createWithAccount(ctx, { role, user, profile })
};
