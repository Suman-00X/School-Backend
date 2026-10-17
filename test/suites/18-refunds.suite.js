import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, request, get, post, settleJobs, tokenFor } from "../helpers/harness.js";
import { pdfText } from "../helpers/pdf.js";

const F = "/api/v1/finance";
const KEY_SECRET = "school-one-key-secret-7Hq2";
const WEBHOOK_SECRET = "school-one-webhook-secret-Zp4";
const webhookUrl = `/api/v1/public/payments/razorpay/${"TENANT"}/webhook`;

/* Values shared by the tests below */
const r = {};

const sendWebhook = async (event, entity) => {
  const body = JSON.stringify({ event, payload: { refund: { entity } } });
  return request("POST", webhookUrl.replace("TENANT", h.tenant.id), {
    as: null,
    raw: body,
    headers: { "x-razorpay-signature": h.modules.gateway.gatewaySignature(WEBHOOK_SECRET, body) }
  });
};

/* Pay an invoice online through the (mock) gateway, as the office -> payment */
const payOnline = async (invoiceId, amount, gatewayPaymentId) => {
  const order = await post(`${F}/invoices/${invoiceId}/payment-orders`, { amount }, { as: h.tokens.office });
  const signature = h.modules.gateway.gatewaySignature(KEY_SECRET, `${order.data.orderId}|${gatewayPaymentId}`);
  return (
    await post(
      `${F}/payments/confirmations`,
      { orderId: order.data.orderId, paymentId: gatewayPaymentId, signature },
      { as: h.tokens.office },
      200
    )
  ).data;
};

const invoiceOf = async id => (await get(`${F}/invoices/${id}`)).data;

/* Nobody approves their own refund, administrators included (D-63): a second administrator */
const secondAdmin = async () => {
  if (!h.tokens.admin2) {
    const { db } = await import("../../src/common/database/postgres.js");
    [h.admin2] = await h.inSchool(() =>
      db
        .insert(h.schema.users)
        .values({ tenantId: h.tenant.id, firstName: "Bea", lastName: "Boss", email: "bea@test.school", role: "ADMIN" })
        .returning()
    );
    h.tokens.admin2 = tokenFor(h.admin2.id, "ADMIN");
  }
  return { as: h.tokens.admin2 };
};

/* An administrator's refund: requested, then approved by the second administrator */
const refundNow = async (paymentId, body, options = {}) => {
  const requested = await post(`${F}/payments/${paymentId}/refunds`, body, options);
  assert.equal(requested.data.status, "REQUESTED");
  assert.equal(requested.data.refundNumber, null, "numbered only when approved");
  return post(`${F}/refunds/${requested.data.id}/approval`, {}, await secondAdmin(), 200);
};

const lockWaiters = async () =>
  Number(
    (
      await h.pool.query(
        "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()"
      )
    ).rows[0].count
  );

