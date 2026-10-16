import { eq } from "drizzle-orm";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { pad } from "../../../../common/sequences/sequence.service.js";
import { feeHeadService } from "../../fee-heads/index.js";
import {
  CONTROL_ACCOUNT_KEYS,
  DEBIT_NORMAL_TYPES,
  FEE_INCOME_CODE_PREFIX,
  FEE_INCOME_KEY,
  SYSTEM_ACCOUNTS
} from "../../shared/constants/finance.constants.js";
import { ledgerAccounts } from "../models/ledger.schema.js";
import { ledgerAccountRepository as accounts } from "../repositories/ledger.repository.js";

/* System accounts are never removed, so their ids are cached per process */
const systemIds = new Map();
const chartReady = new Set();

/* +1: the account's balance grows with debits; -1: with credits */
export const normalSign = account =>
  (DEBIT_NORMAL_TYPES.includes(account.accountType) ? 1 : -1) * (account.isContra ? -1 : 1);

const view = account =>
  account && {
    ...account,
    isSystem: Boolean(account.systemKey),
    normalBalance: normalSign(account) > 0 ? "DEBIT" : "CREDIT"
  };

/* The fixed system accounts, created once per school (outside any caller's transaction) */
const ensureChart = async tenantId => {
  if (chartReady.has(tenantId)) return;
  await accounts.insertIfMissing(
    Object.entries(SYSTEM_ACCOUNTS).map(([systemKey, account]) => ({ tenantId, systemKey, ...account }))
  );
  chartReady.add(tenantId);
};

/* The next free 41xx code */
const nextFeeIncomeCode = async tenantId => {
  const taken = new Set(await accounts.codesStartingWith(tenantId, FEE_INCOME_CODE_PREFIX));
  for (let n = 1; ; n++) {
    const code = `${FEE_INCOME_CODE_PREFIX}${pad(n, 2)}`;
    if (!taken.has(code)) return code;
  }
};

/* Fee income of one fee head: created on first use */
const feeIncomeAccount = async (tenantId, feeHeadId) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await accounts.findSystem(tenantId, FEE_INCOME_KEY, feeHeadId);
    if (existing) return existing;
    const feeHead = await feeHeadService.findById({ tenantId }, feeHeadId);
    /* A code taken meanwhile inserts nothing; the loop then reads or numbers again */
    await accounts.insertIfMissing([
      {
        tenantId,
        systemKey: FEE_INCOME_KEY,
        feeHeadId,
        code: await nextFeeIncomeCode(tenantId),
        name: `Fee income – ${feeHead?.name ?? "removed fee head"}`,
        accountType: "INCOME"
      }
    ]);
  }
  throw new Error(`Could not create the fee income account for fee head ${feeHeadId}`);
};

const systemAccount = async (tenantId, systemKey) => {
  if (!SYSTEM_ACCOUNTS[systemKey]) throw new Error(`Unknown system account ${systemKey}`);
  await ensureChart(tenantId);
  return accounts.findSystem(tenantId, systemKey);
};

export const ledgerAccountService = {
  ensureChart,

  /* An account reference -> the account's id.
       { key: "CASH" }               a system account
       { feeHeadId }                 fee income of that fee head
       { accountId } / { accountCode } an existing account of the school */
  resolve: async (tenantId, ref, { dbc } = {}) => {
    if (ref.key || ref.feeHeadId) {
      const cacheKey = `${tenantId}:${ref.key ?? FEE_INCOME_KEY}:${ref.feeHeadId ?? ""}`;
      if (!systemIds.has(cacheKey)) {
        const account = ref.feeHeadId
          ? await feeIncomeAccount(tenantId, ref.feeHeadId)
          : await systemAccount(tenantId, ref.key);
        systemIds.set(cacheKey, account.id);
      }
      return systemIds.get(cacheKey);
    }
    const account = ref.accountId
      ? await accounts.findById(tenantId, ref.accountId, { dbc })
      : await accounts.findOne(tenantId, [eq(ledgerAccounts.code, String(ref.accountCode ?? ""))], { dbc });
    if (!account) throw unprocessable(`Ledger account ${ref.accountId ?? ref.accountCode} does not exist`);
    return account.id;
  },

  /* Control accounts are kept by their sub-ledgers; people post to the others */
  isControl: account => CONTROL_ACCOUNT_KEYS.includes(account.systemKey) && !account.feeHeadId,

  list: async (ctx, { page, limit, accountType }) => {
    await ensureChart(ctx.tenantId);
    const result = await accounts.list(ctx.tenantId, {
      page,
      limit,
      conditions: [accountType && eq(ledgerAccounts.accountType, accountType)].filter(Boolean),
      with: { feeHead: { columns: { id: true, name: true, code: true } } }
    });
    return { ...result, rows: result.rows.map(view) };
  },

  /* Every active account (reports) */
  all: async ctx => {
    await ensureChart(ctx.tenantId);
    return (await accounts.findMany(ctx.tenantId)).map(view);
  },

  getById: async (ctx, accountId) => {
    const account = await accounts.findById(ctx.tenantId, accountId, {
      with: { feeHead: { columns: { id: true, name: true, code: true } } }
    });
    if (!account) throw notFound("Ledger account");
    return view(account);
  },

  /* A school's own account (system codes are taken first, so they never clash) */
  create: async (ctx, data) => {
    await ensureChart(ctx.tenantId);
    return view(await accounts.create(ctx.tenantId, { ...data, systemKey: null, feeHeadId: null }));
  },

  /* Names and descriptions can change; codes and types are stable */
  update: async (ctx, accountId, data) => {
    await ledgerAccountService.getById(ctx, accountId);
    return view(await accounts.update(ctx.tenantId, accountId, data));
  },

  /* Only a school's own accounts that were never posted to */
  remove: async (ctx, accountId) => {
    const account = await ledgerAccountService.getById(ctx, accountId);
    if (account.systemKey) throw conflict(`${account.code} ${account.name} is a system account and cannot be removed`);
    if (await accounts.hasLines(ctx.tenantId, accountId)) {
      throw conflict(`${account.code} ${account.name} has journal entries; it can no longer be removed`);
    }
    return accounts.softDelete(ctx.tenantId, accountId);
  }
};
