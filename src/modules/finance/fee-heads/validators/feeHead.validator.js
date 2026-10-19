import { z } from "../../../../common/validation/zod.js";
import { code, idParams, listQuery, name, optionalText, patchBody } from "../../../../common/validation/schemas.js";

const fields = z.object({
  name: name(100),
  code: code(),
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
