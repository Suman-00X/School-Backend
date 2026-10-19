import { pgEnum, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { ROLL_NUMBER_ORDERS } from "../../shared/constants/academic.constants.js";

export const rollNumberOrder = pgEnum("roll_number_order", ROLL_NUMBER_ORDERS);

/* One per school (created with defaults on first read). How roll numbers are ordered when
   they are assigned: by name, or by the previous year's published final result. */
export const enrollmentPolicies = pgTable(
  "enrollment_policies",
  {
    ...baseColumns(),
    rollNumberOrder: rollNumberOrder("roll_number_order").notNull().default("ALPHABETICAL")
  },
  t => [uniqueIndex("enrollment_policies_tenant_uq").on(t.tenantId)]
);
