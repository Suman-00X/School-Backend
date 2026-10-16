import { sum } from "../../../../common/money/money.js";
import { getTenant, tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { reportQueries } from "../repositories/report.queries.js";

/* Each report returns { data, table }: data for JSON, table ({ rows, columns, fileName, title }) for sendTable() */
export const reportService = {
  lowStock: async ctx => {
    const today = await tenantToday(ctx.tenantId);
    const items = await reportQueries.lowStock(ctx.tenantId);
    return {
      data: { asOf: today, items },
      table: {
        fileName: `low-stock-${today}`,
        title: `Items at or below reorder level as of ${today}`,
        rows: items,
        columns: [
          { key: "sku", header: "SKU", width: 16 },
          { key: "name", header: "Item", width: 28 },
          { key: "categoryName", header: "Category", width: 18 },
          { key: "unit", header: "Unit" },
          { key: "stockOnHand", header: "In stock" },
          { key: "reorderLevel", header: "Reorder level", width: 14 },
          { key: "shortfall", header: "Shortfall" },
          { key: "lastVendor", header: "Last vendor", width: 24 },
          { key: "lastUnitCost", header: "Last unit cost", width: 14 },
          { key: "location", header: "Location", width: 16 }
        ]
      }
    };
  },

  valuation: async ctx => {
    const [today, tenant, categories] = await Promise.all([
      tenantToday(ctx.tenantId),
      getTenant(ctx.tenantId),
      reportQueries.valuationByCategory(ctx.tenantId)
    ]);
    const totalValue = sum(categories.map(c => c.stockValue));
    const itemCount = categories.reduce((total, c) => total + c.itemCount, 0);
    return {
      data: { asOf: today, currency: tenant?.currency ?? "INR", categories, itemCount, totalValue },
      table: {
        fileName: `stock-valuation-${today}`,
        title: `Stock valuation as of ${today}`,
        rows: [...categories, { categoryName: "Total", itemCount, stockValue: totalValue }],
        columns: [
          { key: "categoryName", header: "Category", width: 24 },
          { key: "itemCount", header: "Items" },
          { key: "itemsInStock", header: "Items in stock", width: 14 },
          { key: "stockValue", header: "Stock value", width: 16 }
        ]
      }
    };
  },

  consumption: async (ctx, { from, to }) => {
    const items = await reportQueries.consumption(ctx.tenantId, from, to);
    const totals = {
      issuedValue: sum(items.map(i => i.issuedValue)),
      returnedValue: sum(items.map(i => i.returnedValue)),
      netValue: sum(items.map(i => i.netValue))
    };
    return {
      data: { from, to, items, totals },
      table: {
        fileName: `consumption-${from}-to-${to}`,
        title: `Stock consumption ${from} to ${to}`,
        rows: items,
        columns: [
          { key: "sku", header: "SKU", width: 16 },
          { key: "name", header: "Item", width: 28 },
          { key: "categoryName", header: "Category", width: 18 },
          { key: "unit", header: "Unit" },
          { key: "issuedQuantity", header: "Issued" },
          { key: "issuedValue", header: "Issued value", width: 14 },
          { key: "returnedQuantity", header: "Returned" },
          { key: "returnedValue", header: "Returned value", width: 14 },
          { key: "netQuantity", header: "Net consumed", width: 14 },
          { key: "netValue", header: "Net value", width: 14 }
        ]
      }
    };
  }
};
