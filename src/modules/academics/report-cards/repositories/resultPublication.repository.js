import { desc, eq, inArray, isNull, max, or } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { resultPublications } from "../models/resultPublication.schema.js";

const sourceColumn = kind => (kind === "EXAM" ? resultPublications.examId : resultPublications.schemeId);

const base = createRepository({
  table: resultPublications,
  queryKey: "resultPublications",
  orderBy: desc(resultPublications.version),
  /* Read only through manifestOf */
  hiddenColumns: ["snapshotSeals"]
});

const isCurrent = [isNull(resultPublications.supersededAt), isNull(resultPublications.withdrawnAt)];

export const resultPublicationRepository = {
  ...base,

  sourceCondition: (kind, sourceId) => eq(sourceColumn(kind), sourceId),

  /* The seal of every student's snapshot: { studentId: seal } */
  setManifest: (tenantId, publicationId, seals, { dbc }) =>
    dbc
      .update(resultPublications)
      .set({ snapshotSeals: seals })
      .where(scoped(resultPublications, tenantId, eq(resultPublications.id, publicationId))),

  manifestOf: async (tenantId, publicationId) => {
    const [row] = await db
      .select({ seals: resultPublications.snapshotSeals })
      .from(resultPublications)
      .where(scoped(resultPublications, tenantId, eq(resultPublications.id, publicationId)));
    return row?.seals ?? null;
  },

  /* Manifests and visibility of several publications: Map(publicationId -> { seals, supersededAt, withdrawnAt }) */
  manifestsOf: async (tenantId, publicationIds) => {
    if (!publicationIds.length) return new Map();
    const rows = await db
      .select({
        id: resultPublications.id,
        seals: resultPublications.snapshotSeals,
        supersededAt: resultPublications.supersededAt,
        withdrawnAt: resultPublications.withdrawnAt
      })
      .from(resultPublications)
      .where(scoped(resultPublications, tenantId, inArray(resultPublications.id, publicationIds)));
    return new Map(rows.map(row => [row.id, row]));
  },

  /* Highest version so far (0 when never published); call with the source row locked */
  latestVersion: async (tenantId, kind, sourceId, { dbc = db } = {}) => {
    const [row] = await dbc
      .select({ version: max(resultPublications.version) })
      .from(resultPublications)
      .where(scoped(resultPublications, tenantId, eq(sourceColumn(kind), sourceId)));
    return row?.version ?? 0;
  },

  /* The visible version of a source, or null */
  findCurrent: (tenantId, kind, sourceId, { dbc = db } = {}) =>
    base.findOne(tenantId, [eq(sourceColumn(kind), sourceId), ...isCurrent], { dbc }),

  /* Visible versions of a year, optionally of some exams or schemes (portal) */
  findCurrentInYear: (tenantId, academicYearId, { examId, schemeId } = {}) =>
    base.findMany(tenantId, {
      conditions: [
        eq(resultPublications.academicYearId, academicYearId),
        ...isCurrent,
        examId && eq(resultPublications.examId, examId),
        schemeId && eq(resultPublications.schemeId, schemeId)
      ].filter(Boolean)
    }),

  /* Visible versions of some exams and schemes, any year */
  findCurrentFor: (tenantId, { examIds = [], schemeIds = [] }) => {
    const sources = [
      examIds.length && inArray(resultPublications.examId, examIds),
      schemeIds.length && inArray(resultPublications.schemeId, schemeIds)
    ].filter(Boolean);
    return sources.length ? base.findMany(tenantId, { conditions: [...isCurrent, or(...sources)] }) : [];
  }
};
