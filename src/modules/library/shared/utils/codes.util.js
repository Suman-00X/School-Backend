import { nextCode, nextSequence, pad } from "../../../../common/sequences/sequence.service.js";

/* ACC-000001: one running accession register per school (numbers are never reused).
   Takes `count` consecutive numbers inside the caller's transaction. */
export const nextAccessionNumbers = async (tenantId, count, options) => {
  const numbers = [];
  for (let i = 0; i < count; i++) {
    numbers.push(`ACC-${pad(await nextSequence(tenantId, "LIBRARY-ACCESSION", options), 6)}`);
  }
  return numbers;
};

/* LIBR-000001: receipts for library fine payments */
export const nextFineReceiptNumber = (tenantId, options) =>
  nextCode(tenantId, "LIBRARY-RECEIPT", n => `LIBR-${pad(n, 6)}`, options);
