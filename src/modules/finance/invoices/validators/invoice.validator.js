import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText, text } from "../../../../common/validation/schemas.js";
import { INVOICE_STATUSES } from "../../shared/constants/finance.constants.js";

const params = idParams("invoiceId");

export const invoiceValidators = {
  generate: {
    body: z.object({
      feeStructureId: id(),
      feeInstallmentId: id(),
      /* Limit to one section; omit for every section of the class */
      sectionId: id().optional(),
      issueDate: date().optional(),
      notes: optionalText(500)
    })
  },
  list: {
    query: listQuery({
      status: z.enum(INVOICE_STATUSES).optional(),
      studentId: id().optional(),
      feeStructureId: id().optional(),
      overdue: z
        .enum(["true", "false"])
        .transform(v => v === "true")
        .optional()
    })
  },
  getById: { params },
  cancel: { params, body: z.object({ reason: text(500) }) },
  statement: { params: idParams("studentId"), query: z.object({ academicYearId: id().optional() }) }
};
