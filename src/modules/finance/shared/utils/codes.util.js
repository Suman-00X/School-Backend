import { nextCode, pad } from "../../../../common/sequences/sequence.service.js";
import { toYearYY } from "../../../../common/utils/date.util.js";

/* INV26-000001: invoices numbered per school per academic-year start */
export const nextInvoiceNumber = (tenantId, yearStartDate, options) => {
  const yy = toYearYY(yearStartDate);
  return nextCode(tenantId, `INVOICE-${yy}`, n => `INV${yy}-${pad(n, 6)}`, options);
};

/* RCPT26-000001: receipts for successful payments */
export const nextReceiptNumber = (tenantId, yearStartDate, options) => {
  const yy = toYearYY(yearStartDate);
  return nextCode(tenantId, `RECEIPT-${yy}`, n => `RCPT${yy}-${pad(n, 6)}`, options);
};
