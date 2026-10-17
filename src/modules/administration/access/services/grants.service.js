import { cache } from "../../../../common/cache/cache.js";
import { findPermission, listPermissions } from "../../../../common/auth/catalogue.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { ACCESS_MODULE_KEYS, ACCESS_MODULES, ASSIGNABLE_ROLES } from "../../shared/constants/access.constants.js";
import { ACCESS_PERMISSIONS, OWNER_ACCESS_KEYS } from "../permissions/access.permissions.js";
import { accessAssignmentRepository } from "../repositories/accessAssignment.repository.js";

/* A user's assignments are cached for 5 minutes under the school's access version.
   Every change to an operator role or assignment bumps the version (after commit), so the
   next request reads them again; a request that read old data just before a change can
   only write it under the old version, which nobody reads any more. */
const TTL_SECONDS = 300;
/* Far longer than an entry lives: when the counter's window ends it starts again, by then
   every entry written under its old values has expired */
const VERSION_TTL_SECONDS = 30 * 24 * 3600;
const versionKey = tenantId => `tenant:${tenantId}:access:version`;
const userKey = (tenantId, version, userId) => `tenant:${tenantId}:access:v${version}:user:${userId}`;

/* Derived state of an assignment as of `today` */
export const statusOf = (assignment, today) => {
  if (assignment.revokedAt) return "REVOKED";
  if (assignment.validFrom && assignment.validFrom > today) return "SCHEDULED";
  if (assignment.validTo && assignment.validTo < today) return "EXPIRED";
  return "ACTIVE";
};

export const isLive = (assignment, today) => statusOf(assignment, today) === "ACTIVE";

/* Whether an operator role of `module` may carry this catalogue entry */
export const operatorGrantable = (entry, module) =>
  Boolean(entry && ACCESS_MODULES[module] && entry.module === module && !entry.ownerOnly && !entry.selfService);

/* Never held through ownership: who owns a module stays ADMIN's decision. It is not a
   permission of any owned module, so ownerHolds() leaves it out anyway; listed so it stays so. */
const NEVER_FOR_OWNERS = new Set([ACCESS_PERMISSIONS.manageOwners.key]);

/* An owner is the administrator inside their module (D-67): every permission of the module,
   ADMIN-only ones included, whatever roles it lists. Self-service follows the account's role. */
export const ownerHolds = (entry, module) =>
  Boolean(entry && ACCESS_MODULES[module] && entry.module === module && !entry.selfService) &&
  !NEVER_FOR_OWNERS.has(entry.key);

/* What an owner of the module holds in it */
export const ownerPermissions = module => listPermissions().filter(entry => ownerHolds(entry, module));

/* The modules a built-in owner role runs: LIBRARIAN -> ["library"] */
export const modulesOwnedByRole = role =>
  ACCESS_MODULE_KEYS.filter(module => ACCESS_MODULES[module].ownerRole === role);

/* Keys an assignment grants while it is live. A permission later removed from the catalogue,
   or made owner-only, stops being granted by operator roles that still list it. */
export const keysOf = assignment => {
  if (assignment.kind === "OWNER") {
    return [...ownerPermissions(assignment.module).map(entry => entry.key), ...OWNER_ACCESS_KEYS];
  }
  if (!assignment.operatorRole?.isActive) return [];
  return assignment.operatorRole.permissions.filter(key => operatorGrantable(findPermission(key), assignment.module));
};

const cachedAssignments = async (tenantId, userId) => {
  const version = (await cache.get(versionKey(tenantId))) ?? 0;
  return cache.wrap(userKey(tenantId, version, userId), TTL_SECONDS, async () => {
    const rows = await accessAssignmentRepository.findCurrentForUser(tenantId, userId, await tenantToday(tenantId));
    return rows.map(({ id, kind, module, validFrom, validTo, revokedAt, operatorRole }) => ({
      id,
      kind,
      module,
      validFrom,
      validTo,
      revokedAt,
      operatorRole
    }));
  });
};

export const accessGrants = {
  /* The grants resolver (registered in src/routes.js): every permission of the modules the
     user's role owns (HOSTEL_MANAGER: all of hostel), plus the keys of their live assignments.
     Validity dates are checked against today on every request. */
  resolve: async ctx => {
    if (!ASSIGNABLE_ROLES.includes(ctx.role)) return [];
    const [assignments, today] = await Promise.all([
      cachedAssignments(ctx.tenantId, ctx.userId),
      tenantToday(ctx.tenantId)
    ]);
    const owned = modulesOwnedByRole(ctx.role).flatMap(module => ownerPermissions(module).map(entry => entry.key));
    return [...new Set([...owned, ...assignments.filter(assignment => isLive(assignment, today)).flatMap(keysOf)])];
  },

  /* Call after the change has committed */
  invalidate: tenantId => cache.increment(versionKey(tenantId), VERSION_TTL_SECONDS)
};
