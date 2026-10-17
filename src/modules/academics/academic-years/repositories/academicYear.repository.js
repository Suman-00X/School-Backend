import { and, desc, eq, ne } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { academicYears } from "../models/academicYear.schema.js";

const base = createRepository({
  table: academicYears,
  queryKey: "academicYears",
  orderBy: desc(academicYears.startDate)
});

export const academicYearRepository = {
  ...base,

  /* Un-mark the tenant's current year (all except `exceptId`) */
  clearCurrent: (tenantId, exceptId, { dbc }) =>
    dbc
      .update(academicYears)
      .set({ isCurrent: false, currentUntil: new Date() })
      .where(
        and(
          eq(academicYears.tenantId, tenantId),
          eq(academicYears.isCurrent, true),
          exceptId ? ne(academicYears.id, exceptId) : undefined
        )
      )
};
