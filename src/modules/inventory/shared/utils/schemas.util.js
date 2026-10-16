import { z } from "../../../../common/validation/zod.js";
import { MAX_MONEY, MAX_QUANTITY } from "../constants/inventory.constants.js";

/* Zod building blocks for inventory validators */

/* Up to 3 decimals: 12, 0.25, 1.5 */
export const quantityValue = () => z.number().min(-MAX_QUANTITY).max(MAX_QUANTITY).multipleOf(0.001);

export const positiveQuantity = () => quantityValue().positive();

/* Up to 2 decimals, never negative */
export const moneyValue = () => z.number().min(0).max(MAX_MONEY).multipleOf(0.01);

/* ?q= free-text search */
export const searchText = () => z.string().trim().min(1).max(100).optional();

/* ?flag=true|false -> boolean */
export const booleanQuery = () =>
  z
    .enum(["true", "false"])
    .transform(v => v === "true")
    .optional();

/* Fields maintained by the system: rejected with a clear message instead of silently ignored */
export const readOnly = reason =>
  z
    .any()
    .refine(() => false, reason)
    .optional();