describe("finance: refunds", () => {
  it("bills a Class 2 student for the refund tests", async () => {
    const plan = await post(`${F}/installment-plans`, {
      name: "Refund test annual",
      installments: [{ name: "Annual", dueDate: "2026-12-01", sharePercent: 100 }]
    });
    const structure = await post(`${F}/fee-structures`, {
      name: "Class 2 refund test fees",
      classId: world.c2.id,
      items: [{ feeHeadId: world.tuition.id, amount: 3000 }],
      installmentPlanIds: [plan.data.id],
      defaultInstallmentPlanId: plan.data.id,
      chargesLateFee: false
    });
    const issued = await post(`${F}/invoices/generation`, {
      feeStructureId: structure.data.id,
      studentIds: [world.s3.id]
    });
    r.invoice = issued.data.invoices[0];
    assert.ok(r.invoice.total > 0);
    r.total = r.invoice.total;
  });

  it("refunds an online payment back through the school's gateway account", async () => {
    r.online = await payOnline(r.invoice.id, 1000, "pay_refund_1");
    assert.equal(r.online.status, "SUCCEEDED");

    await post(`${F}/payments/${r.online.id}/refunds`, { amount: 100, reason: "x" }, { as: h.tokens.office }, 403);
    const tooMuch = await request("POST", `${F}/payments/${r.online.id}/refunds`, {
      body: { amount: 1000.01, reason: "Overcharged" }
    });
    assert.equal(tooMuch.status, 422);
    assert.equal(tooMuch.body.message, `At most 1000.00 of payment ${r.online.receiptNumber} can still be refunded`);

    const refund = await refundNow(r.online.id, { amount: 400, reason: "Overcharged transport" });
    assert.match(refund.message, /^Refund RFND26-\d{6} of 400\.00 approved and processed for receipt RCPT26-\d{6}$/);
    assert.equal(refund.data.method, "ORIGINAL");
    assert.equal(refund.data.status, "PROCESSED");
    assert.match(refund.data.gatewayRefundId, /^rfnd_mock_/);
    assert.deepEqual([refund.data.fromInvoice, refund.data.fromCredit, refund.data.unallocated], [400, 0, 0]);
    /* An administrator's own request waits for another administrator */
    assert.deepEqual([refund.data.requestedBy, refund.data.approvedBy], [h.admin.id, h.admin2.id]);
    assert.ok(refund.data.approvedAt);
    assert.deepEqual([refund.data.approver.firstName, refund.data.autoApproved], ["Bea", false]);
    r.onlineRefund = refund.data;

    const invoice = await invoiceOf(r.invoice.id);
    assert.equal(invoice.amountPaid, 600);
    assert.equal(invoice.status, "PARTIALLY_PAID");
    assert.equal((await get(`${F}/payments/${r.online.id}`)).data.refundedAmount, 400);
  });

  it("records refunds of counter payments, paid back by hand", async () => {
    const cash = (
      await post(`${F}/invoices/${r.invoice.id}/payments`, { amount: 500, method: "CASH" }, { as: h.tokens.office })
    ).data;
    const noMethod = await request("POST", `${F}/payments/${cash.id}/refunds`, { body: { reason: "Paid twice" } });
    assert.equal(noMethod.status, 422);
    assert.match(noMethod.body.message, /^method is required/);
    const original = await request("POST", `${F}/payments/${cash.id}/refunds`, {
      body: { reason: "Paid twice", method: "ORIGINAL" }
    });
    assert.match(original.body.message, /^ORIGINAL is only for online payments/);
    const noReference = await request("POST", `${F}/payments/${cash.id}/refunds`, {
      body: { reason: "Paid twice", method: "BANK_TRANSFER" }
    });
    assert.equal(noReference.status, 400);

    /* No amount: everything still refundable */
    const refund = await refundNow(cash.id, { reason: "Paid twice", method: "CASH" });
    assert.equal(refund.data.amount, 500);
    assert.equal(refund.data.status, "PROCESSED");
    const again = await request("POST", `${F}/payments/${cash.id}/refunds`, {
      body: { reason: "Again", method: "CASH" }
    });
    assert.equal(again.status, 409);
    assert.match(again.body.message, /has already been refunded in full$/);
    assert.equal((await invoiceOf(r.invoice.id)).amountPaid, 600);
  });

  it("takes the rest of the fee online", async () => {
    const { balance } = await invoiceOf(r.invoice.id);
    r.paid = await payOnline(r.invoice.id, balance, "pay_refund_2");
    assert.equal((await invoiceOf(r.invoice.id)).status, "PAID");
  });

  it("keeps the books whole when the gateway reports refunds made in its dashboard", async () => {
    /* A refund nobody made here: recorded from the webhook and taken off the invoice */
    const created = await sendWebhook("refund.processed", {
      id: "rfnd_dash_1",
      payment_id: "pay_refund_2",
      amount: 25000,
      currency: "INR",
      status: "processed"
    });
    assert.equal(created.status, 200);
    assert.equal(created.body.data.handled, true);
    const listed = await get(`${F}/refunds?paymentId=${r.paid.id}`);
    assert.equal(listed.meta.total, 1);
    const dashboard = listed.data[0];
    assert.deepEqual(
      [dashboard.source, dashboard.method, dashboard.amount, dashboard.unallocated],
      ["GATEWAY", "ORIGINAL", 250, 0]
    );
    assert.equal((await invoiceOf(r.invoice.id)).status, "PARTIALLY_PAID");

    /* The same webhook again changes nothing */
    await sendWebhook("refund.processed", {
      id: "rfnd_dash_1",
      payment_id: "pay_refund_2",
      amount: 25000,
      status: "processed"
    });
    assert.equal((await get(`${F}/refunds?paymentId=${r.paid.id}`)).meta.total, 1);

    /* The bank bounced it: everything goes back */
    const failed = await sendWebhook("refund.failed", {
      id: "rfnd_dash_1",
      payment_id: "pay_refund_2",
      amount: 25000,
      status: "failed"
    });
    assert.equal(failed.body.data.handled, true);
    const reversed = await get(`${F}/refunds/${dashboard.id}`);
    assert.equal(reversed.data.status, "FAILED");
    assert.ok(reversed.data.failedAt);
    const invoice = await invoiceOf(r.invoice.id);
    assert.equal(invoice.status, "PAID");
    assert.equal((await get(`${F}/payments/${r.paid.id}`)).data.refundedAmount, 0);

    /* Unknown payments and failures of unknown refunds are ignored */
    const stranger = await sendWebhook("refund.processed", {
      id: "rfnd_x",
      payment_id: "pay_nobody",
      amount: 100,
      status: "processed"
    });
    assert.equal(stranger.body.data.handled, false);
  });

  it("refunds credit from an overpayment before touching the invoice", async () => {
    /* Reopen 100 of the invoice, order 100 online, but cash pays it first: the online payment is all excess */
    const reopen = await refundNow(r.paid.id, {
      amount: 100,
      reason: "Partial refund to reopen the invoice",
      method: "ORIGINAL"
    });
    assert.equal(reopen.data.fromInvoice, 100);
    const order = await post(`${F}/invoices/${r.invoice.id}/payment-orders`, { amount: 100 }, { as: h.tokens.office });
    const signature = h.modules.gateway.gatewaySignature(KEY_SECRET, `${order.data.orderId}|pay_refund_3`);
    /* Cash settles the invoice first */
    await post(`${F}/invoices/${r.invoice.id}/payments`, { amount: 100, method: "CASH" }, { as: h.tokens.office });
    const extra = (
      await post(
        `${F}/payments/confirmations`,
        { orderId: order.data.orderId, paymentId: "pay_refund_3", signature },
        { as: h.tokens.office },
        200
      )
    ).data;
    assert.equal(extra.excessAmount, 100);
    const creditBefore = (await get(`${F}/students/${world.s3.id}/credits`)).data.balance;

    const refund = await refundNow(extra.id, { reason: "Paid twice online" });
    assert.deepEqual([refund.data.fromCredit, refund.data.fromInvoice], [100, 0]);
    assert.equal((await get(`${F}/students/${world.s3.id}/credits`)).data.balance, creditBefore - 100);
    assert.equal((await invoiceOf(r.invoice.id)).status, "PAID");
  });

  it("refunds a payment once when two refunds race", async () => {
    const payment = r.online;
    const refundable = 1000 - 400;
    const holder = await h.pool.connect();
    let results;
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM payments WHERE id = $1 FOR UPDATE", [payment.id]);
      const pending = Promise.all(
        [1, 2].map(() =>
          request("POST", `${F}/payments/${payment.id}/refunds`, { body: { amount: refundable, reason: "Race" } })
        )
      );
      for (let i = 0; i < 200 && (await lockWaiters()) < 2; i++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(await lockWaiters(), 2, "both requests wait on the payment lock");
      await holder.query("COMMIT");
      results = await pending;
    } finally {
      holder.release(true);
    }
    /* One request; the other finds the rest already waiting */
    assert.deepEqual(results.map(res => res.status).sort(), [201, 409]);
    assert.match(results.find(res => res.status === 409).body.message, /is already waiting for approval$/);
    const winner = results.find(res => res.status === 201).body.data;
    await post(`${F}/refunds/${winner.id}/approval`, {}, await secondAdmin(), 200);
    assert.equal((await get(`${F}/payments/${payment.id}`)).data.refundedAmount, 1000);
  });

  it("shows refunds on the statement and tells the family", async () => {
    const statement = await get(`${F}/students/${world.s3.id}/statement`);
    /* Only refunds whose money moved count (requests, rejections and failures do not) */
    const processed = statement.data.refunds.filter(refund => ["PROCESSED", "PENDING"].includes(refund.status));
    assert.ok(processed.length >= 4);
    assert.equal(
      statement.data.totals.refunded,
      processed.reduce((total, refund) => total + refund.amount, 0)
    );

    const overview = (await get("/api/v1/reports/dashboards/overview")).data.fees;
    assert.ok(overview.refundedThisYear >= statement.data.totals.refunded);
    assert.equal(
      overview.netCollectedThisYear,
      Math.round((overview.collectedThisYear - overview.refundedThisYear) * 100) / 100
    );

    await settleJobs();
    const inbox = await get("/api/v1/me/notifications?type=REFUND_PROCESSED&limit=50", {
      as: tokenFor(world.s3.userId, "STUDENT")
    });
    const notice = inbox.data.find(n => n.title === `Refund processed (${r.onlineRefund.refundNumber})`);
    assert.ok(notice);
    assert.match(notice.body, /goes back to the card, UPI or bank account that paid/);
  });
});

