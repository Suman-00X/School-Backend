import { createCrudController } from "../../../../common/crud/crudController.js";
import { sendFile } from "../../../../common/export/exporters.js";
import { created, ok, paginated } from "../../../../common/http/responses.js";
import { employeeSalaryService } from "../services/employeeSalary.service.js";
import { payrollRunService } from "../services/payrollRun.service.js";
import { payslipService } from "../services/payslip.service.js";
import { salaryComponentService } from "../services/salaryComponent.service.js";

const fullName = user => [user?.firstName, user?.lastName].filter(Boolean).join(" ");

const runSummary = run => {
  const skipped = run.withoutSalary?.length ? `; ${run.withoutSalary.length} employee(s) without a salary skipped` : "";
  return `${run.employeeCount} payslip(s), net pay ${run.totalNet}${skipped}`;
};

export const salaryComponentController = createCrudController(salaryComponentService, {
  singular: "Salary component",
  plural: "Salary components",
  idParam: "componentId"
});

export const employeeSalaryController = {
  create: async (req, res) => {
    const salary = await employeeSalaryService.create(req.context, req.body);
    return created(
      res,
      salary,
      `Salary revision for ${fullName(salary.user)} effective ${salary.effectiveFrom}: basic ${salary.monthlyBasic}`
    );
  },

  list: async (req, res) =>
    paginated(res, await employeeSalaryService.list(req.context, req.query), "Salary revisions retrieved successfully"),

  getById: async (req, res) =>
    ok(
      res,
      await employeeSalaryService.getById(req.context, req.params.salaryId),
      "Salary revision retrieved successfully"
    )
};

export const payrollRunController = {
  create: async (req, res) => {
    const run = await payrollRunService.create(req.context, req.body);
    return created(res, run, `Draft payroll for ${run.monthLabel} created: ${runSummary(run)}`);
  },

  recalculate: async (req, res) => {
    const run = await payrollRunService.recalculate(req.context, req.params.runId);
    return ok(res, run, `Payroll for ${run.monthLabel} recalculated: ${runSummary(run)}`);
  },

  finalize: async (req, res) => {
    const run = await payrollRunService.finalize(req.context, req.params.runId);
    return ok(res, run, `Payroll for ${run.monthLabel} finalized: ${runSummary(run)}`);
  },

  list: async (req, res) =>
    paginated(res, await payrollRunService.list(req.context, req.query), "Payroll runs retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await payrollRunService.getById(req.context, req.params.runId), "Payroll run retrieved successfully"),

  payslips: async (req, res) =>
    paginated(
      res,
      await payrollRunService.payslips(req.context, req.params.runId, req.query),
      "Payslips retrieved successfully"
    )
};

const sendPdf = async (req, res, payslip) =>
  sendFile(res, { ...(await payslipService.pdf(req.context, payslip)), format: "pdf" });

export const payslipController = {
  getById: async (req, res) =>
    ok(res, await payslipService.getById(req.context, req.params.payslipId), "Payslip retrieved successfully"),

  pdf: async (req, res) => sendPdf(req, res, await payslipService.getById(req.context, req.params.payslipId)),

  mine: async (req, res) =>
    paginated(res, await payslipService.mine(req.context, req.query), "Your payslips retrieved successfully"),

  getMine: async (req, res) =>
    ok(res, await payslipService.getMine(req.context, req.params.payslipId), "Payslip retrieved successfully"),

  myPdf: async (req, res) => sendPdf(req, res, await payslipService.getMine(req.context, req.params.payslipId))
};
