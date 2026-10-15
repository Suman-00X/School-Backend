import { numeric } from "drizzle-orm/pg-core";

/* Money: numeric(12,2) in the database, a number with 2 decimals in the API */
export const money = name => numeric(name, { precision: 12, scale: 2, mode: "number" });

/* Day counts that can be halves (leave days, loss-of-pay days) */
export const dayCount = name => numeric(name, { precision: 5, scale: 1, mode: "number" });
