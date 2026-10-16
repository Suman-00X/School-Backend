import { eq, gte, lte } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { publish } from "../../../../common/events/events.js";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { toMinor } from "../../../../common/money/money.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { accountService } from "../../../users/accounts/index.js";
import { isLowStock, itemService } from "../../items/index.js";
import { vendorService } from "../../vendors/index.js";
import {
  COUNTABLE_UNITS,
  INVENTORY_EVENTS,
  MAX_MONEY,
  MAX_QUANTITY
} from "../../shared/constants/inventory.constants.js";
import { nextMovementNumber } from "../../shared/utils/codes.util.js";
import {
  addQuantity,
  formatQuantity,
  isWhole,
  lineValue,
  toMilli,
  weightedAverage
} from "../../shared/utils/stockMath.util.js";
import { stockMovements } from "../models/stockMovement.schema.js";
import { stockMovementRepository } from "../repositories/stockMovement.repository.js";

const person = { columns: { id: true, firstName: true, lastName: true, role: true } };
const withDetails = {
  item: { columns: { id: true, sku: true, name: true, unit: true, stockOnHand: true, averageUnitCost: true } },
  vendor: { columns: { id: true, name: true } },
  issuedToUser: person,
  creator: person
};

/* The signed change, unit cost and new average cost of a movement on a locked item */
const plan = (item, movement) => {
  const { type, quantity, quantityChange, unitCost } = movement;
  const stock = formatQuantity(item.stockOnHand, item.unit);
  const amount = type === "ADJUSTMENT" ? quantityChange : quantity;

  if (COUNTABLE_UNITS.includes(item.unit) && !isWhole(amount)) {
    throw unprocessable(`${item.name} is counted in ${item.unit}: the quantity must be a whole number`);
  }

  switch (type) {
    case "RECEIPT":
      if (item.discontinued) throw unprocessable(`${item.name} is discontinued and cannot receive new stock`);
      return { change: quantity, unitCost, averageUnitCost: weightedAverage(item, quantity, unitCost) };

    case "ISSUE":
      if (toMilli(quantity) > toMilli(item.stockOnHand)) {
        throw unprocessable(
          toMilli(item.stockOnHand) === 0 ? `${item.name} is out of stock` : `Only ${stock} of ${item.name} in stock`
        );
      }
      return { change: -quantity, unitCost: item.averageUnitCost, averageUnitCost: item.averageUnitCost };

    case "RETURN":
      return { change: quantity, unitCost: item.averageUnitCost, averageUnitCost: item.averageUnitCost };

    case "ADJUSTMENT":
      if (toMilli(item.stockOnHand) + toMilli(quantityChange) < 0) {
        throw unprocessable(`The adjustment would take ${item.name} below zero: only ${stock} in stock`);
      }
      return { change: quantityChange, unitCost: item.averageUnitCost, averageUnitCost: item.averageUnitCost };

    default:
      throw unprocessable(`Unknown movement type ${type}`);
  }
};

const assertReferences = async (ctx, { vendorId, issuedToUserId }) => {
  if (vendorId && !(await vendorService.findById(ctx, vendorId))) {
    throw unprocessable("vendorId does not refer to an existing vendor");
  }
  if (issuedToUserId && !(await accountService.findManyByIds(ctx, [issuedToUserId])).length) {
    throw unprocessable("issuedToUserId does not refer to an active user");
  }
};

const dateConditions = ({ from, to }) => [
  from && gte(stockMovements.movementDate, from),
  to && lte(stockMovements.movementDate, to)
];

export const stockService = {
  /* Apply one movement: lock the item, check the rule for its type, append to the
     ledger and write the new balance, all in one transaction */
  record: async (ctx, itemId, input) => {
    const today = await tenantToday(ctx.tenantId);
    const movementDate = input.movementDate ?? today;
    if (movementDate > today) throw unprocessable(`movementDate cannot be in the future (today is ${today})`);
    await assertReferences(ctx, input);

    const { movement, before, after } = await transaction(async tx => {
      const item = await itemService.lockForUpdate(ctx, itemId, { dbc: tx });
      if (!item) throw notFound("Item");

      const { change, unitCost, averageUnitCost } = plan(item, input);
      const balanceAfter = addQuantity(item.stockOnHand, change);
      const totalValue = lineValue(change, unitCost);
      /* Column limits: numeric(12,3) stock, numeric(12,2) value */
      if (balanceAfter > MAX_QUANTITY) {
        throw unprocessable(`${item.name} cannot hold more than ${MAX_QUANTITY} ${item.unit}`);
      }
      if (toMinor(totalValue) > toMinor(MAX_MONEY)) {
        throw unprocessable(`A single movement cannot exceed ${MAX_MONEY} in value`);
      }

      const { seq, movementNumber } = await nextMovementNumber(ctx.tenantId, { dbc: tx });
      const created = await stockMovementRepository.create(
        ctx.tenantId,
        {
          seq,
          movementNumber,
          itemId,
          type: input.type,
          quantityChange: change,
          balanceAfter,
          unitCost,
          totalValue,
          averageCostAfter: averageUnitCost,
          vendorId: input.vendorId,
          issuedToUserId: input.issuedToUserId,
          issuedTo: input.issuedTo,
          reason: input.reason,
          reference: input.reference,
          movementDate,
          createdBy: ctx.userId
        },
        { dbc: tx }
      );
      const updated = await itemService.setStock(
        ctx,
        itemId,
        { stockOnHand: balanceAfter, averageUnitCost },
        { dbc: tx }
      );
      return { movement: created, before: item, after: updated };
    });

    /* Crossed the reorder level on the way down: tell whoever restocks (after commit) */
    if (toMilli(movement.quantityChange) < 0 && !isLowStock(before) && isLowStock(after)) {
      await publish(INVENTORY_EVENTS.LOW_STOCK, {
        tenantId: ctx.tenantId,
        itemId,
        movementId: movement.id,
        stockOnHand: after.stockOnHand,
        reorderLevel: after.reorderLevel
      });
    }
    return stockService.getById(ctx, movement.id);
  },

  /* One item's ledger, newest first, each row with the balance after it */
  itemLedger: async (ctx, itemId, { page, limit, type, from, to }) => {
    if (!(await itemService.findById(ctx, itemId))) throw notFound("Item");
    return stockMovementRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withDetails,
      conditions: [
        eq(stockMovements.itemId, itemId),
        type && eq(stockMovements.type, type),
        ...dateConditions({ from, to })
      ].filter(Boolean)
    });
  },

  /* Movements across all items */
  list: (ctx, { page, limit, type, itemId, vendorId, issuedToUserId, from, to }) =>
    stockMovementRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withDetails,
      conditions: [
        type && eq(stockMovements.type, type),
        itemId && eq(stockMovements.itemId, itemId),
        vendorId && eq(stockMovements.vendorId, vendorId),
        issuedToUserId && eq(stockMovements.issuedToUserId, issuedToUserId),
        ...dateConditions({ from, to })
      ].filter(Boolean)
    }),

  getById: async (ctx, movementId) => {
    const movement = await stockMovementRepository.findById(ctx.tenantId, movementId, { with: withDetails });
    if (!movement) throw notFound("Stock movement");
    return movement;
  }
};
