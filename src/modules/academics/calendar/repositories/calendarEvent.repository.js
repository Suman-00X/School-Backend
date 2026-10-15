import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { calendarEvents } from "../models/calendarEvent.schema.js";

export const calendarEventRepository = createRepository({
  table: calendarEvents,
  queryKey: "calendarEvents",
  orderBy: [asc(calendarEvents.startDate), asc(calendarEvents.title)]
});
