import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, request, get, post, settleJobs, tokenFor } from "../helpers/harness.js";

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

    const refund = await post(`${F}/payments/${r.online.id}/refunds`, { amount: 400, reason: "Overcharged transport" });
    assert.match(refund.message, /^Refund RFND26-\d{6} of 400\.00 processed for receipt RCPT26-\d{6}$/);
    assert.equal(refund.data.method, "ORIGINAL");
    assert.equal(refund.data.status, "PROCESSED");
    assert.match(refund.data.gatewayRefundId, /^rfnd_mock_/);
    assert.deepEqual([refund.data.fromInvoice, refund.data.fromCredit, refund.data.unallocated], [400, 0, 0]);
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
    const refund = await post(`${F}/payments/${cash.id}/refunds`, { reason: "Paid twice", method: "CASH" });
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
    const reopen = await post(
      `${F}/payments/${r.paid.id}/refunds`,
      { amount: 100, reason: "Partial refund to reopen the invoice", method: "ORIGINAL" },
      {},
      201
    );
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

    const refund = await post(`${F}/payments/${extra.id}/refunds`, { reason: "Paid twice online" });
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
    assert.deepEqual(results.map(res => res.status).sort(), [201, 409]);
    assert.equal((await get(`${F}/payments/${payment.id}`)).data.refundedAmount, 1000);
  });

  it("shows refunds on the statement and tells the family", async () => {
    const statement = await get(`${F}/students/${world.s3.id}/statement`);
    const processed = statement.data.refunds.filter(refund => refund.status !== "FAILED");
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
