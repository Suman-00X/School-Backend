import { and, asc, eq } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { concessionFeeHeads, concessions, studentConcessions } from "../models/concession.schema.js";

export const concessionRepository = {
  ...createRepository({ table: concessions, queryKey: "concessions", orderBy: asc(concessions.name) }),

  /* The fee heads a concession is limited to, replaced as a set (empty = every head) */
  replaceFeeHeads: async (tenantId, concessionId, feeHeadIds, { dbc = db } = {}) => {
    await dbc
      .delete(concessionFeeHeads)
      .where(and(eq(concessionFeeHeads.tenantId, tenantId), eq(concessionFeeHeads.concessionId, concessionId)));
    if (feeHeadIds.length) {
      await dbc.insert(concessionFeeHeads).values(feeHeadIds.map(feeHeadId => ({ tenantId, concessionId, feeHeadId })));
    }
  }
};

export const studentConcessionRepository = createRepository({
  table: studentConcessions,
  queryKey: "studentConcessions",
  orderBy: asc(studentConcessions.createdAt)
});
