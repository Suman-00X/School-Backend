import { relations, sql } from "drizzle-orm";
import { check, date, index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { inventoryItems } from "../../items/models/item.schema.js";
import { inventoryVendors } from "../../vendors/models/vendor.schema.js";
import { MOVEMENT_TYPES } from "../../shared/constants/inventory.constants.js";
import { money, quantity } from "../../shared/models/inventory.columns.js";

export const stockMovementType = pgEnum("stock_movement_type", MOVEMENT_TYPES);

/* The stock ledger: one immutable row per change to an item's stock, written in the
   same transaction (and under the same row lock) as the item's new balance.
   Rows are never updated or deleted; a mistake is corrected by a reverse movement. */
export const stockMovements = pgTable(
  "stock_movements",
  {
    ...baseColumns(),
    /* Per-school sequence behind movementNumber; orders the ledger */
    seq: integer("seq").notNull(),
    movementNumber: text("movement_number").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => inventoryItems.id),
    type: stockMovementType("type").notNull(),
    /* Signed: + for RECEIPT/RETURN, - for ISSUE, either for ADJUSTMENT */
    quantityChange: quantity("quantity_change").notNull(),
    balanceAfter: quantity("balance_after").notNull(),
    /* Purchase price for a RECEIPT, the average cost at the time otherwise */
    unitCost: money("unit_cost").notNull(),
    /* |quantityChange| x unitCost */
    totalValue: money("total_value").notNull(),
    averageCostAfter: money("average_cost_after").notNull(),
    vendorId: uuid("vendor_id").references(() => inventoryVendors.id),
    issuedToUserId: uuid("issued_to_user_id").references(() => users.id),
    /* Free text: "Science lab", "Class 5-B" */
    issuedTo: text("issued_to"),
    reason: text("reason"),
    /* Bill / challan / requisition number */
    reference: text("reference"),
    movementDate: date("movement_date").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id)
  },
  t => [
    uniqueIndex("stock_movements_tenant_number_uq").on(t.tenantId, t.movementNumber),
    index("stock_movements_item_idx").on(t.itemId, t.seq),
    index("stock_movements_date_idx").on(t.tenantId, t.type, t.movementDate),
    index("stock_movements_vendor_idx").on(t.vendorId),
    check(
      "stock_movements_direction_chk",
      sql`(${t.type} IN ('RECEIPT', 'RETURN') AND ${t.quantityChange} > 0)
        OR (${t.type} = 'ISSUE' AND ${t.quantityChange} < 0)
        OR (${t.type} = 'ADJUSTMENT' AND ${t.quantityChange} <> 0)`
    ),
    check("stock_movements_balance_chk", sql`${t.balanceAfter} >= 0`),
    check("stock_movements_value_chk", sql`${t.unitCost} >= 0 AND ${t.totalValue} >= 0 AND ${t.averageCostAfter} >= 0`),
    check("stock_movements_vendor_chk", sql`${t.vendorId} IS NULL OR ${t.type} = 'RECEIPT'`)
  ]
);

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  item: one(inventoryItems, { fields: [stockMovements.itemId], references: [inventoryItems.id] }),
  vendor: one(inventoryVendors, { fields: [stockMovements.vendorId], references: [inventoryVendors.id] }),
  issuedToUser: one(users, { fields: [stockMovements.issuedToUserId], references: [users.id] }),
  creator: one(users, { fields: [stockMovements.createdBy], references: [users.id] })
}));
