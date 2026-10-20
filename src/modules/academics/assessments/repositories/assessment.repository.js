import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";
import { createRepository, scoped } from "../../../../common/database/repository.js";
/* Tables only: assessment-schemes and homework import this module */
import { assessmentSchemeBuckets, assessmentSchemes } from "../../assessment-schemes/models/assessmentScheme.schema.js";
import { homeworkSubmissions } from "../../homework/models/homework.schema.js";
import { assessmentMarks, assessments } from "../models/assessment.schema.js";

const base = createRepository({
  table: assessments,
  queryKey: "assessments",
  orderBy: [asc(assessments.assessedOn), asc(assessments.createdAt)]
});

const marksBase = createRepository({ table: assessmentMarks, queryKey: "assessmentMarks" });

const bucketColumns = {
  id: assessmentSchemeBuckets.id,
  name: assessmentSchemeBuckets.name,
  weight: assessmentSchemeBuckets.weight,
  sortOrder: assessmentSchemeBuckets.sortOrder,
  schemeId: assessmentSchemes.id,
  schemeName: assessmentSchemes.name,
  academicYearId: assessmentSchemes.academicYearId,
  resultsPublishedAt: assessmentSchemes.resultsPublishedAt
};

/* Active buckets of active schemes */
const bucketQuery = (tenantId, ...conditions) =>
  db
    .select(bucketColumns)
    .from(assessmentSchemeBuckets)
    .innerJoin(assessmentSchemes, eq(assessmentSchemes.id, assessmentSchemeBuckets.schemeId))
    .where(and(scoped(assessmentSchemeBuckets, tenantId), scoped(assessmentSchemes, tenantId), ...conditions))
    .orderBy(asc(assessmentSchemes.name), asc(assessmentSchemeBuckets.sortOrder));

export const assessmentRepository = {
  ...base,

  bucketsInYear: (tenantId, academicYearId) => bucketQuery(tenantId, eq(assessmentSchemes.academicYearId, academicYearId)),

  findBucket: async (tenantId, bucketId) => (await bucketQuery(tenantId, eq(assessmentSchemeBuckets.id, bucketId)))[0] ?? null,

  /* bucketId -> active items */
  countByBucket: async (tenantId, bucketIds) => {
    if (!bucketIds.length) return new Map();
    const rows = await db
      .select({ bucketId: assessments.bucketId, count: sql`count(*)`.mapWith(Number) })
      .from(assessments)
      .where(scoped(assessments, tenantId, inArray(assessments.bucketId, bucketIds)))
      .groupBy(assessments.bucketId);
    return new Map(rows.map(r => [r.bucketId, r.count]));
  },

  /* itemId -> students with an entry (marks, or a status) */
  markedCounts: async (tenantId, itemIds) => {
    if (!itemIds.length) return new Map();
    const rows = await db
      .select({ assessmentId: assessmentMarks.assessmentId, count: sql`count(*)`.mapWith(Number) })
      .from(assessmentMarks)
      .where(scoped(assessmentMarks, tenantId, inArray(assessmentMarks.assessmentId, itemIds)))
      .groupBy(assessmentMarks.assessmentId);
    return new Map(rows.map(r => [r.assessmentId, r.count]));
  },

  marksFor: (tenantId, itemIds, { dbc = db } = {}) =>
    itemIds.length
      ? dbc.select().from(assessmentMarks).where(scoped(assessmentMarks, tenantId, inArray(assessmentMarks.assessmentId, itemIds)))
      : [],

  /* Graded homework marks of the items' homework */
  gradedSubmissions: (tenantId, homeworkIds) =>
    homeworkIds.length
      ? db
          .select({
            homeworkId: homeworkSubmissions.homeworkId,
            studentId: homeworkSubmissions.studentId,
            marksAwarded: homeworkSubmissions.marksAwarded
          })
          .from(homeworkSubmissions)
          .where(
            scoped(
              homeworkSubmissions,
              tenantId,
              inArray(homeworkSubmissions.homeworkId, homeworkIds),
              eq(homeworkSubmissions.status, "GRADED"),
              isNotNull(homeworkSubmissions.marksAwarded)
            )
          )
      : [],

  upsertMarks: (tenantId, rows, { dbc = db } = {}) =>
    dbc
      .insert(assessmentMarks)
      .values(rows.map(row => ({ ...row, tenantId, isActive: true })))
      .onConflictDoUpdate({
        target: [assessmentMarks.assessmentId, assessmentMarks.studentId],
        set: {
          status: sql`excluded.status`,
          marksObtained: sql`excluded.marks_obtained`,
          remarks: sql`excluded.remarks`,
          recordedBy: sql`excluded.recorded_by`,
          isActive: true,
          updatedAt: new Date()
        }
      })
      .returning({ id: assessmentMarks.id, created: sql`(xmax = 0)`.mapWith(Boolean) }),

  clearMarks: (tenantId, itemId, studentIds, { dbc = db } = {}) =>
    studentIds.length
      ? marksBase.softDeleteWhere(
          tenantId,
          [eq(assessmentMarks.assessmentId, itemId), inArray(assessmentMarks.studentId, studentIds)],
          { dbc }
        )
      : [],

  removeMarks: (tenantId, itemId, { dbc = db } = {}) =>
    marksBase.softDeleteWhere(tenantId, [eq(assessmentMarks.assessmentId, itemId)], { dbc }),

  highestMark: async (tenantId, itemId) => {
    const [row] = await db
      .select({ highest: sql`max(${assessmentMarks.marksObtained})`.mapWith(Number) })
      .from(assessmentMarks)
      .where(scoped(assessmentMarks, tenantId, eq(assessmentMarks.assessmentId, itemId)));
    return row?.highest ?? null;
  }
};
