import { listPermissions } from "../../../../common/auth/catalogue.js";
import { hasPermission } from "../../../../common/auth/grants.js";
import { ACCESS_PERMISSIONS } from "../permissions/access.permissions.js";
import { notFound } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { accountService } from "../../../users/accounts/index.js";
import { ACCESS_MODULES, ASSIGNABLE_ROLES } from "../../shared/constants/access.constants.js";
import { accessAssignmentRepository } from "../repositories/accessAssignment.repository.js";
import { groupByModule } from "./catalogue.service.js";
import {
  isLive,
  keysOf,
  modulesOwnedByRole,
  operatorGrantable,
  ownerHolds,
  ownerPermissions,
  statusOf
} from "./grants.service.js";
import { accessScope } from "./scope.service.js";

/* Where a grant comes from */
const sourceOf = assignment => ({
  type: assignment.kind,
  assignmentId: assignment.id,
  ...(assignment.kind === "OPERATOR" && {
    operatorRoleId: assignment.operatorRole.id,
    operatorRoleName: assignment.operatorRole.name
  }),
  validFrom: assignment.validFrom,
  validTo: assignment.validTo
});

/* Effective permissions of an account, per module, each with its sources:
   ROLE (the account's role), OPERATOR (an operator role) or OWNER (module ownership: by an
   assignment, or { type: "OWNER", role } for what a built-in owner role holds beyond its list).
   `modules`: the modules to show (null = all). */
const effectiveAccess = async (ctx, user, modules) => {
  const today = await tenantToday(ctx.tenantId);
  const shown = module => !modules || modules.includes(module);
  const current = ASSIGNABLE_ROLES.includes(user.role)
    ? await accessAssignmentRepository.findCurrentForUser(ctx.tenantId, user.id, today)
    : [];

  const sources = new Map();
  const add = (key, source) => sources.set(key, [...(sources.get(key) ?? []), source]);
  for (const entry of listPermissions()) {
    if (entry.roles.includes(user.role)) add(entry.key, { type: "ROLE", role: user.role });
  }
  for (const module of modulesOwnedByRole(user.role)) {
    for (const entry of ownerPermissions(module)) {
      if (!entry.roles.includes(user.role)) add(entry.key, { type: "OWNER", role: user.role });
    }
  }
  for (const assignment of current.filter(row => isLive(row, today))) {
    for (const key of keysOf(assignment)) add(key, sourceOf(assignment));
  }

  const entries = listPermissions().filter(entry => sources.has(entry.key) && shown(entry.module));
  const ownerOf = new Set(
    Object.keys(ACCESS_MODULES).filter(
      module =>
        ACCESS_MODULES[module].ownerRole === user.role ||
        current.some(row => row.kind === "OWNER" && row.module === module && isLive(row, today))
    )
  );
  return {
    user: { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role, status: user.status },
    asOf: today,
    modules: groupByModule(entries, entry => ({
      key: entry.key,
      action: entry.action,
      label: entry.label,
      sources: sources.get(entry.key)
    })).map(group => ({ ...group, owner: ownerOf.has(group.module) })),
    /* Live and upcoming assignments (revoked and expired ones are in GET /assignments) */
    assignments: current
      .filter(row => shown(row.module))
      .map(row => ({
        id: row.id,
        kind: row.kind,
        module: row.module,
        operatorRole: row.operatorRole && { id: row.operatorRole.id, name: row.operatorRole.name },
        validFrom: row.validFrom,
        validTo: row.validTo,
        status: statusOf(row, today)
      }))
  };
};

export const userAccessService = {
  /* ADMIN sees every module; a module owner sees the modules they own */
  forUser: async (ctx, userId, { module } = {}) => {
    const [user] = await accountService.findManyByIds(ctx, [userId]);
    if (!user) throw notFound("User");
    const modules = (await hasPermission(ctx, ACCESS_PERMISSIONS.readAll))
      ? module && [module]
      : await accessScope.visibleModules(ctx, module);
    return effectiveAccess(ctx, user, modules || null);
  },

  /* The signed-in user's own access, every module */
  mine: async (ctx, { module } = {}) => {
    const [user] = await accountService.findManyByIds(ctx, [ctx.userId]);
    if (!user) throw notFound("User");
    return effectiveAccess(ctx, user, module ? [module] : null);
  }
};

/* For other modules */
export const accessService = {
  /* Users with an assignment active today that grants this permission (not counting those
     who hold it by their role, the built-in owner role included): e.g. everyone besides the
     hostel manager who manages hostel allocations */
  usersGranted: async (ctx, permission) => {
    if (!ACCESS_MODULES[permission.module]) return [];
    return accessAssignmentRepository.findHolders(
      ctx.tenantId,
      {
        module: permission.module,
        key: permission.key,
        ownersHold: ownerHolds(permission, permission.module),
        operatorsHold: operatorGrantable(permission, permission.module)
      },
      await tenantToday(ctx.tenantId)
    );
  }
};
