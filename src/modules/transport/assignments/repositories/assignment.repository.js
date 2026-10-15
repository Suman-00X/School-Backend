import { desc, eq, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { transportAssignments as assignments } from "../models/assignment.schema.js";

export const assignmentRepository = {
  ...createRepository({ table: assignments, queryKey: "transportAssignments", orderBy: desc(assignments.createdAt) }),

  /* Lock one assignment (end / change) */
  lockForUpdate: async (tenantId, assignmentId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(assignments)
      .where(scoped(assignments, tenantId, eq(assignments.id, assignmentId)))
      .for("update");
    return row ?? null;
  },

  /* Active assignments grouped by a column -> Map(value -> count) */
  countActiveBy: async (tenantId, column, conditions = [], { dbc = db } = {}) => {
    const rows = await dbc
      .select({ key: column, count: sql`count(*)::int` })
      .from(assignments)
      .where(scoped(assignments, tenantId, eq(assignments.status, "ACTIVE"), ...conditions))
      .groupBy(column);
    return new Map(rows.map(row => [row.key, row.count]));
  }
};
