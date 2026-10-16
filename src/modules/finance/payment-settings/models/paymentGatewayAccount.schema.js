import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";

/* A school's own gateway keys (BYOK, D-20). The key secret and the webhook secret
   are encrypted at rest (AES-256-GCM) and never returned; reads show them masked. */
export const paymentGatewayAccounts = pgTable(
  "payment_gateway_accounts",
  {
    ...baseColumns(),
    provider: text("provider").notNull().default("razorpay"),
    keyId: text("key_id").notNull(),
    keySecret: text("key_secret").notNull(),
    webhookSecret: text("webhook_secret").notNull(),
    configuredBy: uuid("configured_by").references(() => users.id),
    /* Last successful connection test */
    verifiedAt: timestamp("verified_at", { withTimezone: true })
  },
  t => [
    uniqueIndex("payment_gateway_accounts_tenant_uq").on(t.tenantId).where(activeRows(t)),
    check("payment_gateway_accounts_provider_chk", sql`${t.provider} IN ('razorpay')`)
  ]
);