const asAccountant = () => ({ as: h.tokens.accountant });
const inboxOf = async (token, type) =>
  (await get(`/api/v1/me/notifications?type=${type}&limit=50`, { as: token })).data;
const journalOf = async (sourceType, sourceId) =>
  (await get(`${F}/ledger/journal-entries?sourceType=${sourceType}&sourceId=${sourceId}`)).data;
const linesOf = entry => entry.lines.map(l => [l.account.code, l.debit, l.credit]).sort();

describe("finance: refund approval (maker-checker)", () => {
  it("bills a second invoice and takes a counter payment", async () => {
    const plan = await post(`${F}/installment-plans`, {
      name: "Approval test annual",
      installments: [{ name: "Annual", dueDate: "2026-12-01", sharePercent: 100 }]
    });
    const structure = await post(`${F}/fee-structures`, {
      name: "Class 2 approval test fees",
      classId: world.c2.id,
      items: [{ feeHeadId: world.tuition.id, amount: 2000 }],
      installmentPlanIds: [plan.data.id],
      defaultInstallmentPlanId: plan.data.id,
      chargesLateFee: false
    });
    const issued = await post(`${F}/invoices/generation`, {
      feeStructureId: structure.data.id,
      studentIds: [world.s3.id]
    });
    r.approvalInvoice = issued.data.invoices[0];
    r.cash = (
      await post(
        `${F}/invoices/${r.approvalInvoice.id}/payments`,
        { amount: 1000, method: "CASH" },
        { as: h.tokens.office }
      )
    ).data;
  });

  it("makes an accountant's refund a request: nothing moves until an administrator approves", async () => {
    await post(
      `${F}/payments/${r.cash.id}/refunds`,
      { amount: 300, method: "CASH", reason: "x" },
      { as: h.tokens.office },
      403
    );
    const requested = await post(
      `${F}/payments/${r.cash.id}/refunds`,
      { amount: 300, method: "CASH", reason: "Overcharged for books" },
      asAccountant()
    );
    assert.equal(
      requested.message,
      `Refund of 300.00 requested for receipt ${r.cash.receiptNumber}. An administrator must approve it before any money is paid back`
    );
    assert.equal(requested.data.refundNumber, null, "numbered only when approved");
    assert.equal(requested.data.status, "REQUESTED");
    assert.deepEqual([requested.data.requester.id, requested.data.approvedBy], [world.accountant.userId, null]);
    r.request = requested.data;

    assert.equal((await invoiceOf(r.approvalInvoice.id)).amountPaid, 1000, "the invoice is untouched");
    assert.equal((await get(`${F}/payments/${r.cash.id}`)).data.refundedAmount, 0);
    assert.equal((await journalOf("REFUND", r.request.id)).length, 0, "nothing posted to the ledger");

    /* What is waiting is set aside: a second request cannot ask for it again */
    const tooMuch = await request("POST", `${F}/payments/${r.cash.id}/refunds`, {
      ...asAccountant(),
      body: { amount: 800, method: "CASH", reason: "Again" }
    });
    assert.equal(tooMuch.status, 422);
    assert.equal(
      tooMuch.body.message,
      `At most 700.00 of payment ${r.cash.receiptNumber} can still be refunded (300.00 more is waiting for approval)`
    );

    const waiting = await get(`${F}/refunds?status=REQUESTED`, asAccountant());
    assert.deepEqual(
      waiting.data.map(x => x.id),
      [r.request.id]
    );
    const noReceipt = await request("GET", `${F}/refunds/${r.request.id}/receipt`);
    assert.equal(noReceipt.status, 422);
    assert.equal(
      noReceipt.body.message,
      "The refund request of 300.00 is waiting for approval; its receipt is available once it is processed"
    );

    await settleJobs();
    const [notice] = (await inboxOf(h.tokens.admin, "REFUND_REQUESTED")).filter(n => n.data.refundId === r.request.id);
    assert.equal(notice.title, "A refund of ₹300.00 needs your approval");
    assert.match(
      notice.body,
      /^Faccountant Laccountant asked to refund ₹300\.00 of payment RCPT26-\d{6} for .+: "Overcharged for books"\./
    );
    assert.equal((await inboxOf(h.tokens.accountant, "REFUND_REQUESTED")).length, 0, "only administrators are asked");
  });

  it("lets only an administrator approve, which pays the money back once", async () => {
    const url = `${F}/refunds/${r.request.id}/approval`;
    await post(url, {}, asAccountant(), 403);
    await post(url, {}, { as: h.tokens.principal }, 403);
    await post(`${F}/refunds/${crypto.randomUUID()}/approval`, {}, {}, 404);

    const approved = await post(url, {}, {}, 200);
    r.request = approved.data;
    assert.match(r.request.refundNumber, /^RFND26-\d{6}$/);
    assert.equal(
      approved.message,
      `Refund ${r.request.refundNumber} of 300.00 approved and processed for receipt ${r.cash.receiptNumber}`
    );
    assert.equal(approved.data.status, "PROCESSED");
    assert.deepEqual([approved.data.approvedBy, approved.data.approver.lastName], [h.admin.id, "Admin"]);
    assert.deepEqual([approved.data.fromInvoice, approved.data.fromCredit], [300, 0]);
    assert.equal((await invoiceOf(r.approvalInvoice.id)).amountPaid, 700);
    assert.equal((await get(`${F}/payments/${r.cash.id}`)).data.refundedAmount, 300);

    const twice = await request("POST", url, { body: {} });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.message, `Refund ${r.request.refundNumber} was already approved (processed)`);
    await post(`${F}/refunds/${r.request.id}/rejection`, { reason: "Too late" }, {}, 409);

    const [entry] = await journalOf("REFUND", r.request.id);
    assert.deepEqual(linesOf(entry), [
      ["1000", 0, 300],
      ["1100", 300, 0]
    ]);

    await settleJobs();
    const [decided] = (await inboxOf(h.tokens.accountant, "REFUND_APPROVED")).filter(
      n => n.data.refundId === r.request.id
    );
    assert.equal(decided.title, `Refund ${r.request.refundNumber} approved`);
    assert.match(decided.body, /^Ada Admin approved refund RFND26-\d{6} of ₹300\.00\. It has been paid back\.$/);
  });

  it("rejects a request with a reason; no money moves", async () => {
    const requested = (
      await post(
        `${F}/payments/${r.cash.id}/refunds`,
        { amount: 200, method: "BANK_TRANSFER", reference: "NEFT-991", reason: "Duplicate admission fee" },
        asAccountant()
      )
    ).data;
    const url = `${F}/refunds/${requested.id}/rejection`;
    await post(url, {}, {}, 400);
    await post(url, { reason: "No" }, asAccountant(), 403);
    const rejected = await post(url, { reason: "The admission fee is not refundable" }, {}, 200);
    assert.equal(
      rejected.message,
      "The refund request of 200.00 rejected: The admission fee is not refundable. No money was paid back"
    );
    assert.deepEqual(
      [rejected.data.status, rejected.data.rejecter.firstName, rejected.data.rejectionReason],
      ["REJECTED", "Ada", "The admission fee is not refundable"]
    );
    const after = await request("POST", `${F}/refunds/${requested.id}/approval`, { body: {} });
    assert.equal(after.status, 409);
    assert.equal(after.body.message, "The refund request of 200.00 was rejected");
    assert.equal(rejected.data.refundNumber, null, "a rejected request takes no number");
    const receipt = await request("GET", `${F}/refunds/${requested.id}/receipt`);
    assert.equal(receipt.status, 422);
    assert.equal(receipt.body.message, "The refund request of 200.00 was rejected; it has no receipt");

    assert.equal((await get(`${F}/payments/${r.cash.id}`)).data.refundedAmount, 300);
    assert.equal((await invoiceOf(r.approvalInvoice.id)).amountPaid, 700);
    assert.equal((await journalOf("REFUND", requested.id)).length, 0);

    await settleJobs();
    const [notice] = (await inboxOf(h.tokens.accountant, "REFUND_REJECTED")).filter(
      n => n.data.refundId === requested.id
    );
    assert.equal(notice.title, "Refund request of ₹200.00 rejected");
    assert.match(notice.body, /: The admission fee is not refundable\. No money was paid back\.$/);
  });

  it("approves a request exactly once when two approvals race", async () => {
    const requested = (
      await post(`${F}/payments/${r.cash.id}/refunds`, { amount: 100, method: "CASH", reason: "Race" }, asAccountant())
    ).data;
    const holder = await h.pool.connect();
    let results;
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM payments WHERE id = $1 FOR UPDATE", [r.cash.id]);
      const pending = Promise.all(
        [1, 2].map(() => request("POST", `${F}/refunds/${requested.id}/approval`, { body: {} }))
      );
      for (let i = 0; i < 200 && (await lockWaiters()) < 2; i++) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(await lockWaiters(), 2, "both approvals wait on the payment lock");
      await holder.query("COMMIT");
      results = await pending;
    } finally {
      holder.release(true);
    }
    assert.deepEqual(results.map(res => res.status).sort(), [200, 409]);
    assert.equal((await get(`${F}/payments/${r.cash.id}`)).data.refundedAmount, 400, "paid back once");
    assert.equal((await invoiceOf(r.approvalInvoice.id)).amountPaid, 600);
    assert.equal((await journalOf("REFUND", requested.id)).length, 1, "posted once");
  });

  it("re-checks at approval what can still be refunded; dashboard refunds skip approval", async () => {
    r.online2 = await payOnline(r.approvalInvoice.id, 500, "pay_approval_1");
    const requested = (await post(`${F}/payments/${r.online2.id}/refunds`, { reason: "Paid twice" }, asAccountant()))
      .data;
    assert.deepEqual([requested.amount, requested.method, requested.status], [500, "ORIGINAL", "REQUESTED"]);

    /* Meanwhile, 300 is refunded in the gateway's dashboard: recorded at once, without approval */
    await sendWebhook("refund.processed", {
      id: "rfnd_dash_approval",
      payment_id: "pay_approval_1",
      amount: 30000,
      status: "processed"
    });
    const dashboard = (await get(`${F}/refunds?paymentId=${r.online2.id}&status=PROCESSED`)).data;
    assert.deepEqual(
      dashboard.map(x => [x.source, x.amount, x.approvedBy]),
      [["GATEWAY", 300, null]]
    );

    const stale = await request("POST", `${F}/refunds/${requested.id}/approval`, { body: {} });
    assert.equal(stale.status, 422);
    assert.equal(
      stale.body.message,
      `Only 200.00 of payment ${r.online2.receiptNumber} can still be refunded; reject this request and request again if needed`
    );
    assert.equal((await get(`${F}/refunds/${requested.id}`)).data.status, "REQUESTED", "still waiting");
    await post(`${F}/refunds/${requested.id}/rejection`, { reason: "Partly refunded in the dashboard" }, {}, 200);
  });

  it("prints refund receipts for processed and pending refunds, for staff and the family", async () => {
    const processed = await request("GET", `${F}/refunds/${r.request.id}/receipt`, { as: h.tokens.office });
    assert.equal(processed.status, 200);
    assert.equal(processed.headers.get("content-type"), "application/pdf");
    const text = pdfText(processed.buffer);
    const school = (await h.pool.query("SELECT name FROM tenants WHERE id = $1", [h.tenant.id])).rows[0].name;
    for (const expected of [
      school,
      "Refund Receipt",
      r.request.refundNumber,
      `Receipt ${r.cash.receiptNumber}`,
      "₹1,000.00",
      r.approvalInvoice.invoiceNumber,
      "Amount refunded: ₹300.00",
      "Taken off the invoice",
      "From the student's credit",
      "Cash",
      "Faccountant Laccountant",
      "Ada Admin",
      "PROCESSED"
    ]) {
      assert.ok(text.includes(expected), `refund receipt shows "${expected}"`);
    }

    /* The payment's own receipt says money went back */
    const feeReceipt = pdfText((await request("GET", `${F}/payments/${r.cash.id}/receipt`)).buffer);
    assert.ok(feeReceipt.includes("Refunded from this payment since: ₹400.00 (see the refund receipts)"));

    /* Pending at the gateway: the receipt says so */
    const gateway = h.modules.gateway.paymentGateway();
    const realRefund = gateway.refund;
    gateway.refund = async (_credentials, { amountMinor }) => ({
      refundId: "rfnd_pending_1",
      amountMinor,
      status: "PENDING"
    });
    let pending;
    try {
      pending = (await refundNow(r.online2.id, { amount: 50, reason: "Goodwill" })).data;
    } finally {
      gateway.refund = realRefund;
    }
    assert.equal(pending.status, "PENDING");
    const pendingText = pdfText((await request("GET", `${F}/refunds/${pending.id}/receipt`)).buffer);
    assert.ok(pendingText.includes("Refund Receipt (pending at the payment gateway)"));
    assert.ok(pendingText.includes("rfnd_pending_1"));
    const [posted] = await journalOf("REFUND", pending.id);
    assert.deepEqual(linesOf(posted), [
      ["1020", 0, 50],
      ["1100", 50, 0]
    ]);
    /* The gateway completes it later: no second posting */
    await sendWebhook("refund.processed", {
      id: "rfnd_pending_1",
      payment_id: "pay_approval_1",
      amount: 5000,
      status: "processed"
    });
    assert.equal((await get(`${F}/refunds/${pending.id}`)).data.status, "PROCESSED");
    assert.equal((await journalOf("REFUND", pending.id)).length, 1);

    /* The family: their own child's refunds only, and only once approved */
    const student = tokenFor(world.s3.userId, "STUDENT");
    const own = await request("GET", `/api/v1/me/refunds/${r.request.id}/receipt`, { as: student });
    assert.equal(own.status, 200);
    await get(`/api/v1/me/refunds/${r.request.id}/receipt`, { as: h.tokens.mother }, 404);
    const waiting = (
      await post(`${F}/payments/${r.cash.id}/refunds`, { amount: 10, method: "CASH", reason: "Later" }, asAccountant())
    ).data;
    await get(`/api/v1/me/refunds/${waiting.id}/receipt`, { as: student }, 404);

    const family = (await get(`/api/v1/me/students/${world.s3.id}/fees`, { as: student })).data;
    assert.ok(
      family.refunds.every(x => ["PENDING", "PROCESSED", "FAILED"].includes(x.status)),
      "no requests or rejections"
    );
    const staff = (await get(`${F}/students/${world.s3.id}/statement`)).data;
    assert.ok(staff.refunds.some(x => x.status === "REQUESTED") && staff.refunds.some(x => x.status === "REJECTED"));
    assert.equal(
      staff.totals.refunded,
      staff.refunds.filter(x => ["PENDING", "PROCESSED"].includes(x.status)).reduce((total, x) => total + x.amount, 0)
    );
    assert.equal(family.totals.refunded, staff.totals.refunded);
    await post(`${F}/refunds/${waiting.id}/rejection`, { reason: "Not needed" }, {}, 200);
  });
});

