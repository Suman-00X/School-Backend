import { fromMinor, toMinor } from "../../../../common/money/money.js";

/* Stock arithmetic in integer thousandths (quantities) and minor units (money),
   with BigInt for products, so averages and values are exact to the paisa. */

export const toMilli = quantity => Math.round(Number(quantity ?? 0) * 1000);

export const fromMilli = milli => Math.round(milli) / 1000;

/* round(a * b / c), half-up, for non-negative integers */
const mulDiv = (a, b, c) => {
  const numerator = BigInt(a) * BigInt(b);
  const divisor = BigInt(c);
  return Number((2n * numerator + divisor) / (2n * divisor));
};

/* quantity x unit cost, rounded to 2 decimals: lineValue(2.5, 10.01) -> 25.03 */
export const lineValue = (quantity, unitCost) =>
  fromMinor(mulDiv(Math.abs(toMilli(quantity)), toMinor(unitCost), 1000));

/* Weighted average cost after receiving `quantity` at `unitCost` on top of the current stock:
   (stock x average + quantity x unitCost) / (stock + quantity), rounded half-up once */
export const weightedAverage = ({ stockOnHand, averageUnitCost }, quantity, unitCost) => {
  const stockMilli = toMilli(stockOnHand);
  const receivedMilli = toMilli(quantity);
  if (stockMilli <= 0) return fromMinor(toMinor(unitCost));
  const value =
    BigInt(stockMilli) * BigInt(toMinor(averageUnitCost)) + BigInt(receivedMilli) * BigInt(toMinor(unitCost));
  return fromMinor(mulDiv(value, 1, stockMilli + receivedMilli));
};

/* a + b for quantities (b may be negative) */
export const addQuantity = (a, b) => fromMilli(toMilli(a) + toMilli(b));

export const isWhole = quantity => toMilli(quantity) % 1000 === 0;

/* "3 PCS", "2.5 KG" */
export const formatQuantity = (quantity, unit) => `${Number(quantity)} ${unit}`;
