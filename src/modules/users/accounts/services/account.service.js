import { eq, inArray } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { users } from "../models/user.schema.js";
import { userRepository } from "../repositories/user.repository.js";

const base = createCrudService(userRepository, { entity: "User" });

export const accountService = {
  list: (ctx, { page, limit, role, status }) =>
    base.list(ctx, { page, limit }, [role && eq(users.role, role), status && eq(users.status, status)].filter(Boolean)),

  getById: base.getById,

  update: base.update,

  deactivate: async (ctx, userId) => {
    if (userId === ctx.userId) throw unprocessable("You cannot deactivate your own account");

    const user = await userRepository.update(ctx.tenantId, userId, { isActive: false, status: "INACTIVE" });
    if (!user) throw notFound("User");
    return user;
  },

  /* For other modules: active accounts by id (contact details for messaging) */
  findManyByIds: (ctx, userIds) =>
    userIds.length ? userRepository.findMany(ctx.tenantId, { conditions: [inArray(users.id, userIds)] }) : [],

  /* Active accounts with any of these roles */
  findByRoles: (ctx, roles) => userRepository.findMany(ctx.tenantId, { conditions: [inArray(users.role, roles)] }),

  /* For other modules: an active account by email (case-insensitive), or null */
  findByEmail: (ctx, email) =>
    userRepository.findOne(ctx.tenantId, [eq(users.email, String(email).trim().toLowerCase())]),

  /* For other users/* submodules: create the account behind a new person.
     Pass { dbc: tx } to join the caller's transaction. */
  createAccount: (ctx, person, role, options) => userRepository.create(ctx.tenantId, { ...person, role }, options)
};
