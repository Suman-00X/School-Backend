import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import { CONCESSION_TYPES } from "../../shared/constants/finance.constants.js";

const fields = z
  .object({
    name: text(100),
    concessionType: z.enum(CONCESSION_TYPES),
    value: z.number().positive().max(100_000_000).multipleOf(0.01),
    /* Omit to discount every fee line */
    feeHeadId: id().optional(),
    description: optionalText()
  })
  .refine(c => c.concessionType !== "PERCENT" || c.value <= 100, {
    path: ["value"],
    message: "must be at most 100 for a percentage"
  });

const params = idParams("concessionId");

export const concessionValidators = {
  create: { body: fields },
  list: { query: listQuery() },
  getById: { params },
  update: {
    params,
    body: patchBody(z.object({ name: text(100), description: optionalText(), feeHeadId: id() }))
  },
  remove: { params },

  grant: {
    body: z.object({ studentId: id(), concessionId: id(), academicYearId: id().optional(), reason: optionalText(500) })
  },
  listGrants: { query: listQuery({ studentId: id().optional(), academicYearId: id().optional() }) },
  revoke: { params: idParams("grantId") }
};
