import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, call, get, post, patch, settleJobs } from "../helpers/harness.js";

const F = "/api/v1/finance";
const ME = "/api/v1/me";
const C = "/api/v1/communication";

/* The school's own Razorpay secrets (BYOK); the mock gateway checks signatures with them */
const KEY_SECRET = "school-one-key-secret-7Hq2";
const WEBHOOK_SECRET = "school-one-webhook-secret-Zp4";
const webhookUrl = tenantId => `/api/v1/public/payments/razorpay/${tenantId}/webhook`;

const inbox = async (token, type) =>
  (await get(`${ME}/notifications?limit=100${type ? `&type=${type}` : ""}`, { as: token })).data;

describe("finance: structures, concessions, invoices", () => {
  it("defines fee heads, an installment plan, a late-fee rule and a structure", async () => {
    world.tuition = (await post(`${F}/fee-heads`, { name: "Tuition", code: "tuition" })).data;
    world.transport = (await post(`${F}/fee-heads`, { name: "Transport", code: "TRANSPORT" })).data;
    assert.equal(world.tuition.code, "TUITION");
    await post(`${F}/fee-heads`, { name: "Tuition 2", code: "TUITION" }, {}, 409);

    const badShares = await request("POST", `${F}/installment-plans`, {
      body: {
        name: "Termly",
        installments: [
          { name: "Term 1", dueDate: "2026-07-15", sharePercent: 60 },
          { name: "Term 2", dueDate: "2026-11-15", sharePercent: 30 }
        ]
      }
    });
    assert.equal(badShares.status, 422);
    assert.equal(badShares.body.message, "Installment shares must add up to 100% (they add up to 90%)");
    const outside = await request("POST", `${F}/installment-plans`, {
      body: { name: "Termly", installments: [{ name: "Term 1", dueDate: "2030-01-01", sharePercent: 100 }] }
    });
    assert.equal(outside.status, 422);
    assert.equal(outside.body.message, "Term 1 is due 2030-01-01, outside the academic year 2026-27");

    const termly = await post(`${F}/installment-plans`, {
      name: "Termly",
      installments: [
        { name: "Term 1", dueDate: "2026-07-15", sharePercent: 40 },
        { name: "Term 2", dueDate: "2026-11-15", sharePercent: 35 },
        { name: "Term 3", dueDate: "2027-02-15", sharePercent: 25 }
      ]
    });
    assert.equal(termly.data.installmentCount, 3);
    world.termly = termly.data;

    /* The school default: 10 a day after 5 grace days, at most 500 */
    world.standardLateFee = (
      await post(`${F}/late-fee-rules`, {
        name: "Standard",
        graceDays: 5,
        maxAmount: 500,
        isDefault: true,
        slabs: [{ fromDay: 1, chargeType: "PER_DAY", amount: 10 }]
      })
    ).data;

    const base = {
      name: "Class 1 Fees",
      classId: world.c1.id,
      items: [
        { feeHeadId: world.tuition.id, amount: 10000 },
        { feeHeadId: world.transport.id, amount: 5000 }
      ],
      installmentPlanIds: [termly.data.id],
      defaultInstallmentPlanId: termly.data.id
    };
    const structure = await post(`${F}/fee-structures`, base);
    assert.equal(structure.data.totalAmount, 15000);
    assert.equal(structure.data.defaultInstallmentPlanId, termly.data.id);
    assert.deepEqual(
      structure.data.installmentPlans[0].installments.map(i => [i.sequence, i.name, i.sharePercent]),
      [
        [1, "Term 1", 40],
        [2, "Term 2", 35],
        [3, "Term 3", 25]
      ]
    );
    assert.equal(structure.data.chargesLateFee, true);
    world.structure = structure.data;
    world.term1 = structure.data.installmentPlans[0].installments.find(i => i.name === "Term 1");
    await post(`${F}/fee-structures`, base, { as: h.tokens.office }, 403);
  });

  it("grants concessions", async () => {
    const sibling = (
      await post(`${F}/concessions`, { name: "Sibling", category: "SIBLING", concessionType: "PERCENT", value: 10 })
    ).data;
    /* FIXED amounts are per year: the whole year's transport */
    const waiver = (
      await post(`${F}/concessions`, {
        name: "Transport waiver",
        concessionType: "FIXED",
        value: 5000,
        feeHeadIds: [world.transport.id]
      })
    ).data;
    assert.deepEqual(waiver.feeHeadIds, [world.transport.id]);
    assert.equal(waiver.category, "OTHER");
    await post(`${F}/concessions`, { name: "Too much", concessionType: "PERCENT", value: 150 }, {}, 400);

    const granted = await post(`${F}/concession-grants`, {
      studentId: world.s2.id,
      concessionId: sibling.id,
      reason: "Second child"
    });
    assert.equal(granted.message, "Sibling (10%) granted to Fstudent2 Lstudent2");
    await post(`${F}/concession-grants`, { studentId: world.s1.id, concessionId: waiver.id });
    const twice = await request("POST", `${F}/concession-grants`, {
      body: { studentId: world.s2.id, concessionId: sibling.id }
    });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.message, "Fstudent2 Lstudent2 already has Sibling for 2026-27");
  });

  it("issues invoices by installment plan with concessions, exactly once", async () => {
    const issued = await post(`${F}/invoices/generation`, {
      feeStructureId: world.structure.id,
      throughDate: "2026-07-15"
    });
    assert.equal(issued.data.created, 4, "Term 1 for every active student of Class 1");
    assert.equal(issued.message, "4 invoice(s) issued through 2026-07-15, 0 already invoiced");
    assert.match(issued.data.invoices[0].invoiceNumber, /^INV26-0{5}\d$/);

    const again = await post(`${F}/invoices/generation`, {
      feeStructureId: world.structure.id,
      throughDate: "2026-07-15"
    });
    assert.deepEqual([again.data.created, again.data.skipped], [0, 4]);

    const byStudent = id => issued.data.invoices.find(i => i.studentId === id);
    /* s1: 4000 tuition + 2000 transport - 40% of the 5000 a year transport waiver */
    assert.equal(byStudent(world.s1.id).total, 4000);
    /* s2: 6000 - 10% */
    assert.equal(byStudent(world.s2.id).total, 5400);
    world.inv1 = byStudent(world.s1.id);
    world.inv2 = byStudent(world.s2.id);
    world.term1Invoices = issued.data.invoices;

    const detail = await get(`${F}/invoices/${world.inv2.id}`);
    assert.deepEqual(
      detail.data.lines.map(l => [l.feeHead.code, l.amount, l.discount, l.netAmount, l.concessions.map(c => c.name)]),
      [
        ["TUITION", 4000, 400, 3600, ["Sibling"]],
        ["TRANSPORT", 2000, 200, 1800, ["Sibling"]]
      ]
    );
    assert.deepEqual(detail.data.concessions, [
      { concessionId: detail.data.concessions[0].concessionId, name: "Sibling", amount: 600 }
    ]);
    assert.deepEqual([detail.data.plan.name, detail.data.installment.name], ["Termly", "Term 1"]);
    assert.equal(detail.data.balance, 5400);
    assert.equal(detail.data.isOverdue, true);

    await patch(
      `${F}/fee-structures/${world.structure.id}`,
      { items: [{ feeHeadId: world.tuition.id, amount: 1 }] },
      {},
      409
    );
    const list = await get(`${F}/invoices?overdue=true`);
    assert.equal(list.meta.total, 4);
  });

  it("cancels unpaid invoices and allows re-issuing", async () => {
    /* Ira: the Class 1 student who is not one of the mother's children */
    const children = (await get(`${ME}/students`, { as: h.tokens.mother })).data.map(s => s.id);
    const ira = world.term1Invoices.find(i => !children.includes(i.studentId));
    await post(`${F}/invoices/${ira.id}/cancellation`, { reason: "Wrong structure" }, {}, 200);
    await post(`${F}/invoices/${ira.id}/cancellation`, { reason: "again" }, {}, 409);
    const reissued = await post(`${F}/invoices/generation`, {
      feeStructureId: world.structure.id,
      throughDate: "2026-07-15"
    });
    assert.equal(reissued.data.created, 1);
  });
});

