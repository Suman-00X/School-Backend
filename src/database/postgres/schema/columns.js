import { boolean, timestamp, uuid } from "drizzle-orm/pg-core";

/* Column helpers shared by every table */

export const primaryId = () => uuid("id").primaryKey().defaultRandom();

export const isActive = () => boolean("is_active").notNull().default(true);

export const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
});
