import { integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";

/* Grade levels (Class 1, Class 2...), shared across academic years */
export const classes = pgTable(
  "classes",
  {
    ...baseColumns(),
    className: text("class_name").notNull(),
    classOrder: integer("class_order").notNull(),
    description: text("description")
  },
  t => [
    uniqueIndex("classes_tenant_name_uq").on(t.tenantId, t.className),
    uniqueIndex("classes_tenant_order_uq").on(t.tenantId, t.classOrder)
  ]
);
