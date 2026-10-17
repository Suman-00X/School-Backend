import { z } from "../../../../common/validation/zod.js";
import {
  bulkBody,
  id,
  idParams,
  listQuery,
  optionalText,
  patchBody,
  positiveInt
} from "../../../../common/validation/schemas.js";

const fields = z.object({
  classId: id(),
  sectionName: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,5}$/, "must be 1-5 letters or digits"),
  capacity: positiveInt().max(500).optional(),
  classTeacherId: id().optional(),
  /* Takes the daily and half-day registers too; null removes the deputy */
  deputyClassTeacherId: id().nullable().optional(),
  description: optionalText()
});

const deputyIsSomeoneElse = [
  body => !body.deputyClassTeacherId || body.deputyClassTeacherId !== body.classTeacherId,
  { path: ["deputyClassTeacherId"], message: "must be a different teacher from the class teacher" }
];

const params = idParams("sectionId");

export const sectionValidators = {
  create: { body: fields.refine(...deputyIsSomeoneElse) },
  createMany: { body: bulkBody("sections", fields.refine(...deputyIsSomeoneElse)) },
  list: { query: listQuery({ classId: id().optional() }) },
  getById: { params },
  update: { params, body: patchBody(fields).refine(...deputyIsSomeoneElse) }
};
