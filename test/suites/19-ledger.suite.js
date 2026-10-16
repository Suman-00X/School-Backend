import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, patch, del, uuid } from "../helpers/harness.js";

/* The double-entry general ledger. Runs after every other finance suite: by now each
   flow (invoices, plan changes, concessions, late fees and waivers, counter and online
   payments, overpayments, credit, refunds and their approval, gateway refunds and their
   failure) has posted, and the invariants at the end check the books against the records. */

const L = "/api/v1/finance/ledger";
const t = {};
const asAccountant = () => ({ as: h.tokens.accountant });

const accounts = async () => (await get(`${L}/accounts?limit=100`, asAccountant())).data;
const byCode = async code => (await accounts()).find(a => a.code === code);
const journalOf = async (sourceType, sourceId) =>
  (await get(`${L}/journal-entries?sourceType=${sourceType}&sourceId=${sourceId}&limit=100`)).data;
const linesOf = entry => entry.lines.map(l => [l.account.code, l.debit, l.credit]).sort();
const scalar = async (sql, params = []) => Number((await h.pool.query(sql, params)).rows[0].value ?? 0);
const trialBalance = async asOf => (await get(`${L}/trial-balance${asOf ? `?asOf=${asOf}` : ""}`, asAccountant())).data;
const balanceIn = (tb, code) => {
  const row = tb.accounts.find(a => a.code === code);
  return row ? Math.round((row.debit - row.credit) * 100) / 100 : 0;
};

describe("finance: general ledger, chart of accounts", () => {
  it("creates each school's system accounts on first use, with stable codes", async () => {
    const chart = await accounts();
    const codes = Object.fromEntries(chart.map(a => [a.code, a]));
    for (const [code, name] of [
      ["1000", "Cash"],
      ["1010", "Bank"],
      ["1020", "Payment gateway clearing"],
      ["1100", "Accounts receivable – student fees"],
      ["1190", "Refund suspense (to review)"],
      ["2100", "Student credit (advances)"],
      ["3000", "Opening balance equity"],
      ["4800", "Late-fee income"],
      ["4900", "Concessions (contra-income)"]
    ]) {
      assert.equal(codes[code]?.name, name, `${code} ${name}`);
      assert.equal(codes[code].isSystem, true);
    }
    assert.deepEqual(
      ["1000", "2100", "4800", "4900"].map(code => codes[code].normalBalance),
      ["DEBIT", "CREDIT", "CREDIT", "DEBIT"],
      "concessions are contra-income"
    );
    /* One income account per fee head, created when the head was first billed */
    const tuition = chart.find(a => a.feeHeadId === world.tuition.id);
    assert.equal(tuition.name, "Fee income – Tuition");
    assert.match(tuition.code, /^41\d{2}$/);
    assert.equal(tuition.feeHead.code, "TUITION");
    t.tuitionCode = tuition.code;
    t.transportCode = chart.find(a => a.feeHeadId === world.transport.id).code;

    await get(`${L}/accounts`, { as: h.tokens.principal });
    await get(`${L}/accounts`, { as: h.tokens.office }, 403);
    await get(`${L}/accounts`, { as: h.tokens.teacher }, 403);
    await get(`${L}/trial-balance`, { as: h.tokens.mother }, 403);
  });

  it("lets a school add its own accounts; system accounts keep their codes", async () => {
    const charges = await post(
      `${L}/accounts`,
      { code: "5100", name: "Bank and gateway charges", accountType: "EXPENSE" },
      asAccountant()
    );
    assert.equal(charges.message, "Ledger account 5100 Bank and gateway charges created");
    assert.deepEqual([charges.data.isSystem, charges.data.normalBalance], [false, "DEBIT"]);
    t.charges = charges.data;
    t.fines = (
      await post(`${L}/accounts`, { code: "4810", name: "Library fine income", accountType: "INCOME" }, asAccountant())
    ).data;
    t.unused = (await post(`${L}/accounts`, { code: "5999", name: "Spare", accountType: "EXPENSE" })).data;

    const duplicate = await request("POST", `${L}/accounts`, {
      body: { code: "1000", name: "Petty cash", accountType: "ASSET" }
    });
    assert.equal(duplicate.status, 409);
    await post(`${L}/accounts`, { code: "x", name: "Bad", accountType: "ASSET" }, {}, 400);
    await post(`${L}/accounts`, { code: "6000", name: "Bad", accountType: "PROFIT" }, {}, 400);
    await post(
      `${L}/accounts`,
      { code: "6000", name: "Office", accountType: "EXPENSE" },
      { as: h.tokens.principal },
      403
    );

    const cash = await byCode("1000");
    const renamed = await patch(`${L}/accounts/${cash.id}`, { name: "Cash in hand" }, asAccountant());
    assert.equal(renamed.data.code, "1000");
    assert.equal(renamed.message, "Ledger account 1000 Cash in hand updated");
    const system = await request("DELETE", `${L}/accounts/${cash.id}`);
    assert.equal(system.status, 409);
    assert.equal(system.body.message, "1000 Cash in hand is a system account and cannot be removed");
    await del(`${L}/accounts/${t.unused.id}`);
    await get(`${L}/accounts/${t.unused.id}`, {}, 404);
  });
});