/* D-63: no self-approval for anyone, a school-set approval limit for accountants, credit paid
   back through the refund procedure, and numbers only on approval */
describe("finance: refund rules (D-63)", () => {
  const q = {};
  const lastRefundNumber = async () =>
    (
      await h.pool.query(
        "SELECT refund_number FROM payment_refunds WHERE refund_number IS NOT NULL ORDER BY refund_number DESC LIMIT 1"
      )
    ).rows[0].refund_number;
  const nextAfter = number => number.replace(/\d{6}$/, n => String(Number(n) + 1).padStart(6, "0"));
  const creditOf = async () => (await get(`${F}/students/${world.s3.id}/credits`)).data.balance;

  it("bills a third invoice and takes a counter payment", async () => {
    const plan = await post(`${F}/installment-plans`, {
      name: "Refund rules annual",
      installments: [{ name: "Annual", dueDate: "2026-12-01", sharePercent: 100 }]
    });
    const structure = await post(`${F}/fee-structures`, {
      name: "Class 2 refund rules fees",
      classId: world.c2.id,
      items: [{ feeHeadId: world.tuition.id, amount: 1500 }],
      installmentPlanIds: [plan.data.id],
      defaultInstallmentPlanId: plan.data.id,
      chargesLateFee: false
    });
    const issued = await post(`${F}/invoices/generation`, {
      feeStructureId: structure.data.id,
      studentIds: [world.s3.id]
    });
    q.invoice = issued.data.invoices[0];
    q.cash = (
      await post(`${F}/invoices/${q.invoice.id}/payments`, { amount: 1000, method: "CASH" }, { as: h.tokens.office })
    ).data;
  });

  it("never lets an administrator approve their own refund", async () => {
    const requested = await post(`${F}/payments/${q.cash.id}/refunds`, {
      amount: 100,
      method: "CASH",
      reason: "Bus fee charged twice"
    });
    assert.equal(
      requested.message,
      `Refund of 100.00 requested for receipt ${q.cash.receiptNumber}. Another administrator must approve it before any money is paid back`
    );
    const own = await request("POST", `${F}/refunds/${requested.data.id}/approval`, { body: {} });
    assert.equal(own.status, 403);
    assert.equal(own.body.message, "You asked for this refund, so another administrator must approve it");

    await settleJobs();
    const asked = async token =>
      (await inboxOf(token, "REFUND_REQUESTED")).filter(n => n.data.refundId === requested.data.id).length;
    assert.deepEqual([await asked(h.tokens.admin), await asked((await secondAdmin()).as)], [0, 1]);

    const approved = await post(`${F}/refunds/${requested.data.id}/approval`, {}, await secondAdmin(), 200);
    assert.deepEqual(
      [approved.data.status, approved.data.requestedBy, approved.data.approvedBy, approved.data.autoApproved],
      ["PROCESSED", h.admin.id, h.admin2.id, false]
    );

    /* The database refuses a forged self-approval too */
    const forged = await h.pool
      .query("UPDATE payment_refunds SET approved_by = requested_by WHERE id = $1", [approved.data.id])
      .catch(error => error);
    assert.equal(forged.code, "23514");
  });

  it("numbers a refund only when it is approved, so rejected requests leave no gaps", async () => {
    const before = await lastRefundNumber();
    const rejected = (
      await post(
        `${F}/payments/${q.cash.id}/refunds`,
        { amount: 50, method: "CASH", reason: "Not needed" },
        asAccountant()
      )
    ).data;
    await post(`${F}/refunds/${rejected.id}/rejection`, { reason: "Not refundable" }, {}, 200);
    const later = (
      await post(`${F}/payments/${q.cash.id}/refunds`, { amount: 50, method: "CASH", reason: "Books" }, asAccountant())
    ).data;
    const approved = await post(`${F}/refunds/${later.id}/approval`, {}, {}, 200);
    assert.equal(approved.data.refundNumber, nextAfter(before));
    assert.equal((await get(`${F}/refunds/${rejected.id}`)).data.refundNumber, null);
  });

  it("lets the administrator set an amount accountants refund without approval", async () => {
    const S = `${F}/settings`;
    assert.equal((await get(S, asAccountant())).data.refundApprovalLimit, 0, "off by default");
    await request("PATCH", S, { ...asAccountant(), body: { refundApprovalLimit: 250 } }).then(res =>
      assert.equal(res.status, 403)
    );
    const set = await request("PATCH", S, { body: { refundApprovalLimit: 250 } });
    assert.equal(set.status, 200);
    assert.equal(
      set.body.message,
      "Finance settings saved: accountants refund up to 250.00 per payment without approval"
    );

    const small = await post(
      `${F}/payments/${q.cash.id}/refunds`,
      { amount: 200, method: "CASH", reason: "Uniform returned" },
      asAccountant()
    );
    assert.match(
      small.message,
      new RegExp(
        `^Refund RFND26-\\d{6} of 200\\.00 \\(within the approval limit\\) processed for receipt ${q.cash.receiptNumber}$`
      )
    );
    assert.deepEqual(
      [small.data.status, small.data.autoApproved, small.data.approvedBy],
      ["PROCESSED", true, world.accountant.userId]
    );
    const receipt = pdfText((await request("GET", `${F}/refunds/${small.data.id}/receipt`)).buffer);
    assert.ok(receipt.includes("Within the school's refund approval limit"));

    /* The limit counts what it already let through on this payment: no splitting */
    const split = await post(
      `${F}/payments/${q.cash.id}/refunds`,
      { amount: 100, method: "CASH", reason: "Uniform returned (rest)" },
      asAccountant()
    );
    assert.equal(split.data.status, "REQUESTED");
    /* Administrators always need another administrator */
    const admins = await post(`${F}/payments/${q.cash.id}/refunds`, { amount: 10, method: "CASH", reason: "Tiny" });
    assert.equal(admins.data.status, "REQUESTED");
    for (const id of [split.data.id, admins.data.id])
      await post(`${F}/refunds/${id}/rejection`, { reason: "Test" }, await secondAdmin(), 200);
  });

  it("pays a student's credit back through the same procedure", async () => {
    /* An online payment that lands after cash cleared the invoice is kept as credit */
    const order = await post(`${F}/invoices/${q.invoice.id}/payment-orders`, { amount: 500 }, { as: h.tokens.office });
    const { balance } = await invoiceOf(q.invoice.id);
    await post(`${F}/invoices/${q.invoice.id}/payments`, { amount: balance, method: "CASH" }, { as: h.tokens.office });
    const signature = h.modules.gateway.gatewaySignature(KEY_SECRET, `${order.data.orderId}|pay_rules_credit`);
    await post(
      `${F}/payments/confirmations`,
      { orderId: order.data.orderId, paymentId: "pay_rules_credit", signature },
      { as: h.tokens.office },
      200
    );
    const credit = await creditOf();
    assert.ok(credit >= 500);
    await request("PATCH", `${F}/settings`, { body: { refundApprovalLimit: 0 } });

    const url = `${F}/students/${world.s3.id}/credit-refunds`;
    await post(url, { amount: 100, method: "ORIGINAL", reason: "x" }, asAccountant(), 400);
    const requested = await post(url, { amount: 300, method: "CASH", reason: "Family keeps only 200" }, asAccountant());
    assert.equal(
      requested.message,
      "Refund of 300.00 requested from the student's credit. An administrator must approve it before any money is paid back"
    );
    assert.deepEqual(
      [requested.data.status, requested.data.refundNumber, requested.data.paymentId, requested.data.fromCredit],
      ["REQUESTED", null, null, 300]
    );
    assert.equal(await creditOf(), credit, "nothing moves before approval");
    const tooMuch = await request("POST", url, {
      ...asAccountant(),
      body: { amount: credit, method: "CASH", reason: "All of it" }
    });
    assert.equal(tooMuch.status, 422);
    assert.equal(
      tooMuch.body.message,
      `At most ${(credit - 300).toFixed(2)} of the student's credit can be paid back (300.00 more is waiting for approval)`
    );
    const listed = await get(`${F}/refunds?creditOnly=true&status=REQUESTED`);
    assert.deepEqual(
      listed.data.map(x => x.id),
      [requested.data.id]
    );

    const approved = await post(`${F}/refunds/${requested.data.id}/approval`, {}, {}, 200);
    assert.match(approved.message, /^Refund RFND26-\d{6} of 300\.00 approved and processed from the student's credit$/);
    assert.equal(await creditOf(), credit - 300);
    const [entry] = await journalOf("REFUND", requested.data.id);
    assert.deepEqual(linesOf(entry), [
      ["1000", 0, 300],
      ["2100", 300, 0]
    ]);
    assert.match(entry.narration, /of student credit$/);

    const receipt = pdfText((await request("GET", `${F}/refunds/${requested.data.id}/receipt`)).buffer);
    for (const expected of [
      approved.data.refundNumber,
      "The student's credit",
      "Amount refunded: ₹300.00",
      "Ada Admin"
    ])
      assert.ok(receipt.includes(expected), `credit refund receipt shows "${expected}"`);
    const family = tokenFor(world.s3.userId, "STUDENT");
    assert.equal((await request("GET", `/api/v1/me/refunds/${requested.data.id}/receipt`, { as: family })).status, 200);

    /* On the statement, and in the year's refunded total */
    const statement = (await get(`${F}/students/${world.s3.id}/statement`)).data;
    assert.ok(statement.refunds.some(x => x.id === requested.data.id));
    const overview = (await get("/api/v1/reports/dashboards/overview")).data.fees;
    assert.ok(overview.refundedThisYear >= statement.totals.refunded);
  });
});
