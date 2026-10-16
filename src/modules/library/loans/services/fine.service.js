import { transaction } from "../../../../common/database/postgres.js";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { fromMinor, toMinor } from "../../../../common/money/money.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { borrowers } from "../../shared/services/borrowers.service.js";
import { nextFineReceiptNumber } from "../../shared/utils/codes.util.js";
import { formatAmount, outstandingOf } from "../../shared/utils/circulation.util.js";
import { lockBorrower } from "../../shared/utils/locks.util.js";
import {
  creditRepository,
  finePaymentRepository,
  fineWaiverRepository,
  loanRepository
} from "../repositories/loan.repository.js";
import { loanService } from "./loan.service.js";
import { loanStanding } from "./loanStanding.service.js";
import { loanView } from "./loanView.service.js";

/* Fines can be paid or waived at any time, also while the book is out: the late
   fine is first brought up to today, and only what has accrued can be settled. */
const lockForSettlement = async (ctx, loanId, dbc) => {
  const found = await loanRepository.findById(ctx.tenantId, loanId, { dbc });
  if (!found) throw notFound("Loan");
  /* Borrower before loan: the lock order shared with issues */
  await lockBorrower(ctx.tenantId, found.borrowerUserId, { dbc });
  const loan = await loanRepository.lockForUpdate(ctx.tenantId, loanId, { dbc });
  const today = await tenantToday(ctx.tenantId);
  const accrue = await loanView.accrualFor(ctx, [loan], today, { dbc });
  const { lateFine } = accrue(loan);
  const current = toMinor(lateFine) === toMinor(loan.lateFine) ? loan : { ...loan, lateFine };
  const outstanding = outstandingOf(current);
  if (toMinor(outstanding) <= 0) {
    throw unprocessable(
      loan.status === "ISSUED" ? "No fine has accrued on this loan so far" : "This loan has no outstanding fine"
    );
  }
  return { loan: current, outstanding };
};

export const fineService = {
  /* Part or all of what is owed so far, with a receipt. LIBRARY_CREDIT draws on the
     borrower's library credit. */
  payFine: async (ctx, loanId, { amount, method, reference }) => {
    const paymentId = await transaction(async tx => {
      const { loan, outstanding } = await lockForSettlement(ctx, loanId, tx);
      if (toMinor(amount) > toMinor(outstanding)) {
        throw unprocessable(`The amount exceeds the outstanding fine of ${formatAmount(outstanding)}`);
      }
      if (method === "LIBRARY_CREDIT") {
        const credit = await creditRepository.balanceOf(ctx.tenantId, loan.borrowerUserId, { dbc: tx });
        if (toMinor(amount) > toMinor(credit)) {
          throw unprocessable(
            `The borrower has ${formatAmount(credit)} in library credit, less than ${formatAmount(amount)}`
          );
        }
      }
      const payment = await finePaymentRepository.create(
        ctx.tenantId,
        {
          loanId,
          amount,
          method,
          reference,
          receiptNumber: await nextFineReceiptNumber(ctx.tenantId, { dbc: tx }),
          receivedBy: ctx.userId
        },
        { dbc: tx }
      );
      if (method === "LIBRARY_CREDIT") {
        await creditRepository.create(
          ctx.tenantId,
          {
            borrowerUserId: loan.borrowerUserId,
            amount: -amount,
            reason: `Fine paid from credit (receipt ${payment.receiptNumber})`,
            loanId,
            paymentId: payment.id,
            createdBy: ctx.userId
          },
          { dbc: tx }
        );
      }
      await loanRepository.update(
        ctx.tenantId,
        loanId,
        { lateFine: loan.lateFine, finePaid: fromMinor(toMinor(loan.finePaid) + toMinor(amount)) },
        { dbc: tx }
      );
      return payment.id;
    });
    const payment = await finePaymentRepository.findById(ctx.tenantId, paymentId);
    return { ...payment, loan: await loanService.getById(ctx, loanId) };
  },

  /* Forgive part (amount) or all (no amount) of what is owed so far, with a reason */
  waiveFine: async (ctx, loanId, { amount, reason }) => {
    const waiverId = await transaction(async tx => {
      const { loan, outstanding } = await lockForSettlement(ctx, loanId, tx);
      const waived = amount ?? outstanding;
      if (toMinor(waived) > toMinor(outstanding)) {
        throw unprocessable(`The amount exceeds the outstanding fine of ${formatAmount(outstanding)}`);
      }
      const waiver = await fineWaiverRepository.create(
        ctx.tenantId,
        { loanId, amount: waived, reason, waivedBy: ctx.userId },
        { dbc: tx }
      );
      await loanRepository.update(
        ctx.tenantId,
        loanId,
        { lateFine: loan.lateFine, fineWaived: fromMinor(toMinor(loan.fineWaived) + toMinor(waived)) },
        { dbc: tx }
      );
      return waiver.id;
    });
    const waiver = await fineWaiverRepository.findById(ctx.tenantId, waiverId);
    return { ...waiver, loan: await loanService.getById(ctx, loanId) };
  },

  /* The desk's view of a borrower: loans out, overdue, fines, credit, blocks */
  account: (ctx, userId) => loanStanding.account(ctx, userId),

  /* Self-service: your account (a parent: each child's) */
  myAccounts: async ctx =>
    Promise.all((await borrowers.visibleTo(ctx)).map(userId => loanStanding.account(ctx, userId)))
};
