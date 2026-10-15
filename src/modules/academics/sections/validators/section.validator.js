import { z } from "../../../../common/validation/zod.js";
import { bulkBody, id, idParams, listQuery, optionalText, patchBody, positiveInt } from "../../../../common/validation/schemas.js";

const fields = z.object({
  classId: id(),
  sectionName: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,5}$/, "must be 1-5 letters or digits"),
  capacity: positiveInt().max(500).optional(),
  classTeacherId: id().optional(),
  description: optionalText()
});

const params = idParams("sectionId");

export const sectionValidators = {
  create: { body: fields },
  createMany: { body: bulkBody("sections", fields) },
  list: { query: listQuery({ classId: id().optional() }) },
  getById: { params },
  update: { params, body: patchBody(fields) }
};
