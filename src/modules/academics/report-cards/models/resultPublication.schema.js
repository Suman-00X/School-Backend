import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { assessmentSchemes } from "../../assessment-schemes/models/assessmentScheme.schema.js";
import { exams } from "../../exams/models/exam.schema.js";
import { PUBLICATION_KINDS } from "../../shared/constants/academic.constants.js";

export const publicationKind = pgEnum("publication_kind", PUBLICATION_KINDS);

/* One version of an exam's (or assessment scheme's) published results. Each version has a
   frozen report snapshot per student in MongoDB (report_snapshots). Re-publishing adds a
   version; the one before is superseded. Withdrawing hides the current version and keeps it. */
export const resultPublications = pgTable(
  "result_publications",
  {
    ...baseColumns(),
    kind: publicationKind("kind").notNull(),
    examId: uuid("exam_id").references(() => exams.id),
    schemeId: uuid("scheme_id").references(() => assessmentSchemes.id),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    version: integer("version").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
    publishedBy: uuid("published_by").references(() => users.id),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    withdrawnBy: uuid("withdrawn_by").references(() => users.id),
    reportCount: integer("report_count").notNull().default(0),
    /* Report cards that differ from the previous version (null for the first) */
    changedCount: integer("changed_count")
  },
  t => [
    uniqueIndex("result_publications_exam_version_uq")
      .on(t.examId, t.version)
      .where(sql`${t.examId} IS NOT NULL`),
    uniqueIndex("result_publications_scheme_version_uq")
      .on(t.schemeId, t.version)
      .where(sql`${t.schemeId} IS NOT NULL`),
    /* At most one current (visible) version per exam or scheme */
    uniqueIndex("result_publications_exam_current_uq")
      .on(t.examId)
      .where(sql`${t.examId} IS NOT NULL AND ${t.supersededAt} IS NULL AND ${t.withdrawnAt} IS NULL`),
    uniqueIndex("result_publications_scheme_current_uq")
      .on(t.schemeId)
      .where(sql`${t.schemeId} IS NOT NULL AND ${t.supersededAt} IS NULL AND ${t.withdrawnAt} IS NULL`),
    index("result_publications_year_idx").on(t.tenantId, t.academicYearId),
    check(
      "result_publications_source_chk",
      sql`(${t.kind} = 'EXAM' AND ${t.examId} IS NOT NULL AND ${t.schemeId} IS NULL)
        OR (${t.kind} = 'SCHEME' AND ${t.schemeId} IS NOT NULL AND ${t.examId} IS NULL)`
    ),
    check("result_publications_version_chk", sql`${t.version} > 0`),
    check("result_publications_state_chk", sql`${t.supersededAt} IS NULL OR ${t.withdrawnAt} IS NULL`)
  ]
);

export const resultPublicationsRelations = relations(resultPublications, ({ one }) => ({
  exam: one(exams, { fields: [resultPublications.examId], references: [exams.id] }),
  scheme: one(assessmentSchemes, { fields: [resultPublications.schemeId], references: [assessmentSchemes.id] }),
  publisher: one(users, { fields: [resultPublications.publishedBy], references: [users.id] })
}));
