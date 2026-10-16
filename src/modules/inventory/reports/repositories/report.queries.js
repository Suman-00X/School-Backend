import { sql } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";

/* Read model for inventory reports (tenant- and is_active-filtered; numeric sums are exact in SQL) */
const rows = async query => (await db.execute(query)).rows;

export const reportQueries = {
  /* Items at or below their reorder level, with the last purchase to help re-order */
  lowStock: tenantId =>
    rows(sql`
      SELECT i.id, i.sku, i.name, c.name AS "categoryName", i.unit, i.location,
             i.stock_on_hand::float8 AS "stockOnHand", i.reorder_level::float8 AS "reorderLevel",
             (i.reorder_level - i.stock_on_hand)::float8 AS shortfall,
             i.average_unit_cost::float8 AS "averageUnitCost",
             last_receipt.vendor_name AS "lastVendor", last_receipt.unit_cost::float8 AS "lastUnitCost",
             last_receipt.movement_date::text AS "lastReceivedOn"
      FROM inventory_items i
      JOIN inventory_categories c ON c.id = i.category_id
      LEFT JOIN LATERAL (
        SELECT v.name AS vendor_name, m.unit_cost, m.movement_date
        FROM stock_movements m LEFT JOIN inventory_vendors v ON v.id = m.vendor_id
        WHERE m.item_id = i.id AND m.type = 'RECEIPT' AND m.is_active
        ORDER BY m.seq DESC LIMIT 1
      ) last_receipt ON true
      WHERE i.tenant_id = ${tenantId} AND i.is_active AND NOT i.discontinued
        AND i.stock_on_hand <= i.reorder_level
      ORDER BY (i.reorder_level - i.stock_on_hand) DESC, i.name`),

  /* Stock value (stockOnHand x averageUnitCost, rounded per item) by category */
  valuationByCategory: tenantId =>
    rows(sql`
      SELECT c.id AS "categoryId", c.name AS "categoryName",
             count(i.id)::int AS "itemCount",
             count(i.id) FILTER (WHERE i.stock_on_hand > 0)::int AS "itemsInStock",
             coalesce(sum(round(i.stock_on_hand * i.average_unit_cost, 2)), 0)::float8 AS "stockValue"
      FROM inventory_categories c
      JOIN inventory_items i ON i.category_id = c.id AND i.is_active
      WHERE c.tenant_id = ${tenantId} AND c.is_active
      GROUP BY c.id, c.name
      ORDER BY c.name`),

  /* Issues and returns per item between two dates (inclusive).
     Items removed since keep their history, so items are not filtered on is_active. */
  consumption: (tenantId, from, to) =>
    rows(sql`
      SELECT i.id, i.sku, i.name, c.name AS "categoryName", i.unit,
             coalesce(sum(-m.quantity_change) FILTER (WHERE m.type = 'ISSUE'), 0)::float8 AS "issuedQuantity",
             coalesce(sum(m.total_value) FILTER (WHERE m.type = 'ISSUE'), 0)::float8 AS "issuedValue",
             coalesce(sum(m.quantity_change) FILTER (WHERE m.type = 'RETURN'), 0)::float8 AS "returnedQuantity",
             coalesce(sum(m.total_value) FILTER (WHERE m.type = 'RETURN'), 0)::float8 AS "returnedValue",
             (-sum(m.quantity_change))::float8 AS "netQuantity",
             coalesce(sum(CASE WHEN m.type = 'ISSUE' THEN m.total_value ELSE -m.total_value END), 0)::float8
               AS "netValue"
      FROM stock_movements m
      JOIN inventory_items i ON i.id = m.item_id
      JOIN inventory_categories c ON c.id = i.category_id
      WHERE m.tenant_id = ${tenantId} AND m.is_active AND m.type IN ('ISSUE', 'RETURN')
        AND m.movement_date BETWEEN ${from}::date AND ${to}::date
      GROUP BY i.id, i.sku, i.name, c.name, i.unit
      ORDER BY "netValue" DESC, i.name`)
};
