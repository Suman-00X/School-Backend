import { z } from "../../../../common/validation/zod.js";

/* Password policy: 8–128 characters with at least one letter and one digit.
   Length beats complexity rules; the upper bound protects the hash function. */
export const password = () =>
  z
    .string()
    .min(8, "must be at least 8 characters")
    .max(128, "must be at most 128 characters")
    .refine(value => /[A-Za-z]/.test(value) && /\d/.test(value), "must contain at least one letter and one digit");

export const schoolCode = () => z.string().trim().min(2).max(20);