describe("finance: general ledger, automatic postings", () => {
  it("posted each invoice gross, with its concessions and fee heads", async () => {
    /* Fstudent2's Term 1: 6000 gross, 10% sibling concession, 5400 to collect */
    const [issued] = (await journalOf("INVOICE", world.inv2.id)).filter(e => e.event === "issued");
    assert.match(issued.narration, /^Invoice INV26-\d{6} issued, due 2026-07-15 \(Term 1\)$/);
    assert.match(issued.entryNumber, /^JE-\d{6}$/);
    assert.deepEqual(linesOf(issued), [
      ["1100", 5400, 0],
      [t.tuitionCode, 0, 4000],
      [t.transportCode, 0, 2000],
      ["4900", 600, 0]
    ]);
    assert.equal(issued.total, 6000);
    assert.equal(issued.lines.find(l => l.account.code === "1100").student.id, world.s2.id);
  });

  it("posted counter payments to cash and online payments to the gateway clearing account", async () => {
    const [cash] = await journalOf("PAYMENT", world.cashPayment.id);
    assert.equal(cash.event, "received");
    assert.match(cash.narration, /^Payment RCPT26-0{5}1 received for INV26-\d{6} \(CASH\)$/);
    assert.deepEqual(linesOf(cash), [
      ["1000", 1000, 0],
      ["1100", 0, 1000]
    ]);

    const online = (await get(`/api/v1/finance/payments?method=ONLINE&studentId=${world.s2.id}`)).data[0];
    assert.deepEqual(linesOf((await journalOf("PAYMENT", online.id))[0]), [
      ["1020", 4400, 0],
      ["1100", 0, 4400]
    ]);
  });

  it("posted late fees, waivers and their reinstatement as differences", async () => {
    /* An overdue Class 1 invoice that took the 500 cap of the default rule */
    const open = (await get("/api/v1/finance/invoices?status=ISSUED&limit=100")).data.find(i => i.lateFee === 500);
    const entries = await journalOf("INVOICE", open.id);
    const lateFee = entries.find(e => e.event.startsWith("late-fee:"));
    assert.match(lateFee.narration, /^Late fee on INV26-\d{6} brought to 500\.00$/);
    assert.deepEqual(linesOf(lateFee), [
      ["1100", 500, 0],
      ["4800", 0, 500]
    ]);

    /* The invoice of suite 17 whose late fee was waived, then reinstated */
    const { rows } = await h.pool.query(
      "SELECT source_id FROM journal_entries WHERE tenant_id = $1 AND event LIKE 'late-fee-waived:%'",
      [h.tenant.id]
    );
    assert.equal(rows.length, 1);
    const history = (await journalOf("INVOICE", rows[0].source_id)).sort((a, b) => a.sequence - b.sequence);
    const waiver = history.find(e => e.event.startsWith("late-fee-waived:"));
    const reinstated = history.find(e => e.event.startsWith("late-fee-reinstated:"));
    assert.match(waiver.narration, /waived: Hospitalised in July$/);
    assert.deepEqual(linesOf(waiver), [
      ["1100", 0, 500],
      ["4800", 500, 0]
    ]);
    assert.match(reinstated.narration, /^Late-fee waiver on INV26-\d{6} withdrawn \(late fee 500\.00\)$/);
    assert.deepEqual(linesOf(reinstated), [
      ["1100", 500, 0],
      ["4800", 0, 500]
    ]);
  });

  it("reversed cancelled invoices completely, and re-posted recalculated ones", async () => {
    const cancelled = (
      await h.pool.query("SELECT id FROM invoices WHERE tenant_id = $1 AND status = 'CANCELLED'", [h.tenant.id])
    ).rows;
    assert.ok(cancelled.length >= 2, "a cancelled invoice and the plan changes of suite 17");
    for (const { id } of cancelled) {
      const entries = await journalOf("INVOICE", id);
      assert.ok(entries.some(e => e.event === "cancelled"));
      const net = new Map();
      for (const line of entries.flatMap(e => e.lines)) {
        net.set(
          line.account.code,
          (net.get(line.account.code) ?? 0) + Math.round(line.debit * 100) - Math.round(line.credit * 100)
        );
      }
      assert.ok(
        [...net.values()].every(v => v === 0),
        "a cancelled invoice nets to zero on every account"
      );
    }
    /* A concession granted or revoked: each recalculated invoice is reversed, then re-issued */
    const { rows } = await h.pool.query(
      "SELECT source_id FROM journal_entries WHERE tenant_id = $1 AND event LIKE 'reissued:%' LIMIT 1",
      [h.tenant.id]
    );
    assert.equal(rows.length, 1, "concession changes recalculated unpaid invoices");
    const history = (await journalOf("INVOICE", rows[0].source_id)).sort((a, b) => a.sequence - b.sequence);
    const reversed = history.findIndex(e => e.event.startsWith("reversed:"));
    assert.match(history[reversed].narration, /reversed for recalculation \(concessions changed\)$/);
    assert.match(history[reversed + 1].event, /^reissued:/);
    const invoice = (await get(`/api/v1/finance/invoices/${rows[0].source_id}`)).data;
    const receivable = history.flatMap(e => e.lines).filter(l => l.account.code === "1100");
    assert.equal(
      Math.round(receivable.reduce((sum, l) => sum + l.debit - l.credit, 0) * 100) / 100,
      invoice.total,
      "what the invoice charges now"
    );
  });

  it("posted credit, refunds and failed gateway refunds", async () => {
    const entries = (await get(`${L}/journal-entries?sourceType=STUDENT_CREDIT&limit=100`)).data;
    const applied = entries.find(e => e.event === "applied" && e.total === 7000);
    assert.deepEqual(linesOf(applied), [
      ["1100", 0, 7000],
      ["2100", 7000, 0]
    ]);
    const paidBack = entries.find(e => e.event === "refunded" && e.total === 200);
    assert.deepEqual(linesOf(paidBack), [
      ["1010", 0, 200],
      ["2100", 200, 0]
    ]);

    /* The dashboard refund that bounced (suite 18): posted, then reversed */
    const [failed] = (await get("/api/v1/finance/refunds?status=FAILED")).data;
    const [refunded, reversal] = (await journalOf("REFUND", failed.id)).sort((a, b) => a.sequence - b.sequence);
    assert.deepEqual([refunded.event, reversal.event, reversal.reversalOfId], ["refunded", "failed", refunded.id]);
    assert.deepEqual(linesOf(refunded), [
      ["1020", 0, 250],
      ["1100", 250, 0]
    ]);
    assert.deepEqual(linesOf(reversal), [
      ["1020", 250, 0],
      ["1100", 0, 250]
    ]);
  });
});

