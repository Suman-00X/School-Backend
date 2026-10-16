import { and, asc, eq } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { feeStructureItems, feeStructurePlans, feeStructures } from "../models/feeStructure.schema.js";

export const feeStructureRepository = {
  ...createRepository({ table: feeStructures, queryKey: "feeStructures", orderBy: asc(feeStructures.name) }),

  /* Items and offered plans belong to the structure and are replaced as a set */
  replaceChildren: async (tenantId, feeStructureId, { items, plans }, { dbc = db } = {}) => {
    if (items) {
      await dbc
        .delete(feeStructureItems)
        .where(and(eq(feeStructureItems.tenantId, tenantId), eq(feeStructureItems.feeStructureId, feeStructureId)));
      await dbc.insert(feeStructureItems).values(items.map(item => ({ ...item, feeStructureId, tenantId })));
    }
    if (plans) {
      await dbc
        .delete(feeStructurePlans)
        .where(and(eq(feeStructurePlans.tenantId, tenantId), eq(feeStructurePlans.feeStructureId, feeStructureId)));
      await dbc.insert(feeStructurePlans).values(plans.map(plan => ({ ...plan, feeStructureId, tenantId })));
    }
  },

  /* Structures that offer a plan */
  offeringPlan: (tenantId, installmentPlanId) =>
    db
      .select({ id: feeStructures.id, name: feeStructures.name })
      .from(feeStructurePlans)
      .innerJoin(feeStructures, eq(feeStructures.id, feeStructurePlans.feeStructureId))
      .where(
        and(
          eq(feeStructurePlans.tenantId, tenantId),
          eq(feeStructurePlans.installmentPlanId, installmentPlanId),
          eq(feeStructurePlans.isActive, true),
          eq(feeStructures.isActive, true)
        )
      )
};
