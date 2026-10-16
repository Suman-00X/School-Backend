import { and, sql } from "drizzle-orm";
import { index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";

/* Suppliers the school buys stock from */
export const inventoryVendors = pgTable(
  "inventory_vendors",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    contactPerson: text("contact_person"),
    phone: text("phone"),
    email: text("email"),
    /* GSTIN in India (validated when the school's country is IN), VAT/tax number elsewhere; upper-case */
    taxId: text("tax_id"),
    address: text("address"),
    notes: text("notes")
  },
  t => [
    /* One vendor per tax registration */
    uniqueIndex("inventory_vendors_tenant_tax_id_uq")
      .on(t.tenantId, t.taxId)
      .where(and(activeRows(t), sql`${t.taxId} IS NOT NULL`)),
    index("inventory_vendors_tenant_name_idx").on(t.tenantId, t.name)
  ]
);
