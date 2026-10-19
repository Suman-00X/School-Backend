import { sql } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { SUBJECT_TYPES } from "../../shared/constants/academic.constants.js";

export const subjectType = pgEnum("subject_type", SUBJECT_TYPES);

export const subjects = pgTable(
  "subjects",
  {
    ...baseColumns(),
    subjectName: text("subject_name").notNull(),
    subjectCode: text("subject_code").notNull(),
    subjectType: subjectType("subject_type"),
    isOptional: boolean("is_optional").notNull().default(false),
    description: text("description")
  },
  t => [
    uniqueIndex("subjects_tenant_code_uq").on(t.tenantId, t.subjectCode),
    uniqueIndex("subjects_tenant_name_uq").on(t.tenantId, sql`lower(${t.subjectName})`)
  ]
);
