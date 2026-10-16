import { created, done, ok, paginated } from "../../../../common/http/responses.js";
import { ledgerAccountService } from "../services/account.service.js";
import { ledgerService } from "../services/ledger.service.js";
import { ledgerReportService } from "../services/ledgerReport.service.js";

const amount = value => Number(value).toFixed(2);

export const ledgerController = {
  listAccounts: async (req, res) =>
    paginated(res, await ledgerAccountService.list(req.context, req.query), "Ledger accounts retrieved successfully"),

  createAccount: async (req, res) => {
    const account = await ledgerAccountService.create(req.context, req.body);
    return created(res, account, `Ledger account ${account.code} ${account.name} created`);
  },

  getAccount: async (req, res) =>
    ok(
      res,
      await ledgerAccountService.getById(req.context, req.params.accountId),
      "Ledger account retrieved successfully"
    ),

  updateAccount: async (req, res) => {
    const account = await ledgerAccountService.update(req.context, req.params.accountId, req.body);
    return ok(res, account, `Ledger account ${account.code} ${account.name} updated`);
  },

  removeAccount: async (req, res) => {
    const account = await ledgerAccountService.remove(req.context, req.params.accountId);
    return done(res, `Ledger account ${account.code} ${account.name} removed`);
  },

  accountLedger: async (req, res) => {
    const result = await ledgerReportService.accountLedger(req.context, req.params.accountId, req.query);
    return paginated(
      res,
      result,
      `${result.meta.account.code} ${result.meta.account.name}: closing balance ${amount(result.meta.closingBalance)}`
    );
  },

  listEntries: async (req, res) =>
    paginated(res, await ledgerService.list(req.context, req.query), "Journal entries retrieved successfully"),

  getEntry: async (req, res) =>
    ok(res, await ledgerService.getById(req.context, req.params.entryId), "Journal entry retrieved successfully"),

  createEntry: async (req, res) => {
    const entry = await ledgerService.postManual(req.context, req.body);
    return created(res, entry, `Journal entry ${entry.entryNumber} of ${amount(entry.total)} posted`);
  },

  reverseEntry: async (req, res) => {
    const entry = await ledgerService.reverse(req.context, req.params.entryId, req.body);
    return created(res, entry, `${entry.narration.split(":")[0]} posted as ${entry.entryNumber}`);
  },

  trialBalance: async (req, res) => {
    const result = await ledgerReportService.trialBalance(req.context, req.query);
    return ok(
      res,
      result,
      `Trial balance as of ${result.asOf}: debits ${amount(result.totals.debit)}, credits ${amount(result.totals.credit)}` +
        (result.balanced ? "" : " (NOT BALANCED)")
    );
  },

  incomeSummary: async (req, res) => {
    const result = await ledgerReportService.incomeSummary(req.context, req.query);
    return ok(res, result, `Net income from ${result.from} to ${result.to}: ${amount(result.netIncome)}`);
  }
};
