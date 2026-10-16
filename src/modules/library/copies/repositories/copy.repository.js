import { and, asc, eq, inArray, or } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { libraryCopies } from "../models/copy.schema.js";

/* Row locks for the rest of the caller's transaction */
const lockWhere = async (dbc, where) =>
  dbc.select().from(libraryCopies).where(where).orderBy(asc(libraryCopies.accessionNumber)).for("update");

const base = createRepository({
  table: libraryCopies,
  queryKey: "libraryCopies",
  orderBy: asc(libraryCopies.accessionNumber)
});

export const copyRepository = {
  ...base,

  lockById: async (tenantId, copyId, { dbc }) =>
    (await lockWhere(dbc, scoped(libraryCopies, tenantId, eq(libraryCopies.id, copyId))))[0] ?? null,

  lockAllOfBook: (tenantId, bookId, { dbc }) =>
    lockWhere(dbc, scoped(libraryCopies, tenantId, eq(libraryCopies.bookId, bookId))),

  /* Copies of a book on the shelf, in accession order */
  lockAvailableOfBook: (tenantId, bookId, { dbc }) =>
    lockWhere(
      dbc,
      scoped(libraryCopies, tenantId, eq(libraryCopies.bookId, bookId), eq(libraryCopies.status, "AVAILABLE"))
    ),

  /* A scanned code: an accession number (ACC-000001) or a barcode */
  findByCode: (tenantId, code, { dbc } = {}) =>
    base.findOne(
      tenantId,
      [or(eq(libraryCopies.accessionNumber, code.toUpperCase()), eq(libraryCopies.barcode, code))],
      { dbc }
    ),

  setStatus: (tenantId, copyIds, status, { dbc }) =>
    dbc
      .update(libraryCopies)
      .set({ status })
      .where(and(scoped(libraryCopies, tenantId), inArray(libraryCopies.id, copyIds))),

  softDeleteAllOfBook: (tenantId, bookId, { dbc }) =>
    dbc
      .update(libraryCopies)
      .set({ isActive: false })
      .where(scoped(libraryCopies, tenantId, eq(libraryCopies.bookId, bookId)))
};
