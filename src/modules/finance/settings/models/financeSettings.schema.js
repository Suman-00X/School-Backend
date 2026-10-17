import { sql } from "drizzle-orm";
import { check, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { money } from "../../shared/models/money.columns.js";

/* A school's finance settings (one row, created on first change) */
export const financeSettings = pgTable(
  "finance_settings",
  {
    ...baseColumns(),
    /* Refunds by accountants up to this amount (per payment, or per student's credit) need
       no administrator's approval. 0: every refund needs one. Administrators' own refunds
       always need another administrator. */
    refundApprovalLimit: money("refund_approval_limit").notNull().default(0),
    updatedBy: uuid("updated_by").references(() => users.id)
  },
  t => [
    uniqueIndex("finance_settings_tenant_uq").on(t.tenantId).where(activeRows(t)),
    check("finance_settings_refund_limit_chk", sql`${t.refundApprovalLimit} >= 0`)
  ]
);
