import { eq, inArray } from "drizzle-orm";
import { ROLES } from "../../../../common/auth/roles.js";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { buildPageMeta } from "../../../../common/utils/pagination.util.js";
import { accountService } from "../../../users/accounts/index.js";
import { ACCESS_MODULES, ASSIGNABLE_ROLES } from "../../shared/constants/access.constants.js";
import { lockKey } from "../../shared/utils/locks.util.js";
import { accessAssignments as assignments } from "../models/accessAssignment.schema.js";
import { accessAssignmentRepository, statusCondition } from "../repositories/accessAssignment.repository.js";
import { accessGrants, statusOf } from "./grants.service.js";
import { operatorRoleService } from "./operatorRole.service.js";
import { accessScope } from "./scope.service.js";

const person = { columns: { id: true, firstName: true, lastName: true, role: true } };
const relations = {
  user: { columns: { id: true, firstName: true, lastName: true, email: true, role: true, status: true } },
  operatorRole: { columns: { id: true, name: true, module: true } },
  assigner: person,
  revoker: person
};

export const fullName = user => `${user.firstName} ${user.lastName}`.trim();

/* "from 2026-10-17 until 2026-12-31", "from 2026-10-17", "until 2026-12-31", "with no end date" */
export const period = ({ validFrom, validTo }) =>
  [validFrom && `from ${validFrom}`, validTo && `until ${validTo}`].filter(Boolean).join(" ") || "with no end date";

/* "Transport desk (Transport)" or "owner of the Hostel module" */
export const accessLabel = assignment =>
  assignment.kind === "OWNER"
    ? `owner of the ${ACCESS_MODULES[assignment.module].label} module`
    : `${assignment.operatorRole.name} (${ACCESS_MODULES[assignment.module].label})`;

const present = (assignment, today) => ({
  ...assignment,
  status: statusOf(assignment, today),
  moduleLabel: ACCESS_MODULES[assignment.module].label
});

/* The person must be an active employee who would gain something from it */
const assertAssignable = (user, module) => {
  const name = fullName(user);
  if (user.status !== "ACTIVE") throw unprocessable(`${name}'s account is ${user.status.toLowerCase()}`);
  if (user.role === ROLES.ADMIN) throw unprocessable(`${name} is an administrator and already has full access`);
  if (!ASSIGNABLE_ROLES.includes(user.role)) {
    throw unprocessable(`${name} has a ${user.role.toLowerCase()} account; module access is for staff accounts only`);
  }
  const { label, ownerRole } = ACCESS_MODULES[module];
  if (user.role === ownerRole) {
    throw unprocessable(`${name} is the ${label} module's administrator (${ownerRole}) and already owns it`);
  }
};

/* Who may change an existing assignment: ADMIN for ownerships, the module's owners for operators */
const assertMayChange = (ctx, assignment) =>
  assignment.kind === "OWNER"
    ? accessScope.assertManagesOwners(ctx)
    : accessScope.assertManages(ctx, assignment.module);

/* today: also refuse an end date in the past (null: not checked) */
const assertDates = ({ validFrom, validTo }, today) => {
  if (validFrom && validTo && validTo < validFrom) throw unprocessable("validTo cannot be before validFrom");
  if (today && validTo && validTo < today) {
    throw unprocessable(`validTo ${validTo} is in the past; revoke the assignment instead of ending it earlier`);
  }
};

const assertNoOverlap = async (ctx, assignment, holder, { dbc, exceptId }) => {
  const overlap = await accessAssignmentRepository.findOverlap(ctx.tenantId, { ...assignment, exceptId }, { dbc });
  if (overlap) {
    const what =
      assignment.kind === "OWNER"
        ? `is already an ${accessLabel(assignment)}`
        : `already holds ${accessLabel(assignment)}`;
    throw conflict(`${fullName(holder)} ${what} ${period(overlap)}`);
  }
};

