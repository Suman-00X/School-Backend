import { date, index, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { ALL_ROLES } from "../../../../common/auth/roles.js";
import { GENDERS, USER_STATUSES } from "../../shared/constants/user.constants.js";

export const userRole = pgEnum("user_role", ALL_ROLES);
export const userStatus = pgEnum("user_status", USER_STATUSES);
export const gender = pgEnum("gender", GENDERS);

/* Login identity + personal details, one per person (any role) */
export const users = pgTable(
  "users",
  {
    ...baseColumns(),
    firstName: text("first_name").notNull(),
    middleName: text("middle_name"),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash"),
    role: userRole("role").notNull(),
    gender: gender("gender"),
    dob: date("dob"),
    address: text("address"),
    status: userStatus("status").notNull().default("ACTIVE")
  },
  t => [
    uniqueIndex("users_tenant_email_uq").on(t.tenantId, t.email),
    index("users_tenant_role_idx").on(t.tenantId, t.role)
  ]
);
