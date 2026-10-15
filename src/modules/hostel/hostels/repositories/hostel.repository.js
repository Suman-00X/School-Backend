import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { hostels } from "../models/hostel.schema.js";

export const hostelRepository = createRepository({
  table: hostels,
  queryKey: "hostels",
  orderBy: asc(hostels.name)
});
