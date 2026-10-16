import { and, eq, lte, ne, not } from "drizzle-orm";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { categoryService } from "../../categories/index.js";
import { COUNTABLE_UNITS } from "../../shared/constants/inventory.constants.js";
import { matchesText } from "../../shared/utils/search.util.js";
import { formatQuantity, isWhole, lineValue, toMilli } from "../../shared/utils/stockMath.util.js";
import { inventoryItems } from "../models/item.schema.js";
import { itemRepository } from "../repositories/item.repository.js";

const withCategory = { category: { columns: { id: true, name: true } } };

/* At or below the reorder level (discontinued items are not re-ordered) */
export const isLowStock = item => !item.discontinued && toMilli(item.stockOnHand) <= toMilli(item.reorderLevel);

/* The same rule in SQL */
const lowStockCondition = and(
  eq(inventoryItems.discontinued, false),
  lte(inventoryItems.stockOnHand, inventoryItems.reorderLevel)
);

/* What the API returns: the row plus derived stock facts */
const present = item =>
  item && {
    ...item,
    stockValue: lineValue(item.stockOnHand, item.averageUnitCost),
    isLowStock: isLowStock(item)
  };

const assertSkuFree = async (ctx, sku, exceptId) => {
  const taken = await itemRepository.findOne(ctx.tenantId, [
    eq(inventoryItems.sku, sku),
    exceptId && ne(inventoryItems.id, exceptId)
  ]);
  if (taken) throw conflict(`SKU ${sku} is already used by ${taken.name}`);
};

const assertCategory = async (ctx, categoryId) => {
  if (!(await categoryService.exists(ctx, categoryId))) {
    throw unprocessable("categoryId does not refer to an existing category");
  }
};

/* PCS, BOX, PACK, SET and REAM are counted in whole numbers */
const assertWholeReorderLevel = (unit, reorderLevel) => {
  if (COUNTABLE_UNITS.includes(unit) && !isWhole(reorderLevel)) {
    throw unprocessable(`reorderLevel must be a whole number of ${unit}`);
  }
};

const findOrFail = async (ctx, itemId) => {
  const item = await itemRepository.findById(ctx.tenantId, itemId);
  if (!item) throw notFound("Item");
  return item;
};

export const itemService = {
  list: async (ctx, { page, limit, q, categoryId, lowStock, discontinued }) => {
    const result = await itemRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withCategory,
      conditions: [
        matchesText(q, [inventoryItems.sku, inventoryItems.name]),
        categoryId && eq(inventoryItems.categoryId, categoryId),
        lowStock === true && lowStockCondition,
        lowStock === false && not(lowStockCondition),
        discontinued !== undefined && eq(inventoryItems.discontinued, discontinued)
      ].filter(Boolean)
    });
    return { ...result, rows: result.rows.map(present) };
  },

  getById: async (ctx, itemId) => {
    const item = await itemRepository.findById(ctx.tenantId, itemId, { with: withCategory });
    if (!item) throw notFound("Item");
    return present(item);
  },

  create: async (ctx, { stockOnHand: _stock, averageUnitCost: _cost, ...data }) => {
    assertWholeReorderLevel(data.unit, data.reorderLevel);
    await assertCategory(ctx, data.categoryId);
    await assertSkuFree(ctx, data.sku);
    const item = await itemRepository.create(ctx.tenantId, data);
    return itemService.getById(ctx, item.id);
  },

  /* Stock and cost never change here: only stock movements move them */
  update: async (ctx, itemId, { stockOnHand: _stock, averageUnitCost: _cost, ...changes }) => {
    const item = await findOrFail(ctx, itemId);
    const unit = changes.unit ?? item.unit;
    assertWholeReorderLevel(unit, changes.reorderLevel ?? item.reorderLevel);
    if (changes.unit && changes.unit !== item.unit && (await itemRepository.hasMovements(ctx.tenantId, itemId))) {
      throw unprocessable(`${item.name} already has stock movements in ${item.unit}; its unit can no longer change`);
    }
    if (changes.categoryId) await assertCategory(ctx, changes.categoryId);
    if (changes.sku) await assertSkuFree(ctx, changes.sku, itemId);
    await itemRepository.update(ctx.tenantId, itemId, changes);
    return itemService.getById(ctx, itemId);
  },

  /* Only an item with nothing in stock can be removed; its ledger is kept */
  remove: async (ctx, itemId) => {
    const item = await findOrFail(ctx, itemId);
    if (toMilli(item.stockOnHand) !== 0) {
      throw unprocessable(
        `${item.name} still has ${formatQuantity(item.stockOnHand, item.unit)} in stock. Issue or adjust it to zero first.`
      );
    }
    return itemRepository.softDelete(ctx.tenantId, itemId);
  },

  /* For the stock submodule: lock the item inside a transaction -> row or null */
  lockForUpdate: (ctx, itemId, options) => itemRepository.lockForUpdate(ctx.tenantId, itemId, options),

  /* For the stock submodule: write the new balance and cost of a locked item */
  setStock: (ctx, itemId, { stockOnHand, averageUnitCost }, { dbc }) =>
    itemRepository.update(ctx.tenantId, itemId, { stockOnHand, averageUnitCost }, { dbc }),

  /* For other submodules: an active item, or null */
  findById: (ctx, itemId) => itemRepository.findById(ctx.tenantId, itemId)
};
