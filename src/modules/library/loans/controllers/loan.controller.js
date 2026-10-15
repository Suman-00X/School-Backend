import { created, ok, paginated } from "../../../../common/http/responses.js";
import { formatAmount } from "../../shared/utils/circulation.util.js";
import { loanService } from "../services/loan.service.js";

const fineNote = loan => (loan.fineTotal > 0 ? `Fine due: ${formatAmount(loan.fineOutstanding)}` : "No fine");

const returnMessage = loan => {
  const book = `${loan.book.title} (${loan.copy.accessionNumber})`;
  if (loan.status === "LOST") {
    return (
      `${book} recorded as lost. Fine due: ${formatAmount(loan.fineOutstanding)} ` +
      `(late ${formatAmount(loan.lateFine)} + replacement ${formatAmount(loan.lostCharge)})`
    );
  }
  const damaged = loan.returnCondition === "DAMAGED" ? " damaged" : "";
  return `${book} returned${damaged} by ${loan.borrower.name}. ${fineNote(loan)}`;
};

export const loanController = {
  issue: async (req, res) => {
    const loan = await loanService.issue(req.context, req.body);
    return created(
      res,
      loan,
      `${loan.book.title} (${loan.copy.accessionNumber}) issued to ${loan.borrower.name}. Due ${loan.dueDate}`
    );
  },

  list: async (req, res) =>
    paginated(res, await loanService.list(req.context, req.query), "Loans retrieved successfully"),

  myLoans: async (req, res) =>
    paginated(res, await loanService.myLoans(req.context, req.query), "Loans retrieved successfully"),

  getById: async (req, res) =>
    ok(res, await loanService.getById(req.context, req.params.loanId), "Loan retrieved successfully"),

  returnLoan: async (req, res) => {
    const loan = await loanService.returnLoan(req.context, req.params.loanId, req.body);
    return ok(res, loan, returnMessage(loan));
  },

  renew: async (req, res) => {
    const loan = await loanService.renew(req.context, req.params.loanId);
    return ok(res, loan, `Loan renewed. Due ${loan.dueDate} (renewal ${loan.renewalCount})`);
  },

  payFine: async (req, res) => {
    const payment = await loanService.payFine(req.context, req.params.loanId, req.body);
    return created(
      res,
      payment,
      `Fine payment of ${formatAmount(payment.amount)} received. Receipt ${payment.receiptNumber}. ` +
        `Outstanding ${formatAmount(payment.loan.fineOutstanding)}`
    );
  },

  waiveFine: async (req, res) => {
    const loan = await loanService.waiveFine(req.context, req.params.loanId, req.body);
    return ok(res, loan, `Fine of ${formatAmount(loan.fineWaived)} waived for ${loan.book.title}`);
  }
};
