import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, name, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import { amount } from "../../shared/validators/finance.validators.js";

/* Annual amounts per fee head */
const items = z
  .array(z.object({ feeHeadId: id(), amount: amount() }))
  .min(1)
  .max(50)
  .refine(list => new Set(list.map(i => i.feeHeadId)).size === list.length, "must not repeat a fee head");

const installmentPlanIds = z
  .array(id())
  .min(1)
  .max(12)
  .refine(list => new Set(list).size === list.length, "must not repeat a plan");

const fields = z
  .object({
    name: name(100),
    /* Omit to apply to every class */
    classId: id().optional(),
    description: optionalText(),
    items,
    /* The plans students may pay by; students without an assigned plan get the default */
    installmentPlanIds,
    defaultInstallmentPlanId: id(),
    /* false: never charges late fees. Without lateFeeRuleId the school's default rule applies */
    chargesLateFee: z.boolean().default(true),
    lateFeeRuleId: id().optional()
  })
  .refine(body => body.installmentPlanIds.includes(body.defaultInstallmentPlanId), {
    path: ["defaultInstallmentPlanId"],
    message: "must be one of installmentPlanIds"
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
        name: name(100),
        description: optionalText(),
        items,
        installmentPlanIds,
        defaultInstallmentPlanId: id(),
        chargesLateFee: z.boolean(),
        /* null: back to the school's default rule */
        lateFeeRuleId: id().nullable()
      })
    )
  },
  remove: { params }
};
