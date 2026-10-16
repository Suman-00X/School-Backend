import { ilike, inArray } from "drizzle-orm";
import { findPermission } from "../../../../common/auth/catalogue.js";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { buildPageMeta } from "../../../../common/utils/pagination.util.js";
import { lockKey } from "../../shared/utils/locks.util.js";
import { operatorRoles } from "../models/operatorRole.schema.js";
import { accessAssignmentRepository } from "../repositories/accessAssignment.repository.js";
import { operatorRoleRepository } from "../repositories/operatorRole.repository.js";
import { moduleLabel } from "./catalogue.service.js";
import { accessGrants, operatorGrantable } from "./grants.service.js";
import { accessScope } from "./scope.service.js";

/* Each permission with its label; `available` is false for one that can no longer be given
   to operators (removed from the catalogue, or made owner-only): it then grants nothing */
const withDetails = (role, holders) => ({
  ...role,
  moduleLabel: moduleLabel(role.module),
  permissionDetails: role.permissions.map(key => {
    const entry = findPermission(key);
    return { key, label: entry?.label ?? key, available: operatorGrantable(entry, role.module) };
  }),
  ...(holders !== undefined && { holders })
});

/* Every key exists, belongs to the role's module, and may be given to an operator */
const assertPermissions = (module, keys) => {
  const problems = keys.map(key => {
    const entry = findPermission(key);
    if (!entry) return `${key} is not a known permission`;
    if (entry.module !== module) {
      return `${key} belongs to the ${moduleLabel(entry.module)} module, not ${moduleLabel(module)}`;
    }
    if (entry.ownerOnly) return `"${entry.label}" (${key}) is reserved for the module's owners`;
    if (entry.selfService) return `"${entry.label}" (${key}) is self-service and follows the account's role`;
    return null;
  });
  const refused = problems.filter(Boolean);
  if (refused.length) throw unprocessable(`An operator role cannot include: ${refused.join("; ")}`);
};

/* Names are unique per module, whatever the casing; the lock makes the check hold until commit */
const assertNameFree = async (ctx, module, name, exceptId, { dbc }) => {
  await lockKey(dbc, "access.operatorRole", ctx.tenantId, module, name.toLowerCase());
  const existing = await operatorRoleRepository.findByName(ctx.tenantId, module, name, { dbc });
  if (existing && existing.id !== exceptId) {
    throw conflict(`The ${moduleLabel(module)} module already has an operator role named ${existing.name}`);
  }
};

const unique = keys => [...new Set(keys)].sort();

export const operatorRoleService = {
  /* Roles of the modules the user administers: ?module=, ?search= (name) */
  list: async (ctx, { page, limit, module, search }) => {
    const modules = await accessScope.visibleModules(ctx, module);
    if (!modules.length) return { rows: [], meta: buildPageMeta(page, limit, 0) };
    const result = await operatorRoleRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: [
        inArray(operatorRoles.module, modules),
        search && ilike(operatorRoles.name, `%${search.replace(/[\\%_]/g, char => `\\${char}`)}%`)
      ].filter(Boolean)
    });
    const holders = await accessAssignmentRepository.countLiveByRole(
      ctx.tenantId,
      result.rows.map(row => row.id),
      await tenantToday(ctx.tenantId)
    );
    return { ...result, rows: result.rows.map(row => withDetails(row, holders.get(row.id) ?? 0)) };
  },

  getById: async (ctx, roleId) => {
    const role = await operatorRoleRepository.findById(ctx.tenantId, roleId);
    if (!role) throw notFound("Operator role");
    await accessScope.assertManages(ctx, role.module);
    const holders = await accessAssignmentRepository.countLive(ctx.tenantId, roleId, await tenantToday(ctx.tenantId));
    return withDetails(role, holders);
  },

  create: async (ctx, { module, name, description, permissions }) => {
    await accessScope.assertManages(ctx, module);
    assertPermissions(module, permissions);
    const role = await transaction(async tx => {
      await assertNameFree(ctx, module, name, null, { dbc: tx });
      return operatorRoleRepository.create(
        ctx.tenantId,
        { module, name, description, permissions: unique(permissions), createdBy: ctx.userId, updatedBy: ctx.userId },
        { dbc: tx }
      );
    });
    return withDetails(role, 0);
  },

  /* The module never changes; new permissions apply to every holder on their next request */
  update: async (ctx, roleId, { name, description, permissions }) => {
    await transaction(async tx => {
      const role = await operatorRoleRepository.lockForUpdate(ctx.tenantId, roleId, { dbc: tx });
      if (!role) throw notFound("Operator role");
      await accessScope.assertManages(ctx, role.module);
      if (permissions) assertPermissions(role.module, permissions);
      if (name && name.toLowerCase() !== role.name.toLowerCase()) {
        await assertNameFree(ctx, role.module, name, roleId, { dbc: tx });
      }
      await operatorRoleRepository.update(
        ctx.tenantId,
        roleId,
        { name, description, permissions: permissions && unique(permissions), updatedBy: ctx.userId },
        { dbc: tx }
      );
    });
    await accessGrants.invalidate(ctx.tenantId);
    return operatorRoleService.getById(ctx, roleId);
  },

  /* Only once nobody holds it (now or later): revoke or let the assignments end first.
     Assigning takes the same row lock, so no assignment can slip in. */
  remove: async (ctx, roleId) => {
    const role = await transaction(async tx => {
      const locked = await operatorRoleRepository.lockForUpdate(ctx.tenantId, roleId, { dbc: tx });
      if (!locked) throw notFound("Operator role");
      await accessScope.assertManages(ctx, locked.module);
      const holders = await accessAssignmentRepository.countLive(
        ctx.tenantId,
        roleId,
        await tenantToday(ctx.tenantId),
        {
          dbc: tx
        }
      );
      if (holders) {
        throw conflict(
          `${locked.name} is held by ${holders} user(s), now or from a later date; revoke those assignments before removing it`
        );
      }
      return operatorRoleRepository.softDelete(ctx.tenantId, roleId, { dbc: tx });
    });
    await accessGrants.invalidate(ctx.tenantId);
    return role;
  },

  /* For the assignment service: the role locked for the rest of the transaction, or null */
  lockForUpdate: (ctx, roleId, { dbc }) => operatorRoleRepository.lockForUpdate(ctx.tenantId, roleId, { dbc })
};
