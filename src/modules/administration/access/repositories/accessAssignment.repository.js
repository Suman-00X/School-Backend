import { and, arrayContains, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { accessAssignments as assignments } from "../models/accessAssignment.schema.js";
import { operatorRoles } from "../models/operatorRole.schema.js";

const notRevoked = isNull(assignments.revokedAt);
const startedBy = day => or(isNull(assignments.validFrom), lte(assignments.validFrom, day));
const notEndedBy = day => or(isNull(assignments.validTo), gte(assignments.validTo, day));

/* SQL for a derived status as of `today` */
export const statusCondition = (status, today) =>
  ({
    REVOKED: isNotNull(assignments.revokedAt),
    SCHEDULED: and(notRevoked, gt(assignments.validFrom, today)),
    EXPIRED: and(notRevoked, lt(assignments.validTo, today)),
    ACTIVE: and(notRevoked, startedBy(today), notEndedBy(today))
  })[status];

export const accessAssignmentRepository = {
  ...createRepository({ table: assignments, queryKey: "accessAssignments" }),

  lockForUpdate: async (tenantId, assignmentId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(assignments)
      .where(scoped(assignments, tenantId, eq(assignments.id, assignmentId)))
      .for("update");
    return row ?? null;
  },

  /* A not-revoked assignment of the same role (or ownership of the same module) to the user
     whose dates overlap [validFrom, validTo] (null = open) */
  findOverlap: (tenantId, { kind, module, operatorRoleId, userId, validFrom, validTo, exceptId }, { dbc } = {}) =>
    accessAssignmentRepository.findOne(
      tenantId,
      [
        eq(assignments.userId, userId),
        eq(assignments.kind, kind),
        kind === "OPERATOR" ? eq(assignments.operatorRoleId, operatorRoleId) : eq(assignments.module, module),
        notRevoked,
        validTo && startedBy(validTo),
        validFrom && notEndedBy(validFrom),
        exceptId && ne(assignments.id, exceptId)
      ].filter(Boolean),
      { dbc }
    ),

  /* A user's not-revoked assignments that have not ended before `from`, with their operator role */
  findCurrentForUser: (tenantId, userId, from, { dbc } = {}) =>
    accessAssignmentRepository.findMany(tenantId, {
      conditions: [eq(assignments.userId, userId), notRevoked, notEndedBy(from)],
      with: {
        operatorRole: { columns: { id: true, name: true, module: true, permissions: true, isActive: true } }
      },
      dbc
    }),

  /* A user's not-revoked assignments of these kinds in a module that have not ended before
     `from`, locked for the rest of the transaction (a handover) */
  lockCurrentInModule: (tenantId, { userId, module, kinds }, from, { dbc }) =>
    dbc
      .select()
      .from(assignments)
      .where(
        scoped(
          assignments,
          tenantId,
          eq(assignments.userId, userId),
          eq(assignments.module, module),
          inArray(assignments.kind, kinds),
          notRevoked,
          notEndedBy(from)
        )
      )
      .orderBy(assignments.createdAt)
      .for("update"),

  /* Assignments of a role that are active now or start later */
  countLive: (tenantId, operatorRoleId, today, { dbc } = {}) =>
    accessAssignmentRepository.count(
      tenantId,
      [eq(assignments.operatorRoleId, operatorRoleId), notRevoked, notEndedBy(today)],
      { dbc }
    ),

  /* roleId -> number of its assignments active now or starting later */
  countLiveByRole: async (tenantId, roleIds, today) => {
    if (!roleIds.length) return new Map();
    const rows = await db
      .select({ roleId: assignments.operatorRoleId, count: sql`count(*)::int` })
      .from(assignments)
      .where(scoped(assignments, tenantId, inArray(assignments.operatorRoleId, roleIds), notRevoked, notEndedBy(today)))
      .groupBy(assignments.operatorRoleId);
    return new Map(rows.map(row => [row.roleId, row.count]));
  },

  /* Users with an assignment active today that grants the permission:
     ownership of its module (when owners hold it) or an operator role listing it */
  findHolders: async (tenantId, { module, key, ownersHold, operatorsHold }, today) => {
    const grants = [
      ownersHold && eq(assignments.kind, "OWNER"),
      operatorsHold && and(eq(assignments.kind, "OPERATOR"), arrayContains(operatorRoles.permissions, [key]))
    ].filter(Boolean);
    if (!grants.length) return [];
    const rows = await db
      .selectDistinct({ userId: assignments.userId })
      .from(assignments)
      .leftJoin(operatorRoles, and(eq(operatorRoles.id, assignments.operatorRoleId), scoped(operatorRoles, tenantId)))
      .where(
        scoped(
          assignments,
          tenantId,
          eq(assignments.module, module),
          notRevoked,
          startedBy(today),
          notEndedBy(today),
          or(...grants)
        )
      );
    return rows.map(row => row.userId);
  }
};
