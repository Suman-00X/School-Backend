import { sql } from "drizzle-orm";
import { integer, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { CLASS_LEVEL_KEYS } from "../../shared/constants/academic.constants.js";

export const classLevel = pgEnum("class_level", CLASS_LEVEL_KEYS);

/* Grade levels (Nursery, LKG, UKG, Class 1 … Class 12), shared across academic years.
   className and classOrder are derived from the level. Classes created before levels
   existed whose names matched none keep a null level and their own name and order. */
export const classes = pgTable(
  "classes",
  {
    ...baseColumns(),
    level: classLevel("level"),
    className: text("class_name").notNull(),
    classOrder: integer("class_order").notNull(),
    description: text("description")
  },
  t => [
    uniqueIndex("classes_tenant_level_uq")
      .on(t.tenantId, t.level)
      .where(sql`${t.level} IS NOT NULL`),
    /* Case-insensitive, for the classes without a level */
    uniqueIndex("classes_tenant_name_uq").on(t.tenantId, sql`lower(${t.className})`)
  ]
);
