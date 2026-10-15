import { ROLES } from "../../../../common/auth/roles.js";
import { fromMinor, toMinor } from "../../../../common/money/money.js";
import { daysBetween } from "../../../../common/utils/date.util.js";

/* Students and staff borrow on different terms */
const isStudent = role => role === ROLES.STUDENT;

export const loanDaysFor = (policy, role) => (isStudent(role) ? policy.studentLoanDays : policy.staffLoanDays);

export const maxActiveLoansFor = (policy, role) =>
  isStudent(role) ? policy.maxActiveLoansStudent : policy.maxActiveLoansStaff;

/* Whole days past the due date on `onDate` (0 when not late) */
export const daysLate = (dueDate, onDate) => Math.max(0, daysBetween(dueDate, onDate));

/* max(0, daysLate - graceDays) x finePerDay, in exact money arithmetic */
export const lateFineFor = (policy, dueDate, onDate) => {
  const chargeableDays = Math.max(0, daysLate(dueDate, onDate) - policy.fineGraceDays);
  return fromMinor(chargeableDays * toMinor(policy.finePerDay));
};

/* "Asha Rao" */
export const fullName = user => [user?.firstName, user?.lastName].filter(Boolean).join(" ");

/* 12 -> "12.00" for messages */
export const formatAmount = amount => Number(amount ?? 0).toFixed(2);