describe("finance: payments", () => {
  it("collects counter payments with receipts", async () => {
    const paid = await post(
      `${F}/invoices/${world.inv2.id}/payments`,
      { amount: 1000, method: "CASH" },
      { as: h.tokens.office }
    );
    assert.match(paid.message, /^Payment received\. Receipt RCPT26-0{5}1$/);
    assert.equal(paid.data.invoice.status, "PARTIALLY_PAID");
    assert.equal(paid.data.invoice.balance, 4400);
    world.cashPayment = paid.data;

    const tooMuch = await request("POST", `${F}/invoices/${world.inv2.id}/payments`, {
      as: h.tokens.office,
      body: { amount: 5000, method: "CASH" }
    });
    assert.equal(tooMuch.status, 422);
    assert.equal(tooMuch.body.message, "The amount exceeds the invoice balance of 4400");
    await post(
      `${F}/invoices/${world.inv2.id}/payments`,
      { amount: 10, method: "CHEQUE" },
      { as: h.tokens.office },
      400
    );
    await post(
      `${F}/invoices/${world.inv2.id}/payments`,
      { amount: 10, method: "CASH" },
      { as: h.tokens.teacher },
      403
    );
  });

  it("needs the school's own Razorpay keys before taking online payments", async () => {
    const before = await request("POST", `${ME}/students/${world.s2.id}/invoices/${world.inv2.id}/payment-orders`, {
      as: h.tokens.mother,
      body: {}
    });
    assert.equal(before.status, 422);
    assert.equal(before.body.message, "Online payments are not set up for this school");
    assert.equal((await get(`${F}/payment-settings`)).data.configured, false);

    const keys = { keyId: "rzp_test_School1Key", keySecret: KEY_SECRET, webhookSecret: WEBHOOK_SECRET };
    await call("PUT", `${F}/payment-settings`, { body: keys, as: h.tokens.accountant }, 403);
    const saved = await call("PUT", `${F}/payment-settings`, { body: keys });
    assert.equal(saved.message, "Razorpay keys saved (test mode). Online payments are on");
    assert.equal(saved.data.keySecret, `****${KEY_SECRET.slice(-4)}`);
    world.gatewayKeys = keys;
  });

  it("takes online payments from the parent portal, idempotently", async () => {
    const { gatewaySignature: sign } = h.modules.gateway;
    const order = await post(
      `${ME}/students/${world.s2.id}/invoices/${world.inv2.id}/payment-orders`,
      {},
      { as: h.tokens.mother }
    );
    assert.equal(order.data.amountMinor, 440000);
    assert.equal(order.data.provider, "mock");
    assert.equal(order.data.keyId, "rzp_test_School1Key");

    await post(
      `${ME}/payments/confirmations`,
      { orderId: order.data.orderId, paymentId: "pay_1", signature: "forged" },
      { as: h.tokens.mother },
      422
    );

    const confirmed = await post(
      `${ME}/payments/confirmations`,
      { orderId: order.data.orderId, paymentId: "pay_1", signature: sign(KEY_SECRET, `${order.data.orderId}|pay_1`) },
      { as: h.tokens.mother },
      200
    );
    assert.equal(confirmed.data.status, "SUCCEEDED");
    assert.equal(confirmed.data.invoice.status, "PAID");
    assert.equal(confirmed.data.invoice.balance, 0);

    /* The gateway's webhook for the same payment changes nothing */
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_1", order_id: order.data.orderId, amount: 440000 } } }
    });
    const hook = await request("POST", webhookUrl(h.tenant.id), {
      as: null,
      raw: body,
      headers: { "x-razorpay-signature": sign(WEBHOOK_SECRET, body) }
    });
    assert.equal(hook.status, 200);
    const invoice = await get(`${F}/invoices/${world.inv2.id}`);
    assert.equal(invoice.data.amountPaid, 5400);
    assert.equal(invoice.data.payments.filter(p => p.status === "SUCCEEDED").length, 2);

    const forged = await request("POST", webhookUrl(h.tenant.id), {
      as: null,
      raw: body,
      headers: { "x-razorpay-signature": "nope" }
    });
    assert.equal(forged.status, 422);

    /* Paying someone else's child is not possible */
    await post(
      `${ME}/students/${world.s3.id}/invoices/${world.inv2.id}/payment-orders`,
      {},
      { as: h.tokens.mother },
      404
    );
  });

  it("never settles a webhook whose amount or currency differs from the order", async () => {
    const { gatewaySignature: sign } = h.modules.gateway;
    const order = await post(`${F}/invoices/${world.inv1.id}/payment-orders`, {}, { as: h.tokens.office });
    for (const entity of [
      { id: "pay_low", order_id: order.data.orderId, amount: 100 },
      { id: "pay_usd", order_id: order.data.orderId, amount: 400000, currency: "USD" }
    ]) {
      const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity } } });
      const hook = await request("POST", webhookUrl(h.tenant.id), {
        as: null,
        raw: body,
        headers: { "x-razorpay-signature": sign(WEBHOOK_SECRET, body) }
      });
      assert.equal(hook.body.data.handled, false);
    }
    assert.notEqual((await get(`${F}/invoices/${world.inv1.id}`)).data.status, "PAID");
  });

  it("settles a payment that arrives by webhook first", async () => {
    const { gatewaySignature: sign } = h.modules.gateway;
    const order = await post(`${F}/invoices/${world.inv1.id}/payment-orders`, {}, { as: h.tokens.office });
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_2", order_id: order.data.orderId, amount: 400000 } } }
    });
    const hook = await request("POST", webhookUrl(h.tenant.id), {
      as: null,
      raw: body,
      headers: { "x-razorpay-signature": sign(WEBHOOK_SECRET, body) }
    });
    assert.equal(hook.body.data.handled, true);
    assert.equal((await get(`${F}/invoices/${world.inv1.id}`)).data.status, "PAID");
  });

  it("produces receipts, statements and payment lists", async () => {
    const receipt = await request("GET", `${F}/payments/${world.cashPayment.id}/receipt`);
    assert.equal(receipt.status, 200);
    assert.equal(receipt.headers.get("content-type"), "application/pdf");
    assert.equal(receipt.buffer.subarray(0, 4).toString(), "%PDF");

    const portalReceipt = await request("GET", `${ME}/payments/${world.cashPayment.id}/receipt`, {
      as: h.tokens.mother
    });
    assert.equal(portalReceipt.status, 200);
    await get(`${ME}/payments/${world.cashPayment.id}/receipt`, { as: h.tokens.student1 }, 404);

    const statement = await get(`${F}/students/${world.s2.id}/statement`);
    assert.deepEqual(statement.data.totals, {
      gross: 6000,
      concessions: 600,
      lateFees: 0,
      lateFeesWaived: 0,
      billed: 5400,
      paid: 5400,
      refunded: 0,
      balance: 0,
      overdue: 0
    });
    assert.deepEqual(
      statement.data.concessions.map(c => [c.name, c.category, c.reason, c.amount]),
      [["Sibling", "SIBLING", "Second child", 600]]
    );
    assert.equal(statement.data.installmentPlan, null, "the structure's default plan");
    assert.equal(statement.data.credit.balance, 0);
    const portal = await get(`${ME}/students/${world.s2.id}/fees`, { as: h.tokens.mother });
    assert.equal(portal.data.payments.length, 2);

    const cash = await get(`${F}/payments?method=CASH`);
    assert.equal(cash.meta.total, 1);
  });

  it("applies the school's default late-fee rule to overdue invoices, idempotently", async () => {
    for (let run = 0; run < 2; run++) {
      await h.modules.jobs.enqueue("finance.applyLateFees", { tenantId: h.tenant.id });
      await settleJobs();
    }
    const open = (await get(`${F}/invoices?status=ISSUED`)).data;
    assert.ok(open.length >= 1);
    for (const invoice of open) {
      assert.equal(invoice.lateFee, 500, "10/day after 5 grace days, capped at 500");
      assert.equal(invoice.total, invoice.subtotal - invoice.discount + 500);
    }
  });
});

