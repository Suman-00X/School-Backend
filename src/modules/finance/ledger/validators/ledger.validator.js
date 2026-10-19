import { z } from "../../../../common/validation/zod.js";
import {
  date,
  id,
  idParams,
  listQuery,
  name,
  optionalText,
  patchBody,
  text
} from "../../../../common/validation/schemas.js";
import { toMinor } from "../../../../common/money/money.js";
import { LEDGER_ACCOUNT_TYPES } from "../../shared/constants/finance.constants.js";

const lineAmount = () => z.number().min(0).max(100_000_000).multipleOf(0.01).optional();

const accountFields = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[0-9A-Z][0-9A-Z.-]{1,19}$/, "must be 2-20 letters, digits, . or -"),
  name: name(120),
  accountType: z.enum(LEDGER_ACCOUNT_TYPES),
  isContra: z.boolean().optional(),
  description: optionalText(500)
});

const line = z
  .object({ accountId: id(), debit: lineAmount(), credit: lineAmount(), memo: optionalText(200) })
  .refine(l => toMinor(l.debit) > 0 !== toMinor(l.credit) > 0, {
    message: "must have either a debit or a credit"
  });

const sumOf = (lines, side) => lines.reduce((total, l) => total + toMinor(l[side]), 0);

/* ?from=&to= together (both dates, in order) */
const period = (required = false) => ({
  from: required ? date() : date().optional(),
  to: required ? date() : date().optional()
});
const inOrder = q => !q.from || !q.to || q.from <= q.to;

export const ledgerValidators = {
  listAccounts: { query: listQuery({ accountType: z.enum(LEDGER_ACCOUNT_TYPES).optional() }) },
  createAccount: { body: accountFields },
  getAccount: { params: idParams("accountId") },
  updateAccount: {
    params: idParams("accountId"),
    body: patchBody(accountFields.pick({ name: true, description: true }))
  },
  removeAccount: { params: idParams("accountId") },
  accountLedger: {
    params: idParams("accountId"),
    query: listQuery({ ...period(), studentId: id().optional() }).refine(inOrder, {
      path: ["to"],
      message: "must be on or after from"
    })
  },

  listEntries: {
    query: listQuery({
      ...period(),
      sourceType: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z][A-Z_]{1,39}$/, "must be a source type such as INVOICE or PAYMENT")
        .optional(),
      sourceId: id().optional(),
      accountId: id().optional(),
      studentId: id().optional()
    })
      .refine(q => Boolean(q.from) === Boolean(q.to), { path: ["to"], message: "from and to go together" })
      .refine(inOrder, { path: ["to"], message: "must be on or after from" })
  },
  getEntry: { params: idParams("entryId") },
  /* A balanced adjustment: debits equal credits */
  createEntry: {
    body: z
      .object({ date: date().optional(), narration: text(500), lines: z.array(line).min(2).max(50) })
      .refine(body => sumOf(body.lines, "debit") === sumOf(body.lines, "credit"), {
        path: ["lines"],
        message: "must balance: total debits must equal total credits"
      })
  },
  reverseEntry: { params: idParams("entryId"), body: z.object({ reason: text(500), date: date().optional() }) },

  trialBalance: { query: z.object({ asOf: date().optional() }) },
  incomeSummary: {
    query: z.object(period(true)).refine(inOrder, { path: ["to"], message: "must be on or after from" })
  }
};