describe("finance: general ledger, integrity in the database", () => {
  it("rejects any change to a posted entry", async () => {
    await assert.rejects(h.pool.query("UPDATE journal_entries SET narration = 'x'"), { code: "ZA409" });
    await assert.rejects(h.pool.query("UPDATE journal_lines SET debit = debit + 1"), { code: "ZA409" });
    await assert.rejects(h.pool.query("DELETE FROM journal_lines"), { code: "ZA409" });
    await assert.rejects(h.pool.query("DELETE FROM journal_entries"), { code: "ZA409" });
    await assert.rejects(h.pool.query("TRUNCATE journal_lines, journal_entries"), { code: "ZA409" });
  });

  it("refuses at commit an entry whose debits and credits differ", async () => {
    const cash = await byCode("1000");
    const bank = await byCode("1010");
    const client = await h.pool.connect();
    const entryId = uuid();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO journal_entries (id, tenant_id, sequence, entry_number, entry_date, narration, source_type, source_id, event, total)
         VALUES ($1, $2, 999999, 'JE-999999', current_date, 'Unbalanced', 'MANUAL', $1, 'posted', 100)`,
        [entryId, h.tenant.id]
      );
      await client.query(
        `INSERT INTO journal_lines (tenant_id, entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 100, 0), ($1, $2, $4, 0, 90)`,
        [h.tenant.id, entryId, cash.id, bank.id]
      );
      await assert.rejects(client.query("COMMIT"), error => {
        assert.equal(error.code, "ZA422");
        assert.match(error.message, /^Journal entry JE-999999 does not balance \(debits 100\.00, credits 90\.00/);
        return true;
      });
    } finally {
      client.release();
    }
    assert.equal(await scalar("SELECT count(*) AS value FROM journal_entries WHERE id = $1", [entryId]), 0);
  });

  it("refuses lines that use another school's accounts", async () => {
    const cash = await byCode("1000");
    /* The other school's chart exists once it is first read */
    const other = (await get(`${L}/accounts?limit=100`, { as: h.tokens.otherAdmin })).data.find(a => a.code === "1010");
    const client = await h.pool.connect();
    const entryId = uuid();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO journal_entries (id, tenant_id, sequence, entry_number, entry_date, narration, source_type, source_id, event, total)
         VALUES ($1, $2, 999998, 'JE-999998', current_date, 'Cross-school', 'MANUAL', $1, 'posted', 10)`,
        [entryId, h.tenant.id]
      );
      await client.query(
        `INSERT INTO journal_lines (tenant_id, entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 10, 0), ($1, $2, $4, 0, 10)`,
        [h.tenant.id, entryId, cash.id, other.id]
      );
      await assert.rejects(client.query("COMMIT"), { code: "ZA422" });
    } finally {
      client.release();
    }
  });

  it("posts a source event once, also for other modules", async () => {
    const { ledgerService } = await import("../../src/modules/finance/ledger/index.js");
    const ctx = { tenantId: h.tenant.id, userId: h.admin.id };
    const fine = uuid();
    const entry = {
      narration: "Library fine LIBR-000099",
      sourceType: "LIBRARY_FINE",
      sourceId: fine,
      event: "paid",
      lines: [
        { account: { key: "CASH" }, debit: 50 },
        { account: { accountCode: "4810" }, credit: 50, memo: "Late return" }
      ]
    };
    const first = await ledgerService.post(ctx, entry);
    assert.equal(first.total, 50);
    const again = await ledgerService.post(ctx, entry);
    assert.deepEqual([again.id, again.duplicate], [first.id, true]);
    assert.equal(await scalar("SELECT count(*) AS value FROM journal_entries WHERE source_id = $1", [fine]), 1);
    await assert.rejects(
      ledgerService.post(ctx, { ...entry, event: "other", lines: [entry.lines[0], { ...entry.lines[1], credit: 40 }] }),
      { message: "The journal entry does not balance: debits 50.00, credits 40.00" }
    );
    /* The unique key holds in the database too */
    await assert.rejects(
      h.pool.query(
        `INSERT INTO journal_entries (tenant_id, sequence, entry_number, entry_date, narration, source_type, source_id, event, total)
         VALUES ($1, 999997, 'JE-999997', current_date, 'Again', 'LIBRARY_FINE', $2, 'paid', 50)`,
        [h.tenant.id, fine]
      ),
      { code: "23505" }
    );
  });
});

