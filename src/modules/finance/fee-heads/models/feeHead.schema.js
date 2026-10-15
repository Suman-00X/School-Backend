import { sql } from "drizzle-orm";
import { pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";

/* What a fee is for: Tuition, Transport, Exam, Library… */
export const feeHeads = pgTable(
  "fee_heads",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    description: text("description")
  },
  t => [
    uniqueIndex("fee_heads_tenant_code_uq")
      .on(t.tenantId, t.code)
      .where(sql`${t.isActive} = true`),
    uniqueIndex("fee_heads_tenant_name_uq")
      .on(t.tenantId, t.name)
      .where(sql`${t.isActive} = true`)
  ]
);
