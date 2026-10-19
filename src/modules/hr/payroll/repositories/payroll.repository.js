import { describeDuplicates } from "../../../../common/database/duplicates.js";
import { and, asc, desc, eq, notInArray, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import {
  employeeSalaries,
  employeeSalaryLines,
  payrollRuns,
  payslips,
  salaryComponents
} from "../models/payroll.schema.js";

const excluded = column => sql.raw(`excluded."${column.name}"`);

export const salaryComponentRepository = createRepository({
  table: salaryComponents,
  queryKey: "salaryComponents",
  orderBy: [asc(salaryComponents.kind), asc(salaryComponents.code)]
});

export const employeeSalaryRepository = {
  ...createRepository({
    table: employeeSalaries,
    queryKey: "employeeSalaries",
    orderBy: [desc(employeeSalaries.effectiveFrom), desc(employeeSalaries.createdAt)]
  }),

  insertLines: (tenantId, salaryId, lines, { dbc = db } = {}) =>
    lines.length ? dbc.insert(employeeSalaryLines).values(lines.map(line => ({ ...line, salaryId, tenantId }))) : null,

  /* Revisions using a component -> count */
  countUsingComponent: async (tenantId, componentId) => {
    const [row] = await db
      .select({ revisions: sql`count(distinct ${employeeSalaryLines.salaryId})`.mapWith(Number) })
      .from(employeeSalaryLines)
      .innerJoin(employeeSalaries, eq(employeeSalaries.id, employeeSalaryLines.salaryId))
      .where(
        and(
          scoped(employeeSalaryLines, tenantId, eq(employeeSalaryLines.componentId, componentId)),
          eq(employeeSalaries.isActive, true)
        )
      );
    return row?.revisions ?? 0;
  }
};

export const payrollRunRepository = {
  ...createRepository({ table: payrollRuns, queryKey: "payrollRuns", orderBy: desc(payrollRuns.month) }),

  /* Lock a run for the rest of the transaction (recalculation, finalization) */
  lockForUpdate: async (tenantId, runId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(payrollRuns)
      .where(scoped(payrollRuns, tenantId, eq(payrollRuns.id, runId)))
      .for("update");
    return row ?? null;
  }
};

export const payslipRepository = {
  ...createRepository({
    table: payslips,
    queryKey: "payslips",
    orderBy: [asc(payslips.employeeName), asc(payslips.userId)]
  }),

  /* Write a run's payslips: one per employee, ids kept stable across recalculations */
  upsertMany: (tenantId, rows, { dbc }) =>
    rows.length
      ? dbc
          .insert(payslips)
          .values(rows.map(row => ({ ...row, tenantId, isActive: true })))
          .onConflictDoUpdate({
            target: [payslips.runId, payslips.userId],
            set: Object.fromEntries(
              [
                "salaryId",
                "employeeName",
                "employeeCode",
                "role",
                "designation",
                "daysInMonth",
                "paidDays",
                "lopDays",
                "attendance",
                "monthlyBasic",
                "earnings",
                "deductions",
                "totalEarnings",
                "lopAmount",
                "grossPay",
                "totalDeductions",
                "netPay",
                "bankAccountMasked",
                "bankIfsc",
                "panMasked"
              ]
                .map(key => [key, excluded(payslips[key])])
                .concat([
                  ["isActive", true],
                  ["updatedAt", new Date()]
                ])
            )
          })
      : null,

  /* Remove a draft run's payslips for employees no longer paid in it */
  deleteOthers: (tenantId, runId, keepUserIds, { dbc }) =>
    dbc
      .delete(payslips)
      .where(
        and(
          eq(payslips.tenantId, tenantId),
          eq(payslips.runId, runId),
          keepUserIds.length ? notInArray(payslips.userId, keepUserIds) : undefined
        )
      ),

  /* Ids of the tenant's finalized runs (as a subquery) */
  finalizedRunIds: tenantId =>
    db
      .select({ id: payrollRuns.id })
      .from(payrollRuns)
      .where(scoped(payrollRuns, tenantId, eq(payrollRuns.status, "FINALIZED"))),

  setNumber: (tenantId, payslipId, payslipNumber, { dbc }) =>
    dbc
      .update(payslips)
      .set({ payslipNumber })
      .where(and(eq(payslips.tenantId, tenantId), eq(payslips.id, payslipId))),

  inRun: (tenantId, runId, { dbc = db } = {}) =>
    dbc
      .select({ id: payslips.id, userId: payslips.userId })
      .from(payslips)
      .where(scoped(payslips, tenantId, eq(payslips.runId, runId)))
      .orderBy(asc(payslips.employeeName), asc(payslips.userId))
};

describeDuplicates({
  salary_components_tenant_code_uq: ({ code }) => `A salary component with code ${code} already exists`
});
