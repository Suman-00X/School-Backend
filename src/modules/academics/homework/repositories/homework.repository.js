import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { homeworkAssignments, homeworkSubmissions } from "../models/homework.schema.js";

export const homeworkRepository = {
  ...createRepository({
    table: homeworkAssignments,
    queryKey: "homeworkAssignments",
    orderBy: [desc(homeworkAssignments.dueDate)]
  }),

  /* homeworkId -> { submitted, graded } */
  submissionCounts: async (tenantId, homeworkIds) => {
    if (!homeworkIds.length) return new Map();
    const rows = await db
      .select({
        homeworkId: homeworkSubmissions.homeworkId,
        submitted: count(),
        graded: sql`count(*) FILTER (WHERE ${homeworkSubmissions.status} = 'GRADED')`.mapWith(Number)
      })
      .from(homeworkSubmissions)
      .where(
        and(
          eq(homeworkSubmissions.tenantId, tenantId),
          eq(homeworkSubmissions.isActive, true),
          inArray(homeworkSubmissions.homeworkId, homeworkIds)
        )
      )
      .groupBy(homeworkSubmissions.homeworkId);
    return new Map(rows.map(r => [r.homeworkId, { submitted: r.submitted, graded: r.graded }]));
  }
};

export const submissionRepository = createRepository({
  table: homeworkSubmissions,
  queryKey: "homeworkSubmissions",
  orderBy: desc(homeworkSubmissions.submittedAt)
});
