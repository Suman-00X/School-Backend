import { createCrudController } from "../../../../common/crud/crudController.js";
import { ok, paginated } from "../../../../common/http/responses.js";
import { installmentPlanService } from "../services/installmentPlan.service.js";
import { planAssignmentService } from "../services/planAssignment.service.js";

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

/* "Quarterly plan (4 installments)" */
const planName = plan => `${plan.name} plan (${plural(plan.installmentCount, "installment")})`;

/* ". 1 unpaid invoice cancelled and 3 re-issued under the new plan" */
const rescheduled = ({ invoicesCancelled, invoicesIssued }) =>
  invoicesCancelled.length
    ? `. ${plural(invoicesCancelled.length, "unpaid invoice")} cancelled and ${invoicesIssued.length} re-issued under the new plan`
    : "";

const assignedMessage = result => {
  if (!result.changed) {
    return result.installmentPlan
      ? `${result.studentName} already pays by the ${planName(result.installmentPlan)}`
      : `${result.studentName} already pays by each fee structure's default plan`;
  }
  const what = result.installmentPlan
    ? `${planName(result.installmentPlan)} assigned to ${result.studentName}`
    : `${result.studentName} now pays by each fee structure's default plan`;
  return what + rescheduled(result);
};

const bulkMessage = result => {
  const who = `${plural(result.students, "student")}${result.scope ? ` of ${result.scope}` : ""}`;
  const what = result.installmentPlan
    ? `${planName(result.installmentPlan)} assigned to ${who}`
    : `${who} now pay by each fee structure's default plan`;
  return `${what} (${result.changed} changed)${rescheduled(result)}`;
};

export const installmentPlanController = {
  ...createCrudController(installmentPlanService, {
    singular: "Installment plan",
    plural: "Installment plans",
    idParam: "installmentPlanId"
  }),

  listAssignments: async (req, res) =>
    paginated(res, await planAssignmentService.list(req.context, req.query), "Plan assignments retrieved successfully"),

  assign: async (req, res) => {
    const result = await planAssignmentService.assign(req.context, req.body);
    return ok(res, result, assignedMessage(result));
  },

  assignMany: async (req, res) => {
    const result = await planAssignmentService.assignMany(req.context, req.body);
    return ok(res, result, bulkMessage(result));
  }
};
