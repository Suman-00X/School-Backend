import { desc, eq } from "drizzle-orm";
import { sum, toMinor } from "../../../../common/money/money.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { daysBetween } from "../../../../common/utils/date.util.js";
import { libraryPolicyService } from "../../policy/index.js";
import { borrowers } from "../../shared/services/borrowers.service.js";
import { formatAmount, plural } from "../../shared/utils/circulation.util.js";
import { libraryCreditEntries } from "../models/loan.schema.js";
import { creditRepository, finePaymentRepository, loanRepository } from "../repositories/loan.repository.js";
import { loanView } from "./loanView.service.js";

/* A borrower's standing: what is out, what is overdue, what is owed (late fines
   as of today), library credit, and whether the policy blocks new loans */
const standingOf = async (ctx, userId, { dbc, today, policy }) => {
  const loans = await loanRepository.findStanding(ctx.tenantId, userId, { dbc });
  const accrue = await loanView.accrualFor(ctx, loans, today, { policy, dbc });
  const live = loans.map(accrue);
  const open = live.filter(loan => loan.status === "ISSUED");
  return {
    loans: live,
    open,
    overdue: open.filter(loan => loan.dueDate < today),
    finesOutstanding: sum(live.map(loan => loan.fineOutstanding)),
    credit: await creditRepository.balanceOf(ctx.tenantId, userId, { dbc })
  };
};

const blocksOf = (name, standing, policy, today) => {
  const blocks = [];
  if (policy.blockOnOverdue && standing.overdue.length) {
    const [first] = standing.overdue;
    const others = standing.overdue.length - 1;
    blocks.push({
      reason: "OVERDUE",
      message:
        `${name} has ${plural(standing.overdue.length, "overdue item")} (${first.book.title}, due ${first.dueDate}, ` +
        `${daysBetween(first.dueDate, today)} day(s) late${others ? `, and ${others} more` : ""}); return them first`
    });
  }
  const threshold = policy.fineBlockThreshold;
  if (threshold !== null && toMinor(standing.finesOutstanding) > toMinor(threshold)) {
    blocks.push({
      reason: "FINES",
      message:
        `${name} owes ${formatAmount(standing.finesOutstanding)} in library fines, ` +
        `above the limit of ${formatAmount(threshold)}; collect a payment first`
    });
  }
  return blocks;
};

export const loanStanding = {
  /* For issue (inside its transaction, with the borrower locked) -> [{ reason, message }] */
  blocks: async (ctx, borrower, { dbc, today, policy }) =>
    blocksOf(borrower.name, await standingOf(ctx, borrower.id, { dbc, today, policy }), policy, today),

  /* A borrower's library account, for the desk and for self-service */
  account: async (ctx, userId) => {
    const [today, policy, borrower] = await Promise.all([
      tenantToday(ctx.tenantId),
      libraryPolicyService.get(ctx),
      borrowers.describe(ctx, userId)
    ]);
    const standing = await standingOf(ctx, userId, { today, policy });
    const blocks = blocksOf(borrower.name, standing, policy, today);
    const [payments, credits] = await Promise.all([
      finePaymentRepository.findForBorrower(ctx.tenantId, userId),
      creditRepository.findMany(ctx.tenantId, {
        conditions: [eq(libraryCreditEntries.borrowerUserId, userId)],
        orderBy: desc(libraryCreditEntries.createdAt)
      })
    ]);
    return {
      borrower,
      openLoans: standing.open.length,
      overdueLoans: standing.overdue.length,
      finesOutstanding: standing.finesOutstanding,
      credit: standing.credit,
      canBorrow: blocks.length === 0,
      blocks,
      loansWithFines: standing.loans
        .filter(loan => toMinor(loan.fineOutstanding) > 0)
        .map(loan => ({
          loanId: loan.id,
          title: loan.book.title,
          accessionNumber: loan.copy.accessionNumber,
          status: loan.status,
          dueDate: loan.dueDate,
          lateFine: loan.lateFine,
          lostCharge: loan.lostCharge,
          damageCharge: loan.damageCharge,
          finePaid: loan.finePaid,
          fineWaived: loan.fineWaived,
          fineOutstanding: loan.fineOutstanding
        })),
      payments,
      credits
    };
  }
};
