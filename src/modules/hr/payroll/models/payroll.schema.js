import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import {
  PAYROLL_RUN_STATUSES,
  SALARY_CALCULATIONS,
  SALARY_COMPONENT_KINDS
} from "../../shared/constants/hr.constants.js";
import { dayCount, money } from "../../shared/models/money.columns.js";

export const salaryComponentKind = pgEnum("salary_component_kind", SALARY_COMPONENT_KINDS);
export const salaryCalculation = pgEnum("salary_calculation", SALARY_CALCULATIONS);
export const payrollRunStatus = pgEnum("payroll_run_status", PAYROLL_RUN_STATUSES);

/* Building blocks of a salary: HRA (40% of basic), Transport (1600), PF (12% of basic)… */
export const salaryComponents = pgTable(
  "salary_components",
  {
    ...baseColumns(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: salaryComponentKind("kind").notNull(),
    calculation: salaryCalculation("calculation").notNull(),
    /* An amount (FIXED) or a percent of basic (PERCENT_OF_BASIC) */
    defaultValue: money("default_value").notNull().default(0),
    description: text("description")
  },
  t => [
    uniqueIndex("salary_components_tenant_code_uq").on(t.tenantId, t.code).where(activeRows(t)),
    check(
      "salary_components_value_chk",
      sql`${t.defaultValue} >= 0 AND (${t.calculation} <> 'PERCENT_OF_BASIC' OR ${t.defaultValue} <= 100)`
    )
  ]
);

/* One revision of an employee's salary, effective from the first day of a month.
   The latest revision effective on or before a payroll month applies to it. */
export const employeeSalaries = pgTable(
  "employee_salaries",
  {
    ...baseColumns(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    effectiveFrom: date("effective_from").notNull(),
    monthlyBasic: money("monthly_basic").notNull(),
    /* Returned masked (last 4 characters only) */
    bankAccountNumber: text("bank_account_number"),
    bankIfsc: text("bank_ifsc"),
    panNumber: text("pan_number"),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id)
  },
  t => [
    uniqueIndex("employee_salaries_user_effective_uq").on(t.tenantId, t.userId, t.effectiveFrom).where(activeRows(t)),
    check("employee_salaries_basic_chk", sql`${t.monthlyBasic} >= 0`),
    check("employee_salaries_month_start_chk", sql`extract(day from ${t.effectiveFrom}) = 1`)
  ]
);

/* Components of a revision: an amount or a percent, per the component's calculation */
export const employeeSalaryLines = pgTable(
  "employee_salary_lines",
  {
    ...baseColumns(),
    salaryId: uuid("salary_id")
      .notNull()
      .references(() => employeeSalaries.id),
    componentId: uuid("component_id")
      .notNull()
      .references(() => salaryComponents.id),
    value: money("value").notNull()
  },
  t => [
    uniqueIndex("employee_salary_lines_component_uq").on(t.salaryId, t.componentId),
    index("employee_salary_lines_component_idx").on(t.componentId),
    check("employee_salary_lines_value_chk", sql`${t.value} >= 0`)
  ]
);

/* Payroll for one month. DRAFT runs can be recalculated; FINALIZED runs are locked. */
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    ...baseColumns(),
    /* "2026-09" */
    month: text("month").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    status: payrollRunStatus("status").notNull().default("DRAFT"),
    employeeCount: integer("employee_count").notNull().default(0),
    totalGross: money("total_gross").notNull().default(0),
    totalDeductions: money("total_deductions").notNull().default(0),
    totalNet: money("total_net").notNull().default(0),
    computedAt: timestamp("computed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    finalizedBy: uuid("finalized_by").references(() => users.id),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    notes: text("notes")
  },
  t => [
    uniqueIndex("payroll_runs_tenant_month_uq").on(t.tenantId, t.month),
    check("payroll_runs_month_chk", sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("payroll_runs_period_chk", sql`${t.periodEnd} >= ${t.periodStart}`)
  ]
);

/* One employee's pay for a run. Everything is a snapshot (name, salary lines,
   attendance), so later salary or profile changes never alter it. */
export const payslips = pgTable(
  "payslips",
  {
    ...baseColumns(),
    runId: uuid("run_id")
      .notNull()
      .references(() => payrollRuns.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    month: text("month").notNull(),
    /* Assigned when the run is finalized: PSL-202609-0001 */
    payslipNumber: text("payslip_number"),
    salaryId: uuid("salary_id")
      .notNull()
      .references(() => employeeSalaries.id),
    employeeName: text("employee_name").notNull(),
    employeeCode: text("employee_code"),
    role: text("role").notNull(),
    designation: text("designation"),
    daysInMonth: integer("days_in_month").notNull(),
    paidDays: dayCount("paid_days").notNull(),
    lopDays: dayCount("lop_days").notNull(),
    /* { PRESENT, ABSENT, HALF_DAY, LEAVE, ON_DUTY, paidLeaveDays, unpaidLeaveDays } */
    attendance: jsonb("attendance").notNull(),
    monthlyBasic: money("monthly_basic").notNull(),
    /* [{ componentId, code, name, calculation, value, amount }] */
    earnings: jsonb("earnings").notNull(),
    deductions: jsonb("deductions").notNull(),
    totalEarnings: money("total_earnings").notNull(),
    lopAmount: money("lop_amount").notNull(),
    grossPay: money("gross_pay").notNull(),
    totalDeductions: money("total_deductions").notNull(),
    netPay: money("net_pay").notNull(),
    bankAccountMasked: text("bank_account_masked"),
    bankIfsc: text("bank_ifsc"),
    panMasked: text("pan_masked")
  },
  t => [
    /* Also the upsert target of recalculation */
    uniqueIndex("payslips_run_user_uq").on(t.runId, t.userId),
    uniqueIndex("payslips_tenant_number_uq").on(t.tenantId, t.payslipNumber),
    index("payslips_user_idx").on(t.tenantId, t.userId, t.month),
    check("payslips_days_chk", sql`${t.lopDays} >= 0 AND ${t.lopDays} <= ${t.daysInMonth}`),
    check(
      "payslips_amounts_chk",
      sql`${t.totalEarnings} >= 0 AND ${t.lopAmount} >= 0 AND ${t.grossPay} >= 0 AND ${t.totalDeductions} >= 0 AND ${t.netPay} >= 0`
    )
  ]
);

export const salaryComponentsRelations = relations(salaryComponents, ({ many }) => ({
  lines: many(employeeSalaryLines)
}));

export const employeeSalariesRelations = relations(employeeSalaries, ({ many, one }) => ({
  lines: many(employeeSalaryLines),
  user: one(users, { fields: [employeeSalaries.userId], references: [users.id] })
}));

export const employeeSalaryLinesRelations = relations(employeeSalaryLines, ({ one }) => ({
  salary: one(employeeSalaries, { fields: [employeeSalaryLines.salaryId], references: [employeeSalaries.id] }),
  component: one(salaryComponents, { fields: [employeeSalaryLines.componentId], references: [salaryComponents.id] })
}));

export const payrollRunsRelations = relations(payrollRuns, ({ many }) => ({
  payslips: many(payslips)
}));

export const payslipsRelations = relations(payslips, ({ one }) => ({
  run: one(payrollRuns, { fields: [payslips.runId], references: [payrollRuns.id] })
}));
