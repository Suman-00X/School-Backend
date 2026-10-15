import { sql } from "drizzle-orm";
import { check, integer, pgTable, uniqueIndex } from "drizzle-orm/pg-core";
import { baseColumns } from "../../../../common/database/columns.js";
import { DEFAULT_POLICY } from "../../shared/constants/library.constants.js";
import { money } from "../../shared/models/money.columns.js";

/* Lending rules: one row per school, created with the defaults on first read */
export const libraryPolicies = pgTable(
  "library_policies",
  {
    ...baseColumns(),
    studentLoanDays: integer("student_loan_days").notNull().default(DEFAULT_POLICY.studentLoanDays),
    staffLoanDays: integer("staff_loan_days").notNull().default(DEFAULT_POLICY.staffLoanDays),
    maxActiveLoansStudent: integer("max_active_loans_student").notNull().default(DEFAULT_POLICY.maxActiveLoansStudent),
    maxActiveLoansStaff: integer("max_active_loans_staff").notNull().default(DEFAULT_POLICY.maxActiveLoansStaff),
    maxRenewals: integer("max_renewals").notNull().default(DEFAULT_POLICY.maxRenewals),
    finePerDay: money("fine_per_day").notNull().default(DEFAULT_POLICY.finePerDay),
    fineGraceDays: integer("fine_grace_days").notNull().default(DEFAULT_POLICY.fineGraceDays)
  },
  t => [
    uniqueIndex("library_policies_tenant_uq").on(t.tenantId),
    check("library_policies_loan_days_chk", sql`${t.studentLoanDays} > 0 AND ${t.staffLoanDays} > 0`),
    check(
      "library_policies_limits_chk",
      sql`${t.maxActiveLoansStudent} >= 0 AND ${t.maxActiveLoansStaff} >= 0 AND ${t.maxRenewals} >= 0`
    ),
    check("library_policies_fine_chk", sql`${t.finePerDay} >= 0 AND ${t.fineGraceDays} >= 0`)
  ]
);
