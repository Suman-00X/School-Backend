import { created, ok, paginated } from "../../../../common/http/responses.js";
import { formatAmount } from "../../shared/utils/circulation.util.js";
import { fineService } from "../services/fine.service.js";
import { loanService } from "../services/loan.service.js";

const book = loan => `${loan.book.title} (${loan.copy.accessionNumber})`;

const fineNote = loan => (loan.fineOutstanding > 0 ? `Fine due: ${formatAmount(loan.fineOutstanding)}` : "No fine due");

const issueMessage = loan =>
  `${book(loan)} issued to ${loan.borrower.name}. Due ${loan.dueDate}` +
  (loan.backdateReason ? ` (recorded late: issued on ${loan.issuedOn})` : "") +
  (loan.blockOverrideReason ? ` (block overridden: ${loan.blockOverrideReason})` : "");

const returnMessage = loan => {
  if (loan.status === "LOST") {
    return (
      `${book(loan)} recorded as lost. Fine due: ${formatAmount(loan.fineOutstanding)} ` +
      `(late ${formatAmount(loan.lateFine)} + replacement ${formatAmount(loan.lostCharge)})`
    );
  }
  const damaged = loan.returnCondition === "DAMAGED" ? " damaged" : "";
  return `${book(loan)} returned${damaged} by ${loan.borrower.name}. ${fineNote(loan)}`;
};

const foundMessage = loan => {
  const { reversed, credited, daysLost, refundDays } = loan.found;
  if (reversed > 0) {
    const credit = credited > 0 ? `; ${formatAmount(credited)} already paid is now library credit` : "";
    return `${book(loan)} found. Replacement charge of ${formatAmount(reversed)} reversed${credit}. ${fineNote(loan)}`;
  }
  return (
    `${book(loan)} found and back in circulation. It was lost ${daysLost} day(s) ago, more than the ` +
    `${refundDays} day(s) allowed, so the replacement charge stands. ${fineNote(loan)}`
  );
};

export const loanController = {
  issue: async (req, res) => {
    const loan = await loanService.issue(req.context, req.body);
    return created(res, loan, issueMessage(loan));
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

  recordFound: async (req, res) => {
    const loan = await loanService.recordFound(req.context, req.params.loanId, req.body);
    return ok(res, loan, foundMessage(loan));
  },

  renew: async (req, res) => {
    const loan = await loanService.renew(req.context, req.params.loanId);
    return ok(res, loan, `Loan renewed. Due ${loan.dueDate} (renewal ${loan.renewalCount})`);
  },

  payFine: async (req, res) => {
    const payment = await fineService.payFine(req.context, req.params.loanId, req.body);
    return created(
      res,
      payment,
      `Fine payment of ${formatAmount(payment.amount)} received. Receipt ${payment.receiptNumber}. ` +
        `Outstanding ${formatAmount(payment.loan.fineOutstanding)}`
    );
  },

  waiveFine: async (req, res) => {
    const waiver = await fineService.waiveFine(req.context, req.params.loanId, req.body);
    return created(
      res,
      waiver,
      `Fine of ${formatAmount(waiver.amount)} waived for ${waiver.loan.book.title}. ` +
        `Outstanding ${formatAmount(waiver.loan.fineOutstanding)}`
    );
  },

  account: async (req, res) => {
    const account = await fineService.account(req.context, req.params.userId);
    return ok(res, account, `Library account of ${account.borrower.name}`);
  },

  myFines: async (req, res) =>
    ok(res, await fineService.myAccounts(req.context), "Library accounts retrieved successfully")
};
