import { relations } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { exams } from "../../exams/models/exam.schema.js";
import { SCHEDULING_KINDS, SCHEDULING_ORIGINS, SCHEDULING_STATUSES } from "../constants/scheduling.constants.js";

export const schedulingKind = pgEnum("scheduling_kind", SCHEDULING_KINDS);
export const schedulingStatus = pgEnum("scheduling_status", SCHEDULING_STATUSES);
export const schedulingOrigin = pgEnum("scheduling_origin", SCHEDULING_ORIGINS);

/* One generated timetable: a class timetable for some sections of a year, or an exam's
   timetable. It is a draft until someone applies it; nothing else changes before that.
   `request` is what was asked (scope and rules), `result` what the solver proposed,
   `report` how good it is (unplaced classes, problems, score). `fingerprint` hashes the
   inputs the solver saw: applying refuses when they have changed since. */
export const schedulingRuns = pgTable(
  "scheduling_runs",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    kind: schedulingKind("kind").notNull(),
    status: schedulingStatus("status").notNull().default("DRAFT"),
    origin: schedulingOrigin("origin").notNull().default("API"),
    examId: uuid("exam_id").references(() => exams.id),
    seed: integer("seed").notNull(),
    request: jsonb("request").notNull(),
    result: jsonb("result").notNull(),
    report: jsonb("report").notNull(),
    fingerprint: jsonb("fingerprint").notNull(),
    /* "36 sections · 1440 of 1440 periods placed" */
    summary: text("summary").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedBy: uuid("applied_by").references(() => users.id),
    discardedAt: timestamp("discarded_at", { withTimezone: true })
  },
  t => [
    index("scheduling_runs_year_kind_idx").on(t.academicYearId, t.kind, t.createdAt),
    index("scheduling_runs_exam_idx").on(t.examId)
  ]
);

export const schedulingRunsRelations = relations(schedulingRuns, ({ one }) => ({
  exam: one(exams, { fields: [schedulingRuns.examId], references: [exams.id] })
}));
