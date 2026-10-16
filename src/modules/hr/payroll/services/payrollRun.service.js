import { eq } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { sum } from "../../../../common/money/money.js";
import { nextCode, pad } from "../../../../common/sequences/sequence.service.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { leaveRequestService } from "../../leaves/index.js";
import { staffAttendanceService } from "../../staff-attendance/index.js";
import { employeeDirectory } from "../../shared/services/employeeDirectory.service.js";
import { maskSensitive } from "../../shared/utils/mask.util.js";
import { computePayslip } from "../../shared/utils/payrollMath.util.js";
import { monthBounds, monthLabel, monthOf } from "../../shared/utils/period.util.js";
import { payrollRuns, payslips } from "../models/payroll.schema.js";
import { payrollRunRepository, payslipRepository } from "../repositories/payroll.repository.js";
import { employeeSalaryService } from "./employeeSalary.service.js";

const groupBy = (items, keyOf) => {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
};

/* Compute and store every payslip of a draft run, inside the caller's transaction.
   Paid: each active employee with a salary revision effective on the 1st of the month.
   -> { withoutSalary: [{ userId, name }] } (active employees left out) */
const computeRun = async (ctx, run, tx) => {
  const month = monthBounds(run.month);
  const employees = await employeeDirectory.list(ctx);
  const salaries = await employeeSalaryService.effectiveOn(ctx, month.start, { dbc: tx });
  const marks = groupBy(await staffAttendanceService.inRange(ctx, month.start, month.end, { dbc: tx }), m => m.userId);
  const leaves = groupBy(
    await leaveRequestService.approvedInRange(ctx, month.start, month.end, { dbc: tx }),
    l => l.request.userId
  );

  const rows = [];
  const withoutSalary = [];
  for (const employee of employees) {
    const salary = salaries.get(employee.userId);
    if (!salary) {
      withoutSalary.push({ userId: employee.userId, name: employee.name });
      continue;
    }
    rows.push({
      runId: run.id,
      userId: employee.userId,
      month: run.month,
      salaryId: salary.id,
      employeeName: employee.name,
      employeeCode: employee.employeeCode,
      role: employee.role,
      designation: employee.designation,
      ...computePayslip({
        salary,
        month,
        marks: marks.get(employee.userId) ?? [],
        leaves: leaves.get(employee.userId) ?? []
      }),
      bankAccountMasked: maskSensitive(salary.bankAccountNumber),
      bankIfsc: salary.bankIfsc,
      panMasked: maskSensitive(salary.panNumber)
    });
  }

  await payslipRepository.upsertMany(ctx.tenantId, rows, { dbc: tx });
  await payslipRepository.deleteOthers(
    ctx.tenantId,
    run.id,
    rows.map(row => row.userId),
    { dbc: tx }
  );
  await payrollRunRepository.update(
    ctx.tenantId,
    run.id,
    {
      employeeCount: rows.length,
      totalGross: sum(rows.map(row => row.grossPay)),
      totalDeductions: sum(rows.map(row => row.totalDeductions)),
      totalNet: sum(rows.map(row => row.netPay)),
      computedAt: new Date()
    },
    { dbc: tx }
  );
  return { withoutSalary };
};

/* Lock a run that must still be a draft */
const lockDraft = async (ctx, runId, tx, action) => {
  const run = await payrollRunRepository.lockForUpdate(ctx.tenantId, runId, { dbc: tx });
  if (!run) throw notFound("Payroll run");
  if (run.status === "FINALIZED") {
    throw conflict(`Payroll for ${monthLabel(run.month)} is finalized; it can no longer be ${action}`);
  }
  return run;
};

export const payrollRunService = {
  /* A DRAFT run for a month (one per school per month) with every payslip computed */
  create: async (ctx, { month, notes }) => {
    if (month > monthOf(await tenantToday(ctx.tenantId))) {
      throw unprocessable(`Payroll for ${monthLabel(month)} cannot be run yet: the month has not started`);
    }
    if (await payrollRunRepository.exists(ctx.tenantId, [eq(payrollRuns.month, month)])) {
      throw conflict(`A payroll run for ${monthLabel(month)} already exists`);
    }
    const { start, end } = monthBounds(month);
    const { runId, withoutSalary } = await transaction(async tx => {
      const run = await payrollRunRepository.create(
        ctx.tenantId,
        { month, periodStart: start, periodEnd: end, notes, createdBy: ctx.userId },
        { dbc: tx }
      );
      return { runId: run.id, ...(await computeRun(ctx, run, tx)) };
    });
    return { ...(await payrollRunService.getById(ctx, runId)), withoutSalary };
  },

  /* Recompute a draft from current salaries, attendance and leave */
  recalculate: async (ctx, runId) => {
    const { withoutSalary } = await transaction(async tx =>
      computeRun(ctx, await lockDraft(ctx, runId, tx, "recalculated"), tx)
    );
    return { ...(await payrollRunService.getById(ctx, runId)), withoutSalary };
  },

  /* Lock the run: payslips get their numbers and become immutable; employees can see them */
  finalize: async (ctx, runId) => {
    await transaction(async tx => {
      const run = await lockDraft(ctx, runId, tx, "finalized again");
      const slips = await payslipRepository.inRun(ctx.tenantId, runId, { dbc: tx });
      if (!slips.length) throw unprocessable(`Payroll for ${monthLabel(run.month)} has no payslips to finalize`);

      const compact = run.month.replace("-", "");
      for (const slip of slips) {
        const number = await nextCode(ctx.tenantId, `PAYSLIP-${run.month}`, n => `PSL-${compact}-${pad(n, 4)}`, {
          dbc: tx
        });
        await payslipRepository.setNumber(ctx.tenantId, slip.id, number, { dbc: tx });
      }
      await payrollRunRepository.update(
        ctx.tenantId,
        runId,
        { status: "FINALIZED", finalizedBy: ctx.userId, finalizedAt: new Date() },
        { dbc: tx }
      );
    });
    return payrollRunService.getById(ctx, runId);
  },

  list: (ctx, { page, limit, status }) =>
    payrollRunRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: [status && eq(payrollRuns.status, status)].filter(Boolean)
    }),

  getById: async (ctx, runId) => {
    const run = await payrollRunRepository.findById(ctx.tenantId, runId);
    if (!run) throw notFound("Payroll run");
    return { ...run, monthLabel: monthLabel(run.month) };
  },

  payslips: async (ctx, runId, { page, limit }) => {
    await payrollRunService.getById(ctx, runId);
    return payslipRepository.list(ctx.tenantId, { page, limit, conditions: [eq(payslips.runId, runId)] });
  }
};
