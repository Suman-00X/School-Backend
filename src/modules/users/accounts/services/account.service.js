import { eq, inArray } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { revokeUserTokens } from "../../../../common/auth/revocation.js";
import { publish } from "../../../../common/events/events.js";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { users } from "../models/user.schema.js";
import { userRepository } from "../repositories/user.repository.js";
import { accountDirectory } from "./accountDirectory.service.js";

export const USER_EMAIL_CHANGED = "users.account.emailChanged";

const base = createCrudService(userRepository, { entity: "User" });

export const accountService = {
  list: (ctx, { page, limit, role, status }) =>
    base.list(ctx, { page, limit }, [role && eq(users.role, role), status && eq(users.status, status)].filter(Boolean)),

  getById: base.getById,

  /* A changed sign-in email ends the account's sessions and tells the old address (auth
     module), and moves the account in the login directory */
  update: async (ctx, userId, data) => {
    const before = data.email ? await userRepository.findById(ctx.tenantId, userId) : null;
    const user = await base.update(ctx, userId, data);
    if (before && before.email !== user.email) {
      await accountDirectory.emailChanged(ctx.tenantId, userId, { oldEmail: before.email, newEmail: user.email });
      await publish(USER_EMAIL_CHANGED, {
        tenantId: ctx.tenantId,
        userId,
        oldEmail: before.email,
        newEmail: user.email
      });
    }
    return user;
  },

  deactivate: async (ctx, userId) => {
    if (userId === ctx.userId) throw unprocessable("You cannot deactivate your own account");

    const user = await userRepository.update(ctx.tenantId, userId, { isActive: false, status: "INACTIVE" });
    if (!user) throw notFound("User");
    /* Signed-in devices stop working now, not when their tokens expire */
    await revokeUserTokens(userId);
    await accountDirectory.deactivated(ctx.tenantId, userId);
    return user;
  },

  /* For other modules: active accounts by id (contact details for messaging) */
  findManyByIds: (ctx, userIds) =>
    userIds.length ? userRepository.findMany(ctx.tenantId, { conditions: [inArray(users.id, userIds)] }) : [],

  /* For other modules: accounts by id, deactivated ones included (people who have left, by name) */
  findAnyByIds: (ctx, userIds) => (userIds.length ? userRepository.findAnyByIds(ctx.tenantId, userIds) : []),

  /* For the audit trail: who is acting, as { name, role } now (or null) */
  actorOf: async (ctx, userId) => {
    const user = await userRepository.findById(ctx.tenantId, userId);
    return user && { name: `${user.firstName} ${user.lastName}`.trim(), role: user.role };
  },

  /* Active accounts with any of these roles */
  findByRoles: (ctx, roles) => userRepository.findMany(ctx.tenantId, { conditions: [inArray(users.role, roles)] }),

  /* For other modules: an active account by email (case-insensitive), or null */
  findByEmail: (ctx, email) =>
    userRepository.findOne(ctx.tenantId, [eq(users.email, String(email).trim().toLowerCase())]),

  /* For the auth module (sign-in, passwords) */
  credentials: {
    /* No school context: the active schools with an account for this email -> [{ id, code, name }] */
    schoolsFor: email => accountDirectory.schoolsFor(email),
    signedIn: (ctx, user) => accountDirectory.signedIn(ctx.tenantId, user),
    find: (ctx, email) => userRepository.findCredentials(ctx.tenantId, String(email).trim().toLowerCase()),
    findById: (ctx, userId) => userRepository.findCredentialsById(ctx.tenantId, userId),
    recordLogin: (ctx, userId, extra) => userRepository.recordLogin(ctx.tenantId, userId, extra),
    setPasswordHash: (ctx, userId, passwordHash, options) =>
      userRepository.setPasswordHash(ctx.tenantId, userId, passwordHash, options)
  },

  /* For other users/* submodules: create the account behind a new person (and list it in
     the login directory). Pass { dbc: tx } to join the caller's transaction. */
  createAccount: async (ctx, person, role, options) => {
    const account = await userRepository.create(ctx.tenantId, { ...person, role }, options);
    await accountDirectory.added(ctx.tenantId, account);
    return account;
  }
};
