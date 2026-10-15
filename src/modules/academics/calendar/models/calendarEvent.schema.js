import { sql } from "drizzle-orm";
import { boolean, check, date, index, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { CALENDAR_EVENT_TYPES } from "../../shared/constants/academic.constants.js";

export const calendarEventType = pgEnum("calendar_event_type", CALENDAR_EVENT_TYPES);

/* School calendar: holidays, vacations, exam weeks, events, meetings */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    title: text("title").notNull(),
    eventType: calendarEventType("event_type").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    /* School is closed on these days (no attendance) */
    isHoliday: boolean("is_holiday").notNull().default(false),
    description: text("description")
  },
  t => [
    index("calendar_events_year_dates_idx").on(t.academicYearId, t.startDate, t.endDate),
    check("calendar_events_dates_chk", sql`${t.endDate} >= ${t.startDate}`)
  ]
);
