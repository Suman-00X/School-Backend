import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { academicYears } from "../../database/postgres/schema/index.js";
import { findOne, scoped, updateOne } from "../../database/postgres/helpers.js";
import { getPagination } from "../../common/utils/pagination.util.js";
import { sanitizeInput } from "../../common/utils/sanitize.util.js";

/* A tenant has at most one current year (partial unique index), so the
   previous one is cleared in the same transaction */
const clearCurrentYear = (dbc, tenantId, exceptId) =>
  dbc
    .update(academicYears)
    .set({ isCurrent: false })
    .where(
      and(
        eq(academicYears.tenantId, tenantId),
        eq(academicYears.isCurrent, true),
        exceptId ? ne(academicYears.id, exceptId) : undefined
      )
    );

export const createAcademicYear = (tenantId, payload) =>
  db.transaction(async tx => {
    const values = sanitizeInput(payload);
    if (values.isCurrent) await clearCurrentYear(tx, tenantId);

    const [academicYear] = await tx
      .insert(academicYears)
      .values({ ...values, tenantId })
      .returning();
    return academicYear;
  });

export const getAcademicYears = (tenantId, query = {}) => {
  const { skip, limit } = getPagination(query);
  return db
    .select()
    .from(academicYears)
    .where(scoped(academicYears, tenantId))
    .orderBy(desc(academicYears.startDate))
    .limit(limit)
    .offset(skip);
};

export const getAcademicYearById = (tenantId, academicYearId, dbc = db) =>
  findOne(dbc, academicYears, scoped(academicYears, tenantId, eq(academicYears.id, academicYearId)));

export const getCurrentAcademicYear = tenantId =>
  findOne(db, academicYears, scoped(academicYears, tenantId, eq(academicYears.isCurrent, true)));

export const updateAcademicYear = (tenantId, academicYearId, payload) =>
  db.transaction(async tx => {
    const existing = await getAcademicYearById(tenantId, academicYearId, tx);
    if (!existing) return null;

    const values = sanitizeInput(payload);
    if (values.isCurrent === true) await clearCurrentYear(tx, tenantId, academicYearId);

    return updateOne(
      tx,
      academicYears,
      scoped(academicYears, tenantId, eq(academicYears.id, academicYearId)),
      values
    );
  });
