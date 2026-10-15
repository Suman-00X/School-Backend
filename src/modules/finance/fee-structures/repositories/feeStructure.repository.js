import { and, asc, eq } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { feeInstallments, feeStructureItems, feeStructures } from "../models/feeStructure.schema.js";

export const feeStructureRepository = {
  ...createRepository({ table: feeStructures, queryKey: "feeStructures", orderBy: asc(feeStructures.name) }),

  /* Items and installments belong to the structure and are replaced as a set */
  replaceChildren: async (tenantId, feeStructureId, { items, installments }, { dbc = db } = {}) => {
    if (items) {
      await dbc
        .delete(feeStructureItems)
        .where(and(eq(feeStructureItems.tenantId, tenantId), eq(feeStructureItems.feeStructureId, feeStructureId)));
      await dbc.insert(feeStructureItems).values(items.map(item => ({ ...item, feeStructureId, tenantId })));
    }
    if (installments) {
      await dbc
        .delete(feeInstallments)
        .where(and(eq(feeInstallments.tenantId, tenantId), eq(feeInstallments.feeStructureId, feeStructureId)));
      await dbc
        .insert(feeInstallments)
        .values(installments.map((inst, index) => ({ ...inst, feeStructureId, tenantId, sortOrder: index })));
    }
  }
};