export const assignmentService = {
  /* Filters: module, kind, userId, operatorRoleId, status (as of today) */
  list: async (ctx, { page, limit, module, kind, userId, operatorRoleId, status }) => {
    const modules = await accessScope.visibleModules(ctx, module);
    if (!modules.length) return { rows: [], meta: buildPageMeta(page, limit, 0) };
    const today = await tenantToday(ctx.tenantId);
    const result = await accessAssignmentRepository.list(ctx.tenantId, {
      page,
      limit,
      with: relations,
      conditions: [
        inArray(assignments.module, modules),
        kind && eq(assignments.kind, kind),
        userId && eq(assignments.userId, userId),
        operatorRoleId && eq(assignments.operatorRoleId, operatorRoleId),
        status && statusCondition(status, today)
      ].filter(Boolean)
    });
    return { ...result, rows: result.rows.map(row => present(row, today)) };
  },

  getById: async (ctx, assignmentId) => {
    const assignment = await accessAssignmentRepository.findById(ctx.tenantId, assignmentId, { with: relations });
    if (!assignment) throw notFound("Assignment");
    await accessScope.assertManages(ctx, assignment.module);
    return present(assignment, await tenantToday(ctx.tenantId));
  },

  /* OPERATOR: { operatorRoleId, userId } by the role's module owners or ADMIN.
     OWNER: { module, userId } by ADMIN only. Optional validFrom/validTo (inclusive). */
  create: async (ctx, { kind, operatorRoleId, module: owned, userId, validFrom, validTo, note }) => {
    const today = await tenantToday(ctx.tenantId);
    const assignmentId = await transaction(async tx => {
      let assignment;
      if (kind === "OWNER") {
        await accessScope.assertManagesOwners(ctx);
        /* No row to lock yet: serialize ownerships of this module for this user */
        await lockKey(tx, "access.owner", ctx.tenantId, owned, userId);
        assignment = { kind, module: owned, operatorRoleId: null };
      } else {
        /* The role's lock also keeps it from being removed meanwhile */
        const role = await operatorRoleService.lockForUpdate(ctx, operatorRoleId, { dbc: tx });
        if (!role) throw unprocessable("operatorRoleId does not refer to an existing operator role");
        await accessScope.assertManages(ctx, role.module);
        assignment = { kind, module: role.module, operatorRoleId, operatorRole: role };
      }

      const [user] = await accountService.findManyByIds(ctx, [userId]);
      if (!user) throw unprocessable("userId does not refer to an active user");
      assertAssignable(user, assignment.module);
      assertDates({ validFrom, validTo }, today);
      await assertNoOverlap(ctx, { ...assignment, userId, validFrom, validTo }, user, { dbc: tx });

      const row = await accessAssignmentRepository.create(
        ctx.tenantId,
        {
          kind,
          module: assignment.module,
          operatorRoleId: assignment.operatorRoleId,
          userId,
          validFrom,
          validTo,
          note,
          assignedBy: ctx.userId
        },
        { dbc: tx }
      );
      return row.id;
    });
    await accessGrants.invalidate(ctx.tenantId);
    return assignmentService.getById(ctx, assignmentId);
  },

  /* Change the dates (null: from the start / no end) or the note */
  update: async (ctx, assignmentId, changes) => {
    const today = await tenantToday(ctx.tenantId);
    await transaction(async tx => {
      const assignment = await accessAssignmentRepository.lockForUpdate(ctx.tenantId, assignmentId, { dbc: tx });
      if (!assignment) throw notFound("Assignment");
      await assertMayChange(ctx, assignment);
      if (assignment.revokedAt) throw conflict("This assignment has been revoked and can no longer be changed");

      if ("validFrom" in changes || "validTo" in changes) {
        /* Locked like a new assignment: extending one cannot race the role's removal */
        const role =
          assignment.kind === "OPERATOR" &&
          (await operatorRoleService.lockForUpdate(ctx, assignment.operatorRoleId, { dbc: tx }));
        if (role === null) throw conflict("The operator role of this assignment has been removed");
        const next = { ...assignment, ...changes, operatorRole: role };
        assertDates(next, "validTo" in changes ? today : null);
        const [user] = await accountService.findManyByIds(ctx, [assignment.userId]);
        if (!user) throw conflict("The account of this assignment is no longer active");
        await assertNoOverlap(ctx, next, user, { dbc: tx, exceptId: assignmentId });
      }
      await accessAssignmentRepository.update(ctx.tenantId, assignmentId, changes, { dbc: tx });
    });
    await accessGrants.invalidate(ctx.tenantId);
    return assignmentService.getById(ctx, assignmentId);
  },

  /* Takes effect on the user's next request. The row stays, as history. */
  revoke: async (ctx, assignmentId) => {
    await transaction(async tx => {
      const assignment = await accessAssignmentRepository.lockForUpdate(ctx.tenantId, assignmentId, { dbc: tx });
      if (!assignment) throw notFound("Assignment");
      await assertMayChange(ctx, assignment);
      if (assignment.revokedAt) throw conflict("This assignment has already been revoked");
      await accessAssignmentRepository.update(
        ctx.tenantId,
        assignmentId,
        { revokedAt: new Date(), revokedBy: ctx.userId },
        { dbc: tx }
      );
    });
    await accessGrants.invalidate(ctx.tenantId);
    return assignmentService.getById(ctx, assignmentId);
  }
};
