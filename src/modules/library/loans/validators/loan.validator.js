import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText, text } from "../../../../common/validation/schemas.js";
import { FINE_PAYMENT_METHODS, LOAN_STATUSES, RETURN_CONDITIONS } from "../../shared/constants/library.constants.js";
import { accessionNumber, booleanQuery, positiveAmount } from "../../shared/utils/schemas.util.js";

const params = idParams("loanId");

const filters = {
  status: z.enum(LOAN_STATUSES).optional(),
  overdue: booleanQuery(),
  /* Loans with an unpaid fine */
  withFine: booleanQuery(),
  bookId: id().optional()
};

export const loanValidators = {
  issue: {
    body: z
      .object({
        /* The copy by id, or by its accession number (scanned at the desk) */
        copyId: id().optional(),
        accessionNumber: accessionNumber().optional(),
        borrowerUserId: id(),
        /* Overrides the policy's loan period (e.g. for a loan recorded late) */
        dueDate: date().optional()
      })
      .refine(body => Boolean(body.copyId) !== Boolean(body.accessionNumber), {
        message: "send either copyId or accessionNumber",
        path: ["copyId"]
      })
  },
  list: {
    query: listQuery({ ...filters, borrowerUserId: id().optional(), copyId: id().optional() })
  },
  myLoans: { query: listQuery(filters) },
  getById: { params },
  returnLoan: {
    params,
    body: z.object({ condition: z.enum(RETURN_CONDITIONS).default("OK"), notes: optionalText(500) })
  },
  renew: { params },
  payFine: {
    params,
    body: z.object({
      amount: positiveAmount(),
      method: z.enum(FINE_PAYMENT_METHODS),
      reference: optionalText(100)
    })
  },
  waiveFine: { params, body: z.object({ reason: text(500) }) }
};
