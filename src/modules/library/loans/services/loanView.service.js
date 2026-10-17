import { fromMinor, max, toMinor } from "../../../../common/money/money.js";
import { addDays, daysBetween } from "../../../../common/utils/date.util.js";
import { libraryPolicyService } from "../../policy/index.js";
import { loadLibraryCalendar } from "../../shared/services/libraryCalendar.service.js";
import { fullName, lateFineFor, outstandingOf } from "../../shared/utils/circulation.util.js";

/* Late fines accrue daily while a book is out. The stored late_fine is brought up
   to date by payments, waivers, the nightly job and the return; reads show the
   fine as of today, computed on the loan's own terms and the school calendar. */

/* One calendar covering every open overdue loan in `loans` (null when none is late) */
const calendarFor = async (ctx, loans, onDate) => {
  const dues = loans.filter(loan => loan.status === "ISSUED" && loan.dueDate < onDate).map(loan => loan.dueDate);
  if (!dues.length) return null;
  const earliest = dues.reduce((a, b) => (a < b ? a : b));
  return loadLibraryCalendar(ctx, addDays(earliest, 1), onDate);
};

/* An open loan's late fine on `onDate` (never below what was already recorded) */
const lateFineOn = (loan, onDate, { policy, calendar }) => {
  if (loan.status !== "ISSUED" || loan.dueDate >= onDate) return loan.lateFine;
  const days = calendar.lateDays(loan.dueDate, onDate, { basis: policy.fineDayBasis });
  return max(lateFineFor(loan, days), loan.lateFine);
};

export const loanView = {
  /* -> (loan) => the loan with its late fine as of onDate; one calendar load for all */
  accrualFor: async (ctx, loans, onDate, { policy, dbc } = {}) => {
    const settings = { policy: policy ?? (await libraryPolicyService.get(ctx, { dbc })) };
    settings.calendar = await calendarFor(ctx, loans, onDate);
    return loan => {
      const lateFine = lateFineOn(loan, onDate, settings);
      const live = { ...loan, lateFine };
      return { ...live, fineOutstanding: outstandingOf(live) };
    };
  },

  /* API view: live fine, totals and overdue state */
  presentAll: async (ctx, loans, today) => {
    const accrue = await loanView.accrualFor(ctx, loans, today);
    return loans.map(loan => {
      const live = accrue(loan);
      const isOpen = loan.status === "ISSUED";
      const daysOverdue = isOpen ? Math.max(0, daysBetween(loan.dueDate, today)) : 0;
      return {
        ...live,
        borrower: loan.borrower && { ...loan.borrower, name: fullName(loan.borrower) },
        fineTotal: fromMinor(toMinor(live.lateFine) + toMinor(live.lostCharge) + toMinor(live.damageCharge)),
        /* While the book is out the late fine still grows */
        fineIsFinal: !isOpen,
        isOverdue: daysOverdue > 0,
        daysOverdue
      };
    });
  }
};
