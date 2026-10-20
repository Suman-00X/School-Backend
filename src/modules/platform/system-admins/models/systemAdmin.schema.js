import { pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/* In the PLATFORM database: the system admins, who own the platform, onboard schools
   (tenants) and charge them. Not a school account: a system admin signs in to the admin
   console only, with a session no school endpoint accepts. The first one is created with
   `npm run platform:admin`. */
export const systemAdminStatus = pgEnum("platform_admin_status", ["ACTIVE", "DISABLED"]);

export const systemAdmins = pgTable(
  "platform_admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /* Stored lower-case */
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    status: systemAdminStatus("status").notNull().default("ACTIVE"),
    /* Sessions started before this are over (signing out, a new password) */
    sessionsValidAfter: timestamp("sessions_valid_after", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date())
  },
  t => [uniqueIndex("platform_admins_email_uq").on(t.email)]
);
