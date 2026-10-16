import { z } from "../../../../common/validation/zod.js";

/* Schema building blocks shared by the finance submodules */

/* Money in the school's currency: positive, at most 2 decimals */
export const amount = (max = 100_000_000) => z.number().positive().max(max).multipleOf(0.01);

/* 0 < percent <= 100, at most 2 decimals */
export const percent = () => z.number().positive().max(100).multipleOf(0.01);
