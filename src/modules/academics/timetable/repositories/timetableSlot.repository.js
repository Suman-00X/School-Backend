import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { timetableSlots } from "../models/timetableSlot.schema.js";

export const timetableSlotRepository = createRepository({
  table: timetableSlots,
  queryKey: "timetableSlots",
  orderBy: [asc(timetableSlots.weekday)]
});
