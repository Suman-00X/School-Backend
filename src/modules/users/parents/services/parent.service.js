import { eq } from "drizzle-orm";
import { ROLES } from "../../../../common/auth/roles.js";
import { createProfileService } from "../../shared/services/profileService.factory.js";
import { nextParentCode } from "../../shared/utils/codes.util.js";
import { parents } from "../models/parent.schema.js";
import { parentRepository } from "../repositories/parent.repository.js";

const base = createProfileService({
  repository: parentRepository,
  entity: "Parent",
  codeField: "parentCode",
  nextCode: (ctx, profile, options) => nextParentCode(ctx.tenantId, undefined, options)
});

export const parentService = {
  ...base,

  /* Pass { dbc: tx } to create inside a student admission */
  create: (ctx, { user, profile }, options) =>
    base.createWithAccount(ctx, { role: ROLES.PARENT, user, profile }, options),

  exists: (ctx, parentId) => parentRepository.exists(ctx.tenantId, [eq(parents.id, parentId)])
};
