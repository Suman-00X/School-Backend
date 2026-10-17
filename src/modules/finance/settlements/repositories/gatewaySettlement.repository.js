import { desc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { gatewaySettlements } from "../models/gatewaySettlement.schema.js";

const base = createRepository({
  table: gatewaySettlements,
  queryKey: "gatewaySettlements",
  orderBy: desc(gatewaySettlements.settledAt)
});

export const gatewaySettlementRepository = {
  ...base,

  /* Insert unless already imported -> the new row, or null */
  insertNew: async (tenantId, values, { dbc }) => {
    const [row] = await dbc
      .insert(gatewaySettlements)
      .values({ tenantId, ...values })
      .onConflictDoNothing({
        target: [gatewaySettlements.tenantId, gatewaySettlements.provider, gatewaySettlements.settlementId]
      })
      .returning();
    return row ?? null;
  }
};
