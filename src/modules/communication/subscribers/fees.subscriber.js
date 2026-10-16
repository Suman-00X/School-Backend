import { subscribe } from "../../../common/events/events.js";
import { claimOnce } from "../../../common/jobs/claims.js";
import { defineJob, defineSchedule } from "../../../common/jobs/queue.js";
import { getTenant } from "../../../common/tenancy/tenant.service.js";
import { daysBetween, todayIn } from "../../../common/utils/date.util.js";
import { studentService } from "../../users/students/index.js";
import { INVOICES_ISSUED, invoiceService } from "../../finance/invoices/index.js";
import {
  PAYMENT_RECEIVED,
  REFUND_DECIDED,
  REFUND_PROCESSED,
  REFUND_REQUESTED,
  paymentService,
  refundService
} from "../../finance/payments/index.js";
import { notificationService } from "../notifications/index.js";
import { recipients } from "../shared/services/recipients.service.js";
import { messages } from "../shared/templates/messages.js";

const nameOf = student => `${student?.user?.firstName ?? ""} ${student?.user?.lastName ?? ""}`.trim();

/* New invoices -> the student and their parents */
subscribe(INVOICES_ISSUED, "communication.invoiceIssued", async ({ tenantId, invoiceIds }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const tenant = await getTenant(tenantId);
  const invoices = await invoiceService.findManyByIds(ctx, invoiceIds);
  const students = new Map(
    (await studentService.findManyByIds(ctx, [...new Set(invoices.map(i => i.studentId))])).map(s => [s.id, s])
  );

  for (const invoice of invoices) {
    await notificationService.notify(ctx, {
      userIds: await recipients.forStudents(ctx, [invoice.studentId]),
      type: "INVOICE_ISSUED",
      ...messages.invoiceIssued({
        studentName: nameOf(students.get(invoice.studentId)),
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        dueDate: invoice.dueDate,
        currency: tenant?.currency
      }),
      data: { invoiceId: invoice.id, studentId: invoice.studentId },
      channels: ["IN_APP", "EMAIL"]
    });
  }
});

