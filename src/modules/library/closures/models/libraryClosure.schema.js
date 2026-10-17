import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";

/* Days the library is closed outside the school calendar, entered by hand for exceptional
   cases (D-65): the break between two academic years, a stock-taking week, a renovation.
   Late fines skip them (on either fine-day basis) and due dates move past them. */
export const libraryClosures = pgTable(
  "library_closures",
  {
    ...baseColumns(),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").references(() => users.id)
  },
  t => [
    index("library_closures_dates_idx").on(t.tenantId, t.fromDate, t.toDate),
    check("library_closures_dates_chk", sql`${t.toDate} >= ${t.fromDate}`)
  ]
);
