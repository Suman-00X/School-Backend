import { z } from "../../../../common/validation/zod.js";
import {
  bulkBody,
  idParams,
  listQuery,
  optionalText,
  patchBody,
  positiveInt,
  text
} from "../../../../common/validation/schemas.js";

const fields = z.object({
  className: text(50),
  classOrder: positiveInt().max(50),
  description: optionalText()
});

const params = idParams("classId");

export const classValidators = {
  create: { body: fields },
  createMany: { body: bulkBody("classes", fields) },
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(fields) }
};
