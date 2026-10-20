import { sql } from "drizzle-orm";
import { boolean, check, date, index, pgEnum, pgTable, text, time, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { exams } from "../../exams/models/exam.schema.js";
import { CALENDAR_EVENT_TYPES } from "../../shared/constants/academic.constants.js";

export const calendarEventType = pgEnum("calendar_event_type", CALENDAR_EVENT_TYPES);

/* School calendar: holidays, vacations, exam weeks, events, meetings.
   An exam's dates come from its timetable (its papers' dates), one event per exam. */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    ...baseColumns(),
    academicYearId: uuid("academic_year_id")
      .notNull()
      .references(() => academicYears.id),
    title: text("title").notNull(),
    eventType: calendarEventType("event_type").notNull(),
    /* NATIONAL, SUMMER, SPORTS_DAY, PARENT_TEACHER… (CALENDAR_EVENT_CATEGORIES of the type) */
    category: text("category"),
    /* EXAM events: the exam whose timetable this is */
    examId: uuid("exam_id").references(() => exams.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    /* School is closed on these days (no attendance) */
    isHoliday: boolean("is_holiday").notNull().default(false),
    /* Meetings (required) and events (optional): the hours on each day */
    startTime: time("start_time"),
    endTime: time("end_time"),
    venue: text("venue"),
    /* Events and parent meetings: the classes taking part; null for the whole school */
    classIds: uuid("class_ids").array(),
    description: text("description")
  },
  t => [
    index("calendar_events_year_dates_idx").on(t.academicYearId, t.startDate, t.endDate),
    check("calendar_events_dates_chk", sql`${t.endDate} >= ${t.startDate}`),
    check("calendar_events_times_chk", sql`${t.startTime} IS NULL OR ${t.endTime} IS NULL OR ${t.endTime} > ${t.startTime}`),
    uniqueIndex("calendar_events_exam_uq").on(t.examId).where(sql`${t.examId} IS NOT NULL AND ${activeRows(t)}`)
  ]
);