describe("finance: general ledger, manual entries and reports", () => {
  it("takes balanced manual adjustments from accountants, never on control accounts", async () => {
    const [bank, clearing, receivables] = [await byCode("1010"), await byCode("1020"), await byCode("1100")];
    const settlement = {
      narration: "Razorpay settlement, less gateway charges",
      lines: [
        { accountId: bank.id, debit: 976.4, memo: "UTR 1234" },
        { accountId: t.charges.id, debit: 23.6 },
        { accountId: clearing.id, credit: 1000 }
      ]
    };
    const unbalanced = await request("POST", `${L}/journal-entries`, {
      body: { ...settlement, lines: [settlement.lines[0], settlement.lines[2]] }
    });
    assert.equal(unbalanced.status, 400);
    assert.match(unbalanced.body.message, /lines must balance: total debits must equal total credits/);
    await post(`${L}/journal-entries`, { ...settlement, lines: [settlement.lines[0]] }, {}, 400);
    await post(
      `${L}/journal-entries`,
      { ...settlement, lines: [{ accountId: bank.id, debit: 5, credit: 5 }, settlement.lines[2]] },
      {},
      400
    );
    const control = await request("POST", `${L}/journal-entries`, {
      body: {
        narration: "Write-off",
        lines: [
          { accountId: t.charges.id, debit: 10 },
          { accountId: receivables.id, credit: 10 }
        ]
      }
    });
    assert.equal(control.status, 422);
    assert.equal(
      control.body.message,
      "1100 Accounts receivable – student fees is kept by invoices, payments and student credit; it cannot take manual entries"
    );
    const future = await request("POST", `${L}/journal-entries`, { body: { ...settlement, date: "2099-01-01" } });
    assert.equal(future.status, 422);
    await post(`${L}/journal-entries`, settlement, { as: h.tokens.principal }, 403);
    await post(`${L}/journal-entries`, settlement, { as: h.tokens.office }, 403);

    const posted = await post(`${L}/journal-entries`, settlement, asAccountant());
    assert.match(posted.message, /^Journal entry JE-\d{6} of 1000\.00 posted$/);
    assert.deepEqual(linesOf(posted.data), [
      ["1010", 976.4, 0],
      ["1020", 0, 1000],
      ["5100", 23.6, 0]
    ]);
    assert.equal(posted.data.poster.firstName, "Faccountant");
    t.settlement = posted.data;
  });

  it("corrects a manual entry with a reversal, once", async () => {
    const url = `${L}/journal-entries/${t.settlement.id}/reversal`;
    await post(url, {}, asAccountant(), 400);
    const reversed = await post(url, { reason: "Wrong settlement date" }, asAccountant());
    assert.equal(reversed.message, `Reversal of ${t.settlement.entryNumber} posted as ${reversed.data.entryNumber}`);
    assert.equal(reversed.data.reversalOfId, t.settlement.id);
    assert.deepEqual(linesOf(reversed.data), [
      ["1010", 0, 976.4],
      ["1020", 1000, 0],
      ["5100", 0, 23.6]
    ]);
    const twice = await request("POST", url, { body: { reason: "again" } });
    assert.equal(twice.status, 409);
    assert.equal(
      twice.body.message,
      `${t.settlement.entryNumber} was already reversed by ${reversed.data.entryNumber}`
    );
    await post(`${L}/journal-entries/${reversed.data.id}/reversal`, { reason: "x" }, {}, 422);

    const automatic = (await journalOf("PAYMENT", world.cashPayment.id))[0];
    const refused = await request("POST", `${L}/journal-entries/${automatic.id}/reversal`, { body: { reason: "x" } });
    assert.equal(refused.status, 422);
    assert.equal(refused.body.message, `${automatic.entryNumber} was posted by a payment; correct that record instead`);

    const inUse = await request("DELETE", `${L}/accounts/${t.charges.id}`);
    assert.equal(inUse.status, 409);
    assert.equal(inUse.body.message, "5100 Bank and gateway charges has journal entries; it can no longer be removed");
  });

  it("lists and shows journal entries, only the school's own", async () => {
    const page = await get(`${L}/journal-entries?limit=5`, { as: h.tokens.principal });
    assert.equal(page.data.length, 5);
    assert.ok(page.meta.total > 50);
    const today = todayIn("Asia/Kolkata");
    const byCash = await get(`${L}/journal-entries?accountId=${(await byCode("1000")).id}&limit=100`);
    assert.ok(byCash.data.every(e => e.lines.some(l => l.account.code === "1000")));
    const forStudent = await get(`${L}/journal-entries?studentId=${world.s2.id}&limit=100`);
    assert.ok(forStudent.data.length >= 3);
    const ranged = await get(`${L}/journal-entries?from=2000-01-01&to=${today}&limit=1`);
    assert.ok(ranged.meta.total > 0);
    await get(`${L}/journal-entries?from=2026-01-01`, {}, 400);

    const detail = await get(`${L}/journal-entries/${t.settlement.id}`);
    assert.equal(detail.data.narration, "Razorpay settlement, less gateway charges");
    await get(`${L}/journal-entries/${t.settlement.id}`, { as: h.tokens.otherAdmin }, 404);
    await get(`${L}/journal-entries/${uuid()}`, {}, 404);
  });

  it("shows an account's ledger with a running balance", async () => {
    const cash = await byCode("1000");
    const all = await get(`${L}/accounts/${cash.id}/ledger?limit=100`, asAccountant());
    assert.match(all.message, /^1000 Cash in hand: closing balance -?\d+\.\d{2}$/);
    assert.equal(all.meta.openingBalance, 0);
    let running = 0;
    for (const row of all.data) {
      running = Math.round((running + row.debit - row.credit) * 100) / 100;
      assert.equal(row.balance, running, `${row.entryNumber}`);
    }
    assert.equal(all.meta.closingBalance, running);
    assert.equal(all.meta.closingBalance, Math.round((all.meta.debits - all.meta.credits) * 100) / 100);

    /* Paged: the balance carries over between pages */
    const second = await get(`${L}/accounts/${cash.id}/ledger?limit=2&page=2`, asAccountant());
    assert.deepEqual(
      second.data.map(r => r.balance),
      all.data.slice(2, 4).map(r => r.balance)
    );

    /* A credit-normal account reads positive as it grows */
    const credit = await byCode("2100");
    const owed = await get(`${L}/accounts/${credit.id}/ledger?limit=100`);
    assert.equal(owed.meta.account.normalBalance, "CREDIT");
    assert.equal(owed.meta.closingBalance, Math.round((owed.meta.credits - owed.meta.debits) * 100) / 100);

    const future = await get(`${L}/accounts/${cash.id}/ledger?from=2099-01-01&to=2099-12-31`);
    assert.deepEqual([future.data.length, future.meta.openingBalance], [0, all.meta.closingBalance]);
    await get(`${L}/accounts/${cash.id}/ledger?from=2026-12-01&to=2026-01-01`, {}, 400);
    await get(`${L}/accounts/${uuid()}/ledger`, {}, 404);
  });

  it("summarises income for a period: fee income by head, late fees, concessions", async () => {
    const summary = await get(`${L}/income-summary?from=2000-01-01&to=2099-12-31`, { as: h.tokens.principal });
    const { data } = summary;
    assert.match(summary.message, /^Net income from 2000-01-01 to 2099-12-31: \d+\.\d{2}$/);
    const live = await h.pool.query(
      `SELECT coalesce(sum(subtotal), 0) AS gross, coalesce(sum(discount), 0) AS discount, coalesce(sum(late_fee), 0) AS late
       FROM invoices WHERE tenant_id = $1 AND is_active AND status <> 'CANCELLED'`,
      [h.tenant.id]
    );
    const { gross, discount, late } = live.rows[0];
    assert.equal(data.feeIncome.total, Number(gross), "fee income = gross of live invoices");
    assert.equal(data.concessions, -Number(discount), "concessions reduce income");
    assert.equal(data.lateFees, Number(late));
    assert.ok(data.feeIncome.byFeeHead.some(head => head.code === t.tuitionCode && head.amount > 0));
    assert.equal(data.otherIncome.total, 50, "the library fine posted above");
    assert.equal(
      data.netIncome,
      Math.round((data.feeIncome.total + data.lateFees + data.concessions + data.otherIncome.total) * 100) / 100
    );
    assert.equal(data.expenses.total, 0, "the gateway charges were reversed");
    assert.equal(data.surplus, data.netIncome);
    await get(`${L}/income-summary?from=2026-01-01`, {}, 400);
    await get(`${L}/income-summary?from=2000-01-01&to=2099-12-31`, { as: h.tokens.office }, 403);
  });
});

