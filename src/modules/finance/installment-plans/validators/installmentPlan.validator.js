import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, name, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import { percent } from "../../shared/validators/finance.validators.js";

/* In due-date order; the last one absorbs rounding */
const installments = z
  .array(z.object({ name: name(50), dueDate: date(), sharePercent: percent() }))
  .min(1)
  .max(24)
  .refine(
    list => new Set(list.map(i => i.name.toLowerCase())).size === list.length,
    "must not repeat an installment name"
  );

const fields = z.object({ name: name(100), description: optionalText(), installments });

const params = idParams("installmentPlanId");

export const installmentPlanValidators = {
  create: { body: fields },
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(fields) },
  remove: { params },

  listAssignments: {
    query: listQuery({ installmentPlanId: id().optional(), studentId: id().optional() })
  },
  /* installmentPlanId null: back to each fee structure's default plan */
  assign: { body: z.object({ studentId: id(), installmentPlanId: id().nullable() }) },
  assignMany: {
    body: z
      .object({
        installmentPlanId: id().nullable(),
        sectionId: id().optional(),
        classId: id().optional(),
        studentIds: z
          .array(id())
          .min(1)
          .max(500)
          .refine(list => new Set(list).size === list.length, "must not repeat a student")
          .optional()
      })
      .refine(body => [body.sectionId, body.classId, body.studentIds].filter(Boolean).length === 1, {
        path: ["sectionId"],
        message: "send exactly one of sectionId, classId or studentIds"
      })
  }
};
