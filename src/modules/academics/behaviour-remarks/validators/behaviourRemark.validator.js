import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import { REMARK_CATEGORY_KEYS, REMARK_KINDS } from "../constants/behaviourRemark.constants.js";

const fields = z.object({
  studentId: id(),
  occurredOn: date(),
  kind: z.enum(REMARK_KINDS),
  category: z.enum(REMARK_CATEGORY_KEYS),
  remark: text(2000),
  actionTaken: optionalText(1000)
});

const params = idParams("remarkId");

/* Filters shared by the staff list and the portal */
export const remarkFilters = {
  kind: z.enum(REMARK_KINDS).optional(),
  category: z.enum(REMARK_CATEGORY_KEYS).optional(),
  from: date().optional(),
  to: date().optional(),
  unacknowledged: z
    .enum(["true", "false"])
    .transform(v => v === "true")
    .optional()
};

export const behaviourRemarkValidators = {
  create: { body: fields },
  list: {
    query: listQuery({ studentId: id().optional(), sectionId: id().optional(), ...remarkFilters })
  },
  summary: { params: idParams("studentId") },
  getById: { params },
  update: {
    params,
    /* actionTaken: "" clears it */
    body: patchBody(fields.omit({ studentId: true }).extend({ actionTaken: z.string().trim().max(1000) }))
  }
};