/* Keep last among the finance suites: every flow above and before has posted by now */
describe("finance: general ledger invariants", () => {
  it("balances: total debits equal total credits", async () => {
    const tb = await trialBalance("2099-12-31");
    assert.equal(tb.balanced, true);
    assert.equal(tb.totals.debit, tb.totals.credit);
    assert.ok(tb.totals.debit > 0);
    const today = await trialBalance();
    assert.equal(today.balanced, true);
    assert.equal(today.asOf, todayIn("Asia/Kolkata"));
    const other = (await get(`${L}/trial-balance`, { as: h.tokens.otherAdmin })).data;
    assert.deepEqual([other.accounts.length, other.balanced], [0, true], "another school's books are its own");
  });

  it("receivables equal the open invoice balances, per student too", async () => {
    const tb = await trialBalance("2099-12-31");
    const open = await scalar(
      `SELECT coalesce(sum(balance), 0) AS value FROM invoices
       WHERE tenant_id = $1 AND is_active AND status IN ('ISSUED', 'PARTIALLY_PAID')`,
      [h.tenant.id]
    );
    assert.ok(open > 0);
    assert.equal(balanceIn(tb, "1100"), open);

    const mismatched = await h.pool.query(
      `WITH ledger AS (
         SELECT l.student_id, sum(l.debit - l.credit) AS amount FROM journal_lines l
         JOIN ledger_accounts a ON a.id = l.account_id
         WHERE l.tenant_id = $1 AND a.system_key = 'RECEIVABLES' GROUP BY l.student_id),
       books AS (
         SELECT student_id, sum(balance) AS amount FROM invoices
         WHERE tenant_id = $1 AND is_active AND status IN ('ISSUED', 'PARTIALLY_PAID') GROUP BY student_id)
       SELECT coalesce(ledger.student_id, books.student_id) AS student_id
       FROM ledger FULL JOIN books ON books.student_id = ledger.student_id
       WHERE coalesce(ledger.amount, 0) <> coalesce(books.amount, 0)`,
      [h.tenant.id]
    );
    assert.deepEqual(mismatched.rows, [], "every student's receivable matches their invoices");
  });

  it("student credit equals the students' credit balances, per student too", async () => {
    const tb = await trialBalance("2099-12-31");
    const held = await scalar(
      "SELECT coalesce(sum(balance), 0) AS value FROM student_credit_balances WHERE tenant_id = $1 AND is_active",
      [h.tenant.id]
    );
    assert.equal(-balanceIn(tb, "2100"), held);
    const mismatched = await h.pool.query(
      `WITH ledger AS (
         SELECT l.student_id, sum(l.credit - l.debit) AS amount FROM journal_lines l
         JOIN ledger_accounts a ON a.id = l.account_id
         WHERE l.tenant_id = $1 AND a.system_key = 'STUDENT_CREDIT' GROUP BY l.student_id)
       SELECT b.student_id FROM student_credit_balances b
       FULL JOIN ledger ON ledger.student_id = b.student_id
       WHERE coalesce(b.tenant_id, $1) = $1 AND coalesce(ledger.amount, 0) <> coalesce(b.balance, 0)`,
      [h.tenant.id]
    );
    assert.deepEqual(mismatched.rows, []);
  });

  it("the gateway clearing account holds online receipts less gateway refunds", async () => {
    const tb = await trialBalance("2099-12-31");
    const received = await scalar(
      `SELECT coalesce(sum(amount), 0) AS value FROM payments
       WHERE tenant_id = $1 AND is_active AND status = 'SUCCEEDED' AND method = 'ONLINE'`,
      [h.tenant.id]
    );
    const refunded = await scalar(
      `SELECT coalesce(sum(amount), 0) AS value FROM payment_refunds
       WHERE tenant_id = $1 AND is_active AND method = 'ORIGINAL' AND status IN ('PROCESSED', 'PENDING')`,
      [h.tenant.id]
    );
    assert.equal(balanceIn(tb, "1020"), Math.round((received - refunded) * 100) / 100);
  });
});
