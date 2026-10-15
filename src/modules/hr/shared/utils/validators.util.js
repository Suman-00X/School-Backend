import { z } from "../../../../common/validation/zod.js";
import { date } from "../../../../common/validation/schemas.js";
import { daysBetween } from "../../../../common/utils/date.util.js";

/* Validator building blocks shared by the hr submodules */

/* "YYYY-MM" */
export const month = () => z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "must be a month (YYYY-MM)");

/* "09:15" or "09:15:00" -> "09:15:00" */
export const clockTime = () =>
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "must be a time (HH:MM)")
    .transform(value => (value.length === 5 ? `${value}:00` : value));

/* Optional ?from=&to= window of at most `maxDays` days */
export const dateRange = (maxDays = 366) =>
  z
    .object({ from: date().optional(), to: date().optional() })
    .refine(q => !q.from || !q.to || q.to >= q.from, { path: ["to"], message: "must be on or after from" })
    .refine(q => !q.from || !q.to || daysBetween(q.from, q.to) < maxDays, {
      path: ["to"],
      message: `must be within ${maxDays} days of from`
    });
