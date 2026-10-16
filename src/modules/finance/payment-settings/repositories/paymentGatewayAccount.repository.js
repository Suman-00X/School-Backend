import { eq } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { paymentGatewayAccounts } from "../models/paymentGatewayAccount.schema.js";

export const paymentGatewayAccountRepository = {
  /* Ordinary reads never include the (encrypted) secrets */
  ...createRepository({
    table: paymentGatewayAccounts,
    queryKey: "paymentGatewayAccounts",
    hiddenColumns: ["keySecret", "webhookSecret"]
  }),

  /* With the encrypted secrets, for masking and for calling the gateway */
  findWithSecrets: async (tenantId, { dbc = db } = {}) => {
    const [row] = await dbc
      .select()
      .from(paymentGatewayAccounts)
      .where(scoped(paymentGatewayAccounts, tenantId))
      .limit(1);
    return row ?? null;
  },

  /* Removing keys deletes them outright, so no copy of the secrets is kept */
  purge: (tenantId, { dbc = db } = {}) =>
    dbc
      .delete(paymentGatewayAccounts)
      .where(eq(paymentGatewayAccounts.tenantId, tenantId))
      .returning({ id: paymentGatewayAccounts.id })
};
