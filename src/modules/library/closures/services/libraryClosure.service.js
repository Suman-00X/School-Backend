import { gte, lte } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { eachDay, maxDate, minDate } from "../../../../common/utils/date.util.js";
import { libraryClosures } from "../models/libraryClosure.schema.js";
import { libraryClosureRepository as closures } from "../repositories/libraryClosure.repository.js";

const base = createCrudService(closures, { entity: "Library closure" });

export const libraryClosureService = {
  ...base,

  list: (ctx, { page, limit, from, to }) =>
    closures.list(ctx.tenantId, {
      page,
      limit,
      conditions: [to && lte(libraryClosures.fromDate, to), from && gte(libraryClosures.toDate, from)].filter(Boolean)
    }),

  create: (ctx, data) => closures.create(ctx.tenantId, { ...data, createdBy: ctx.userId }),

  /* For the library calendar: every closed day in [from, to] */
  daysBetween: async (ctx, from, to) => {
    const days = new Set();
    for (const closure of await closures.overlapping(ctx.tenantId, from, to)) {
      for (const day of eachDay(maxDate(from, closure.fromDate), minDate(to, closure.toDate))) days.add(day);
    }
    return days;
  }
};