/* Refund processed -> the student and their parents, once per refund */
subscribe(REFUND_PROCESSED, "communication.refundProcessed", async ({ tenantId, refundId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const refund = await refundService.findById(ctx, refundId);
  if (!refund || refund.status !== "PROCESSED" || !(await claimOnce(`refund:${refundId}`))) return;
  const tenant = await getTenant(tenantId);
  const [student] = await studentService.findManyByIds(ctx, [refund.studentId]);
  await notificationService.notify(ctx, {
    userIds: await recipients.forStudents(ctx, [refund.studentId]),
    type: "REFUND_PROCESSED",
    ...messages.refundProcessed({
      studentName: nameOf(student),
      amount: refund.amount,
      refundNumber: refund.refundNumber,
      receiptNumber: refund.payment?.receiptNumber,
      toOriginal: refund.method === "ORIGINAL",
      currency: tenant?.currency
    }),
    data: { refundId, paymentId: refund.paymentId, invoiceId: refund.invoiceId, studentId: refund.studentId },
    channels: ["IN_APP", "EMAIL"]
  });
});

/* Refund requested -> every administrator (in-app), once per request */
subscribe(REFUND_REQUESTED, "communication.refundRequested", async ({ tenantId, refundId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const refund = await refundService.findById(ctx, refundId);
  if (!refund || refund.status !== "REQUESTED" || !(await claimOnce(`refund-requested:${refundId}`))) return;
  const tenant = await getTenant(tenantId);
  await notificationService.notify(ctx, {
    userIds: await recipients.forAudience(ctx, { roles: ["ADMIN"] }),
    type: "REFUND_REQUESTED",
    ...messages.refundRequested({
      refundNumber: refund.refundNumber,
      amount: refund.amount,
      receiptNumber: refund.payment?.receiptNumber,
      studentName: nameOf(refund.student),
      requesterName: nameOf({ user: refund.requester }) || "A colleague",
      reason: refund.reason,
      currency: tenant?.currency
    }),
    data: { refundId, paymentId: refund.paymentId, studentId: refund.studentId }
  });
});

/* Refund approved or rejected -> the person who asked (in-app), once */
subscribe(REFUND_DECIDED, "communication.refundDecided", async ({ tenantId, refundId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const refund = await refundService.findById(ctx, refundId);
  if (!refund?.requestedBy || !(await claimOnce(`refund-decided:${refundId}`))) return;
  const approved = refund.status !== "REJECTED";
  const tenant = await getTenant(tenantId);
  await notificationService.notify(ctx, {
    userIds: [refund.requestedBy],
    type: approved ? "REFUND_APPROVED" : "REFUND_REJECTED",
    ...messages.refundDecided({
      refundNumber: refund.refundNumber,
      amount: refund.amount,
      approved,
      pending: refund.status === "PENDING",
      deciderName: nameOf({ user: approved ? refund.approver : refund.rejecter }) || "An administrator",
      reason: refund.rejectionReason,
      currency: tenant?.currency
    }),
    data: { refundId, paymentId: refund.paymentId, studentId: refund.studentId, status: refund.status }
  });
});

/* Payment confirmation with the receipt number */
subscribe(PAYMENT_RECEIVED, "communication.paymentReceived", async ({ tenantId, paymentId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const tenant = await getTenant(tenantId);
  const payment = await paymentService.getById(ctx, paymentId);
  await notificationService.notify(ctx, {
    userIds: await recipients.forStudents(ctx, [payment.studentId]),
    type: "PAYMENT_RECEIVED",
    ...messages.paymentReceived({
      studentName: nameOf(payment.student),
      amount: payment.amount,
      receiptNumber: payment.receiptNumber,
      credit: payment.excessAmount,
      currency: tenant?.currency
    }),
    data: { paymentId, invoiceId: payment.invoiceId, studentId: payment.studentId },
    channels: ["IN_APP", "EMAIL", "SMS"]
  });
});

/* Daily: remind 3 days before the due date, on the due date, and weekly while overdue */
export const shouldRemind = daysUntilDue =>
  daysUntilDue === 3 || daysUntilDue === 0 || (daysUntilDue < 0 && -daysUntilDue % 7 === 0);

export const sendFeeReminders = async () => {
  const todayByTenant = new Map();
  let sent = 0;
  for (const invoice of await invoiceService.findOpenDueWithin(3)) {
    const { tenantId } = invoice;
    const ctx = { tenantId, role: "SYSTEM" };
    if (!todayByTenant.has(tenantId)) {
      const tenant = await getTenant(tenantId);
      todayByTenant.set(tenantId, { today: todayIn(tenant?.timezone ?? "UTC"), currency: tenant?.currency });
    }
    const { today, currency } = todayByTenant.get(tenantId);
    const daysUntilDue = daysBetween(today, invoice.dueDate);
    if (!shouldRemind(daysUntilDue)) continue;

    if (!(await claimOnce(`fee-reminder:${tenantId}:${invoice.id}:${today}`))) continue;

    const [student] = await studentService.findManyByIds(ctx, [invoice.studentId]);
    await notificationService.notify(ctx, {
      userIds: await recipients.forStudents(ctx, [invoice.studentId]),
      type: "FEE_REMINDER",
      ...messages.feeReminder({
        studentName: nameOf(student),
        invoiceNumber: invoice.invoiceNumber,
        balance: invoice.balance,
        dueDate: invoice.dueDate,
        overdue: daysUntilDue < 0,
        currency
      }),
      data: { invoiceId: invoice.id, studentId: invoice.studentId, on: today },
      channels: ["IN_APP", "SMS"]
    });
    sent++;
  }
  return { sent };
};

export const feeReminderJob = defineJob("communication.feeReminders", sendFeeReminders, { attempts: 2 });
defineSchedule("communication.feeReminders.daily", {
  job: feeReminderJob,
  cron: "30 3 * * *",
  everyMs: 24 * 60 * 60 * 1000
});
