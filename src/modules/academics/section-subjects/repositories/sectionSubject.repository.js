import { asc } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";
import { createRepository } from "../../../../common/database/repository.js";
import { sectionSubjects } from "../models/sectionSubject.schema.js";

const base = createRepository({
  table: sectionSubjects,
  queryKey: "sectionSubjects",
  orderBy: asc(sectionSubjects.displayCode)
});

export const sectionSubjectRepository = {
  ...base,

  /* Updates every active row matching -> the updated rows */
  updateWhere: (tenantId, conditions, values, { dbc = db } = {}) =>
    dbc
      .update(sectionSubjects)
      .set(values)
      .where(base.where(tenantId, ...conditions))
      .returning({ id: sectionSubjects.id }),

  /* Soft-deletes every active row matching -> the removed rows */
  softDeleteWhere: (tenantId, conditions, { dbc = db } = {}) =>
    dbc
      .update(sectionSubjects)
      .set({ isActive: false })
      .where(base.where(tenantId, ...conditions))
      .returning({ id: sectionSubjects.id, sectionId: sectionSubjects.sectionId })
};
