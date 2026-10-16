import { unprocessable } from "../../../../common/http/errors.js";
import { fromMinor, toMinor } from "../../../../common/money/money.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { FEE_INCOME_KEY } from "../../shared/constants/finance.constants.js";
import { ledgerReportRepository as reports } from "../repositories/ledger.repository.js";
import { ledgerAccountService as chart, normalSign } from "./account.service.js";

const summary = account => ({
  accountId: account.id,
  code: account.code,
  name: account.name,
  accountType: account.accountType,
  isContra: account.isContra
});

const sumMinor = rows => rows.reduce((total, row) => total + row, 0);

/* Reports over the journal: trial balance, an account's ledger, income for a period */
export const ledgerReportService = {
  /* Every account's balance on a date, in the debit or the credit column. Balanced books
     have equal columns. */
  trialBalance: async (ctx, { asOf } = {}) => {
    const date = asOf ?? (await tenantToday(ctx.tenantId));
    const [accounts, turnover] = await Promise.all([chart.all(ctx), reports.turnover(ctx.tenantId, { to: date })]);
    const byAccount = new Map(turnover.map(row => [row.accountId, row]));
    const rows = accounts
      .map(account => {
        const moved = byAccount.get(account.id);
        const netMinor = moved ? toMinor(moved.debit) - toMinor(moved.credit) : 0;
        return {
          ...summary(account),
          debit: netMinor > 0 ? fromMinor(netMinor) : 0,
          credit: netMinor < 0 ? fromMinor(-netMinor) : 0
        };
      })
      .filter(row => row.debit || row.credit);
    const debit = sumMinor(rows.map(row => toMinor(row.debit)));
    const credit = sumMinor(rows.map(row => toMinor(row.credit)));
    return {
      asOf: date,
      accounts: rows,
      totals: { debit: fromMinor(debit), credit: fromMinor(credit) },
      balanced: debit === credit
    };
  },

  /* One account's lines in a period with the balance after each, in the account's normal
     direction (an asset's balance grows with debits, income's with credits) */
  accountLedger: async (ctx, accountId, { from, to, studentId, page, limit }) => {
    const account = await chart.getById(ctx, accountId);
    const until = to ?? (await tenantToday(ctx.tenantId));
    const since = from ?? "1900-01-01";
    if (since > until) throw unprocessable("from must be on or before to");
    const sign = normalSign(account);
    const openingMinor = toMinor(await reports.netBefore(ctx.tenantId, accountId, since, { studentId }));
    const { rows, totals, meta } = await reports.accountLines(ctx.tenantId, accountId, {
      from: since,
      to: until,
      studentId,
      page,
      limit
    });
    const balance = minor => fromMinor(sign * minor);
    return {
      rows: rows.map(({ running, ...row }) => ({ ...row, balance: balance(openingMinor + toMinor(running)) })),
      meta: {
        ...meta,
        account: { ...summary(account), normalBalance: account.normalBalance },
        from: from ?? null,
        to: until,
        openingBalance: balance(openingMinor),
        debits: totals.debit,
        credits: totals.credit,
        closingBalance: balance(openingMinor + toMinor(totals.debit) - toMinor(totals.credit))
      }
    };
  },

  /* Income and expense accounts over a period: fee income by fee head, late fees,
     concessions (which reduce income), the school's own income and expense accounts */
  incomeSummary: async (ctx, { from, to }) => {
    if (from > to) throw unprocessable("from must be on or before to");
    const [accounts, turnover] = await Promise.all([chart.all(ctx), reports.turnover(ctx.tenantId, { from, to })]);
    const byAccount = new Map(turnover.map(row => [row.accountId, row]));
    /* Earned (credit - debit) for income, spent (debit - credit) for expenses */
    const lines = accounts
      .filter(account => ["INCOME", "EXPENSE"].includes(account.accountType))
      .map(account => {
        const moved = byAccount.get(account.id);
        const creditMinor = moved ? toMinor(moved.credit) - toMinor(moved.debit) : 0;
        return { account, minor: account.accountType === "INCOME" ? creditMinor : -creditMinor };
      })
      .filter(line => line.minor !== 0);
    const of = test => lines.filter(line => test(line.account));
    const total = rows => fromMinor(sumMinor(rows.map(row => row.minor)));
    const listed = rows => rows.map(row => ({ ...summary(row.account), amount: fromMinor(row.minor) }));

    const feeIncome = of(a => a.systemKey === FEE_INCOME_KEY);
    const lateFees = of(a => a.systemKey === "LATE_FEE_INCOME");
    const concessions = of(a => a.systemKey === "CONCESSIONS");
    const otherIncome = of(
      a => a.accountType === "INCOME" && !["FEE_INCOME", "LATE_FEE_INCOME", "CONCESSIONS"].includes(a.systemKey)
    );
    const expenses = of(a => a.accountType === "EXPENSE");
    const incomeMinor = sumMinor(lines.filter(l => l.account.accountType === "INCOME").map(l => l.minor));
    const expenseMinor = sumMinor(expenses.map(l => l.minor));

    return {
      from,
      to,
      feeIncome: { byFeeHead: listed(feeIncome), total: total(feeIncome) },
      lateFees: total(lateFees),
      /* Shown as a negative: it reduces income */
      concessions: total(concessions),
      otherIncome: { accounts: listed(otherIncome), total: total(otherIncome) },
      netIncome: fromMinor(incomeMinor),
      expenses: { accounts: listed(expenses), total: fromMinor(expenseMinor) },
      surplus: fromMinor(incomeMinor - expenseMinor)
    };
  }
};
