import { asc, eq } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { libraryCopies } from "../models/copy.schema.js";

/* Row locks for the rest of the caller's transaction */
const lockWhere = async (dbc, where) => dbc.select().from(libraryCopies).where(where).for("update");

export const copyRepository = {
  ...createRepository({ table: libraryCopies, queryKey: "libraryCopies", orderBy: asc(libraryCopies.accessionNumber) }),

  lockById: async (tenantId, copyId, { dbc }) =>
    (await lockWhere(dbc, scoped(libraryCopies, tenantId, eq(libraryCopies.id, copyId))))[0] ?? null,

  lockByAccessionNumber: async (tenantId, accessionNumber, { dbc }) =>
    (await lockWhere(dbc, scoped(libraryCopies, tenantId, eq(libraryCopies.accessionNumber, accessionNumber))))[0] ??
    null,

  lockAllOfBook: (tenantId, bookId, { dbc }) =>
    lockWhere(dbc, scoped(libraryCopies, tenantId, eq(libraryCopies.bookId, bookId))),

  softDeleteAllOfBook: (tenantId, bookId, { dbc }) =>
    dbc
      .update(libraryCopies)
      .set({ isActive: false })
      .where(scoped(libraryCopies, tenantId, eq(libraryCopies.bookId, bookId)))
};
