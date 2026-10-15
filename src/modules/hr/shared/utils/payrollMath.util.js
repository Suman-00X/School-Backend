import { fromMinor, percentOf, sum, toMinor } from "../../../../common/money/money.js";
import { eachDay, maxDate, minDate } from "../../../../common/utils/date.util.js";
import { STAFF_ATTENDANCE_STATUSES } from "../constants/hr.constants.js";

/* Pure payroll arithmetic (exact, in minor units via common/money) */

/* A salary line's amount for the month: a fixed amount, or a percent of basic */
export const lineAmount = (monthlyBasic, calculation, value) =>
  calculation === "PERCENT_OF_BASIC" ? percentOf(monthlyBasic, value) : value;

/* How much of each day approved leave covers: date -> { paid, unpaid } (0, 0.5 or 1) */
export const leaveCoverage = (leaves, start, end) => {
  const cover = new Map();
  for (const { request, leaveType } of leaves) {
    const share = request.halfDay ? 0.5 : 1;
    const key = leaveType.isPaid ? "paid" : "unpaid";
    for (const day of eachDay(maxDate(request.fromDate, start), minDate(request.toDate, end))) {
      const entry = cover.get(day) ?? { paid: 0, unpaid: 0 };
      entry[key] = Math.min(1, entry[key] + share);
      cover.set(day, entry);
    }
  }
  return cover;
};

const ATTENDED = { PRESENT: 1, ON_DUTY: 1, HALF_DAY: 0.5, ABSENT: 0 };

/* Loss-of-pay share of one marked day:
   - ABSENT / HALF_DAY: the part not worked, less what approved paid leave covers
   - LEAVE: whatever approved unpaid leave covers (a LEAVE mark under paid leave costs nothing)
   - PRESENT / ON_DUTY: nothing */
export const lopForDay = (status, cover = { paid: 0, unpaid: 0 }) => {
  if (status === "ABSENT" || status === "HALF_DAY") return Math.max(0, 1 - ATTENDED[status] - cover.paid);
  if (status === "LEAVE") return Math.min(cover.unpaid, 1 - cover.paid);
  return 0;
};

/* One employee's payslip figures for a month.
   salary: { monthlyBasic, lines: [{ componentId, value, component: { code, name, kind, calculation } }] }
   month:  { start, end, days }    marks: [{ date, status }]    leaves: [{ request, leaveType }] */
export const computePayslip = ({ salary, month, marks, leaves }) => {
  const basic = salary.monthlyBasic;
  const lines = [...salary.lines]
    .sort((a, b) => a.component.code.localeCompare(b.component.code))
    .map(line => ({
      componentId: line.componentId,
      code: line.component.code,
      name: line.component.name,
      kind: line.component.kind,
      calculation: line.component.calculation,
      value: line.value,
      amount: lineAmount(basic, line.component.calculation, line.value)
    }));
  const earnings = [
    {
      componentId: null,
      code: "BASIC",
      name: "Basic",
      kind: "EARNING",
      calculation: "FIXED",
      value: basic,
      amount: basic
    },
    ...lines.filter(line => line.kind === "EARNING")
  ];
  const deductions = lines.filter(line => line.kind === "DEDUCTION");

  const cover = leaveCoverage(leaves, month.start, month.end);
  const attendance = Object.fromEntries(STAFF_ATTENDANCE_STATUSES.map(status => [status, 0]));
  let lopDays = 0;
  for (const mark of marks) {
    attendance[mark.status]++;
    lopDays += lopForDay(mark.status, cover.get(mark.date));
  }
  lopDays = Math.min(lopDays, month.days);

  /* Loss of pay = monthly earnings / days in the month × LOP days, rounded to the paisa */
  const totalEarnings = sum(earnings.map(line => line.amount));
  const lopMinor = Math.min(toMinor(totalEarnings), Math.round((toMinor(totalEarnings) * lopDays) / month.days));
  const grossMinor = toMinor(totalEarnings) - lopMinor;
  const totalDeductions = sum(deductions.map(line => line.amount));

  return {
    daysInMonth: month.days,
    lopDays,
    paidDays: month.days - lopDays,
    attendance,
    monthlyBasic: basic,
    earnings,
    deductions,
    totalEarnings,
    lopAmount: fromMinor(lopMinor),
    grossPay: fromMinor(grossMinor),
    totalDeductions,
    /* Never negative: deductions beyond gross pay are not carried as a debt */
    netPay: fromMinor(Math.max(0, grossMinor - toMinor(totalDeductions)))
  };
};
