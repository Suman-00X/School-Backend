import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import { CONCESSION_CATEGORIES, CONCESSION_TYPES } from "../../shared/constants/finance.constants.js";
import { amount } from "../../shared/validators/finance.validators.js";

/* Omit or [] to discount every fee head */
const feeHeadIds = z
  .array(id())
  .max(50)
  .refine(list => new Set(list).size === list.length, "must not repeat a fee head");

const fields = z
  .object({
    name: text(100),
    category: z.enum(CONCESSION_CATEGORIES).default("OTHER"),
    concessionType: z.enum(CONCESSION_TYPES),
    /* PERCENT: 0-100. FIXED: an amount per academic year */
    value: amount(),
    feeHeadIds: feeHeadIds.optional(),
    description: optionalText()
  })
  .refine(c => c.concessionType !== "PERCENT" || c.value <= 100, {
    path: ["value"],
    message: "must be at most 100 for a percentage"
  });

const params = idParams("concessionId");

export const concessionValidators = {
  create: { body: fields },
  list: { query: listQuery({ category: z.enum(CONCESSION_CATEGORIES).optional() }) },
  getById: { params },
  update: {
    params,
    body: patchBody(
      z.object({
        name: text(100),
        category: z.enum(CONCESSION_CATEGORIES),
        description: optionalText(),
        concessionType: z.enum(CONCESSION_TYPES),
        value: amount(),
        feeHeadIds
      })
    )
  },
  remove: { params },

  grant: {
    body: z.object({ studentId: id(), concessionId: id(), academicYearId: id().optional(), reason: optionalText(500) })
  },
  listGrants: {
    query: listQuery({ studentId: id().optional(), academicYearId: id().optional(), concessionId: id().optional() })
  },
  revoke: { params: idParams("grantId") }
};