describe("communication", () => {
  it("alerted the parent about the absence once", async () => {
    await settleJobs();
    const alerts = await inbox(h.tokens.mother, "ATTENDANCE_ABSENT");
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].title, "Fstudent2 Lstudent2 was absent today");
    assert.equal(alerts[0].data.date, "2026-07-06");
  });

  it("told families about results, invoices and payments", async () => {
    const results = await inbox(h.tokens.student1, "RESULTS_PUBLISHED");
    assert.equal(results.length, 1, "republishing did not notify twice");

    const invoices = await inbox(h.tokens.mother, "INVOICE_ISSUED");
    assert.equal(invoices.length, 3, "one per child");

    const payments = await inbox(h.tokens.mother, "PAYMENT_RECEIVED");
    assert.ok(payments.some(n => /Receipt RCPT26-0{5}1/.test(n.body)));

    const { outbox } = h.modules;
    assert.ok(outbox.email.some(m => m.to === "mother@test.school" && /invoice/i.test(m.subject)));

    const importer = await inbox(h.tokens.office, "IMPORT_COMPLETED");
    assert.equal(importer.length, 1);
  });

  it("manages the inbox", async () => {
    const before = (await get(`${ME}/notifications/unread-count`, { as: h.tokens.mother })).data.unread;
    assert.ok(before > 0);
    const [first] = await inbox(h.tokens.mother);
    await patch(`${ME}/notifications/${first.id}`, { read: true }, { as: h.tokens.mother });
    assert.equal((await get(`${ME}/notifications/unread-count`, { as: h.tokens.mother })).data.unread, before - 1);
    await patch(`${ME}/notifications/${first.id}`, { read: true }, { as: h.tokens.student1 }, 404);

    const all = await post(`${ME}/notifications/read-all`, {}, { as: h.tokens.mother }, 200);
    assert.equal(all.data.updated, before - 1);
    assert.equal((await get(`${ME}/notifications/unread-count`, { as: h.tokens.mother })).data.unread, 0);
  });

  it("publishes announcements to an audience", async () => {
    const draft = await post(`${C}/announcements`, {
      title: "Parent-teacher meeting",
      body: "Saturday 10am in the main hall.",
      audience: { roles: ["PARENT", "TEACHER"], sectionIds: [world.s1A.id] },
      channels: ["EMAIL"]
    });
    assert.deepEqual(draft.data.channels, ["IN_APP", "EMAIL"]);
    assert.equal(draft.data.status, "DRAFT");

    await post(`${C}/announcements/${draft.data.id}/publication`, {}, {}, 200);
    await settleJobs();
    const published = await get(`${C}/announcements/${draft.data.id}`);
    assert.equal(published.data.status, "PUBLISHED");
    /* mother, Ira's father + both teachers */
    assert.equal(published.data.recipientCount, 4);
    assert.equal(published.data.delivery.channels.EMAIL.SENT, 4);
    await patch(`${C}/announcements/${draft.data.id}`, { title: "x" }, {}, 409);

    assert.equal((await inbox(h.tokens.teacher2, "ANNOUNCEMENT")).length, 1);
    assert.equal((await inbox(h.tokens.student1, "ANNOUNCEMENT")).length, 0);

    const later = await post(`${C}/announcements`, { title: "Later", body: "Soon", audience: { roles: ["STAFF"] } });
    const scheduled = await post(
      `${C}/announcements/${later.data.id}/publication`,
      { publishAt: new Date(Date.now() + 3_600_000).toISOString() },
      {},
      200
    );
    assert.match(scheduled.message, /^Announcement scheduled for /);
    assert.equal(scheduled.data.status, "SCHEDULED");
  });

  it("sends direct messages and daily fee reminders", async () => {
    const sent = await post(`${C}/messages`, {
      studentIds: [world.s3.id],
      title: "Hello",
      body: "Please see the office."
    });
    assert.equal(sent.data.recipients, 1);

    /* An invoice due today gets one reminder per day */
    const once = (
      await post(`${F}/installment-plans`, {
        name: "Activity (once)",
        installments: [{ name: "Once", dueDate: todayIn("Asia/Kolkata"), sharePercent: 100 }]
      })
    ).data;
    const dueToday = (
      await post(`${F}/fee-structures`, {
        name: "Activity",
        classId: world.c2.id,
        items: [{ feeHeadId: world.tuition.id, amount: 300 }],
        installmentPlanIds: [once.id],
        defaultInstallmentPlanId: once.id
      })
    ).data;
    await post(`${F}/invoices/generation`, { feeStructureId: dueToday.id });

    const s3Token = (await import("../helpers/harness.js")).tokenFor(world.s3.userId, "STUDENT");
    for (let run = 0; run < 2; run++) {
      await h.modules.jobs.enqueue("communication.feeReminders", { tenantId: h.tenant.id });
      await settleJobs();
    }
    const reminders = await inbox(s3Token, "FEE_REMINDER");
    assert.equal(reminders.length, 1);
    assert.match(reminders[0].title, /^Fee due soon: INV26-/);
  });
});
