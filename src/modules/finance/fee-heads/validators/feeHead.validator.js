import { z } from "../../../../common/validation/zod.js";
import { idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";

const fields = z.object({
  name: text(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{2,20}$/, "must be 2-20 letters, digits, - or _"),
  description: optionalText()
});

const params = idParams("feeHeadId");

export const feeHeadValidators = {
  create: { body: fields },
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(fields) },
  remove: { params }
};
