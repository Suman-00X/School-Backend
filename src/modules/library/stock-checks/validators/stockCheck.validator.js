import { z } from "../../../../common/validation/zod.js";
import { idParams, listQuery, optionalText, paginationQuery, text } from "../../../../common/validation/schemas.js";

const params = idParams("stockCheckId");

/* An accession number or a barcode, as the scanner reads it */
const code = () =>
  z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{3,64}$/, "must be an accession number or barcode");

export const stockCheckValidators = {
  start: { body: z.object({ title: text(200), notes: optionalText(1000) }) },
  list: { query: listQuery() },
  getById: { params },
  scan: { params, body: z.object({ codes: z.array(code()).min(1).max(500) }) },
  missing: { params, query: paginationQuery },
  unexpected: { params, query: paginationQuery },
  close: { params }
};
