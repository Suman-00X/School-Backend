import { z } from "../../../../common/validation/zod.js";
import { isValidIsbn, normalizeIsbn } from "./isbn.util.js";

/* Validation building blocks shared by the library's validators */

/* An amount with at most 2 decimals */
export const amount = ({ min = 0, max = 1_000_000 } = {}) => z.number().min(min).max(max).multipleOf(0.01);

export const positiveAmount = (max = 1_000_000) => z.number().positive().max(max).multipleOf(0.01);

/* "978-0-306-40615-7" -> "9780306406157", checksum verified */
export const isbn = () =>
  z.string().trim().transform(normalizeIsbn).refine(isValidIsbn, { message: "must be a valid ISBN-10 or ISBN-13" });

/* "acc-000001" -> "ACC-000001" */
export const accessionNumber = () =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^ACC-\d{6,}$/, "must look like ACC-000001");

/* ?flag=true|false */
export const booleanQuery = () =>
  z
    .enum(["true", "false"])
    .transform(v => v === "true")
    .optional();
