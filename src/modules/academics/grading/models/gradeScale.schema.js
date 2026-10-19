import { relations, sql } from "drizzle-orm";
import { boolean, check, integer, numeric, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";

const percent = name => numeric(name, { precision: 5, scale: 2, mode: "number" });

/* A grading scheme (CBSE 9-point, letter grades, …). One default per school. */
export const gradeScales = pgTable(
  "grade_scales",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    description: text("description"),
    isDefault: boolean("is_default").notNull().default(false)
  },
  t => [
    uniqueIndex("grade_scales_tenant_name_uq")
      .on(t.tenantId, sql`lower(${t.name})`)
      .where(sql`${t.isActive} = true`),
    uniqueIndex("grade_scales_one_default_uq")
      .on(t.tenantId)
      .where(sql`${t.isDefault} = true AND ${t.isActive} = true`)
  ]
);

/* A band of a scale: [minPercent, maxPercent) -> grade (the top band includes 100) */
export const gradeBands = pgTable(
  "grade_bands",
  {
    ...baseColumns(),
    gradeScaleId: uuid("grade_scale_id")
      .notNull()
      .references(() => gradeScales.id),
    grade: text("grade").notNull(),
    minPercent: percent("min_percent").notNull(),
    maxPercent: percent("max_percent").notNull(),
    gradePoint: numeric("grade_point", { precision: 4, scale: 2, mode: "number" }),
    remark: text("remark"),
    isPassing: boolean("is_passing").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0)
  },
  t => [
    uniqueIndex("grade_bands_scale_grade_uq").on(t.gradeScaleId, sql`lower(${t.grade})`),
    check(
      "grade_bands_range_chk",
      sql`${t.minPercent} >= 0 AND ${t.maxPercent} <= 100 AND ${t.maxPercent} > ${t.minPercent}`
    )
  ]
);

export const gradeScalesRelations = relations(gradeScales, ({ many }) => ({ bands: many(gradeBands) }));
export const gradeBandsRelations = relations(gradeBands, ({ one }) => ({
  scale: one(gradeScales, { fields: [gradeBands.gradeScaleId], references: [gradeScales.id] })
}));
