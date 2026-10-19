import { z } from "../../../../common/validation/zod.js";
import {
  idParams,
  listQuery,
  name,
  optionalText,
  patchBody,
  positiveInt
} from "../../../../common/validation/schemas.js";
import { LATE_FEE_CHARGE_TYPES } from "../../shared/constants/finance.constants.js";
import { amount } from "../../shared/validators/finance.validators.js";

/* Days of delay after the grace period: 1-7 FIXED 50, 8-30 FIXED 200, 31+ FIXED 500 */
const slabs = z
  .array(
    z.object({
      fromDay: positiveInt().max(3650),
      /* Omit on the last slab for "and beyond" */
      toDay: positiveInt().max(3650).optional(),
      chargeType: z.enum(LATE_FEE_CHARGE_TYPES),
      amount: amount(1_000_000)
    })
  )
  .min(1)
  .max(20);

const fields = z.object({
  name: name(100),
  description: optionalText(),
  graceDays: z.coerce.number().int().min(0).max(365).default(0),
  maxAmount: amount(1_000_000).optional(),
  isDefault: z.boolean().default(false),
  slabs
});

const params = idParams("lateFeeRuleId");

export const lateFeeRuleValidators = {
  create: { body: fields },
  list: { query: listQuery() },
  getById: { params },
  update: {
    params,
    body: patchBody(
      z.object({
        name: name(100),
        description: optionalText(),
        graceDays: z.coerce.number().int().min(0).max(365),
        maxAmount: amount(1_000_000).nullable(),
        isDefault: z.boolean(),
        slabs
      })
    )
  },
  remove: { params }
};
