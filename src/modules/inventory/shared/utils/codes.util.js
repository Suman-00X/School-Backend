import { nextSequence, pad } from "../../../../common/sequences/sequence.service.js";

/* STK-000001: stock movements numbered per school. Returns the raw sequence too,
   which orders the ledger (text numbers stop sorting after STK-999999). */
export const nextMovementNumber = async (tenantId, options) => {
  const seq = await nextSequence(tenantId, "INVENTORY-STOCK", options);
  return { seq, movementNumber: `STK-${pad(seq, 6)}` };
};
