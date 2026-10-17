import { and, asc, gte, lte } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { libraryClosures } from "../models/libraryClosure.schema.js";

const base = createRepository({
  table: libraryClosures,
  queryKey: "libraryClosures",
  orderBy: asc(libraryClosures.fromDate)
});

export const libraryClosureRepository = {
  ...base,

  /* Closures touching [from, to] */
  overlapping: (tenantId, from, to, { dbc = db } = {}) =>
    dbc
      .select()
      .from(libraryClosures)
      .where(
        scoped(libraryClosures, tenantId, and(lte(libraryClosures.fromDate, to), gte(libraryClosures.toDate, from)))
      )
};
