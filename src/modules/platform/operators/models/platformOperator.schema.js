import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/* In the PLATFORM database: the people who run the service and onboard schools.
   Not a school account: an operator signs in to the onboarding portal only, with a token
   no school endpoint accepts. The first one is created with `npm run platform:operator`. */
export const platformOperatorStatus = pgEnum("platform_operator_status", ["ACTIVE", "DISABLED"]);

export const platformOperators = pgTable(
  "platform_operators",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /* Stored lower-case */
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: platformOperatorStatus("status").notNull().default("ACTIVE"),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date())
  },
  t => [uniqueIndex("platform_operators_email_uq").on(t.email)]
);
