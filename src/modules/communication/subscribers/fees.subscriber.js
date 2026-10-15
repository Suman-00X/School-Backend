import { subscribe } from "../../../common/events/events.js";
import { claimOnce } from "../../../common/jobs/claims.js";
import { defineJob, defineSchedule } from "../../../common/jobs/queue.js";
import { getTenant } from "../../../common/tenancy/tenant.service.js";
import { daysBetween, todayIn } from "../../../common/utils/date.util.js";
import { studentService } from "../../users/students/index.js";
import { INVOICES_ISSUED, invoiceService } from "../../finance/invoices/index.js";
import { PAYMENT_RECEIVED, paymentService } from "../../finance/payments/index.js";
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
