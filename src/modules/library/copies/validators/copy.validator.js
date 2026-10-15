import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import { COPY_STATUSES, MANUAL_COPY_STATUSES } from "../../shared/constants/library.constants.js";
import { accessionNumber, amount } from "../../shared/utils/schemas.util.js";

const barcode = () =>
  z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,64}$/, "must be 3-64 letters, digits or -");

const bookParams = idParams("bookId");
const params = idParams("copyId");

export const copyValidators = {
  addCopies: {
    params: bookParams,
    body: z.object({
      count: z.number().int().min(1).max(100),
      price: amount().optional(),
      acquiredOn: date().optional(),
      conditionNotes: optionalText(500)
    })
  },
  listForBook: {
    params: bookParams,
    query: listQuery({ status: z.enum(COPY_STATUSES).optional() })
  },
  list: {
    query: listQuery({
      accessionNumber: accessionNumber().optional(),
      barcode: barcode().optional(),
      status: z.enum(COPY_STATUSES).optional(),
      bookId: id().optional()
    })
  },
  getById: { params },
  update: {
    params,
    body: patchBody(
      z.object({
        /* ISSUED is set and cleared by circulation only */
        status: z.enum(MANUAL_COPY_STATUSES),
        barcode: barcode().nullable(),
        price: amount().nullable(),
        acquiredOn: date().nullable(),
        conditionNotes: optionalText(500)
      })
    )
  }
};
