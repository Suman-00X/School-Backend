import { z } from "../../../../common/validation/zod.js";
import {
  date,
  id,
  idParams,
  listQuery,
  nonNegativeInt,
  optionalText,
  patchBody,
  text
} from "../../../../common/validation/schemas.js";
import { LATE_FEE_TYPES } from "../../shared/constants/finance.constants.js";

const amount = () => z.number().positive().max(100_000_000).multipleOf(0.01);

const items = z
  .array(z.object({ feeHeadId: id(), amount: amount() }))
  .min(1)
  .max(50)
  .refine(list => new Set(list.map(i => i.feeHeadId)).size === list.length, "must not repeat a fee head");

const installments = z
  .array(z.object({ name: text(50), dueDate: date(), sharePercent: z.number().positive().max(100).multipleOf(0.01) }))
  .min(1)
  .max(24)
  .refine(list => new Set(list.map(i => i.name)).size === list.length, "must not repeat an installment name");

const fields = z.object({
  name: text(100),
  /* Omit to apply to every class */
  classId: id().optional(),
  description: optionalText(),
  lateFeeType: z.enum(LATE_FEE_TYPES).default("NONE"),
  lateFeeAmount: z.number().min(0).max(1_000_000).multipleOf(0.01).default(0),
  lateFeeGraceDays: nonNegativeInt().max(365).default(0),
  lateFeeCap: amount().optional(),
  items,
  installments
});

const params = idParams("feeStructureId");

export const feeStructureValidators = {
  create: { body: fields },
  list: { query: listQuery({ classId: id().optional() }) },
  getById: { params },
  update: {
    params,
    body: patchBody(
      z.object({
        name: text(100),
        description: optionalText(),
        lateFeeType: z.enum(LATE_FEE_TYPES),
        lateFeeAmount: z.number().min(0).max(1_000_000).multipleOf(0.01),
        lateFeeGraceDays: nonNegativeInt().max(365),
        lateFeeCap: amount(),
        items,
        installments
      })
    )
  },
  remove: { params }
};
