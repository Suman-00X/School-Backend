import { relations, sql } from "drizzle-orm";
import { pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { RESIDENT_GENDERS } from "../../shared/constants/hostel.constants.js";

export const hostelResidentGender = pgEnum("hostel_resident_gender", RESIDENT_GENDERS);

/* A residence block of the school (Boys Hostel, Girls Hostel) */
export const hostels = pgTable(
  "hostels",
  {
    ...baseColumns(),
    name: text("name").notNull(),
    code: text("code").notNull(),
    residentGender: hostelResidentGender("resident_gender").notNull(),
    /* An employee account (ADMIN, PRINCIPAL, STAFF or TEACHER) */
    wardenUserId: uuid("warden_user_id").references(() => users.id),
    address: text("address"),
    contactPhone: text("contact_phone"),
    description: text("description")
  },
  t => [
    uniqueIndex("hostels_tenant_name_uq")
      .on(t.tenantId, sql`lower(${t.name})`)
      .where(activeRows(t)),
    uniqueIndex("hostels_tenant_code_uq").on(t.tenantId, t.code).where(activeRows(t))
  ]
);

export const hostelsRelations = relations(hostels, ({ one }) => ({
  warden: one(users, { fields: [hostels.wardenUserId], references: [users.id] })
}));
