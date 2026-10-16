import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText, text } from "../../../../common/validation/schemas.js";
import { INVOICE_STATUSES } from "../../shared/constants/finance.constants.js";

const params = idParams("invoiceId");

export const invoiceValidators = {
  generate: {
    body: z
      .object({
        feeStructureId: id(),
        /* Limit to one section, or to some students; omit both for every section of the class */
        sectionId: id().optional(),
        studentIds: z
          .array(id())
          .min(1)
          .max(500)
          .refine(list => new Set(list).size === list.length, "must not repeat a student")
          .optional(),
        /* Issue installments due on or before this date (default: the whole year) */
        throughDate: date().optional(),
        issueDate: date().optional(),
        notes: optionalText(500)
      })
      .refine(body => !(body.sectionId && body.studentIds), {
        path: ["studentIds"],
        message: "cannot be combined with sectionId"
      })
  },
  list: {
    query: listQuery({
      status: z.enum(INVOICE_STATUSES).optional(),
      studentId: id().optional(),
      feeStructureId: id().optional(),
      installmentPlanId: id().optional(),
      overdue: z
        .enum(["true", "false"])
        .transform(v => v === "true")
        .optional()
    })
  },
  getById: { params },
  cancel: { params, body: z.object({ reason: text(500) }) },
  waiveLateFee: { params, body: z.object({ reason: text(500) }) },
  reinstateLateFee: { params },
  statement: { params: idParams("studentId"), query: z.object({ academicYearId: id().optional() }) }
};
