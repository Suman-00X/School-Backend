import { and, eq, inArray, lt } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { fromMinor, sum, toMinor } from "../../../../common/money/money.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { concessionService } from "../../concessions/index.js";
import { creditService } from "../../credits/index.js";
import { installmentPlanService } from "../../installment-plans/index.js";
import { paymentService } from "../../payments/index.js";
import { OPEN_INVOICE_STATUSES } from "../../shared/constants/finance.constants.js";
import { statusFor } from "../../shared/utils/invoiceMath.util.js";
import { invoices } from "../models/invoice.schema.js";
import { invoiceRepository } from "../repositories/invoice.repository.js";

export const INVOICES_ISSUED = "finance.invoices.issued";

export const withDetails = {
  lines: {
    with: {
      feeHead: { columns: { id: true, name: true, code: true } },
      concessions: { columns: { concessionId: true, name: true, amount: true } }
    }
  },
  installment: { columns: { id: true, name: true, sequence: true, dueDate: true, sharePercent: true } },
  plan: { columns: { id: true, name: true } },
  structure: { columns: { id: true, name: true } },
  student: {
    columns: { id: true, studentCode: true, admissionNumber: true },
    with: { user: { columns: { firstName: true, lastName: true } } }
  }
};

/* Concessions of an invoice, totalled over its lines: [{ concessionId, name, amount }] */
export const concessionSummary = lines => {
  const totals = new Map();
  for (const { concessions = [] } of lines ?? []) {
    for (const { concessionId, name, amount } of concessions) {
      const entry = totals.get(concessionId) ?? { concessionId, name, minor: 0 };
      entry.minor += toMinor(amount);
      totals.set(concessionId, entry);
    }
  }
  return [...totals.values()].map(({ minor, ...entry }) => ({ ...entry, amount: fromMinor(minor) }));
};

/* The API shape of an invoice: overdue flag, concessions applied, late-fee waiver */
const view = (invoice, today) =>
  invoice && {
    ...invoice,
    isOverdue: OPEN_INVOICE_STATUSES.includes(invoice.status) && invoice.dueDate < today,
    concessions: concessionSummary(invoice.lines),
    lateFeeWaiver: invoice.lateFeeWaivedAt
      ? {
          amount: invoice.lateFeeWaivedAmount,
          reason: invoice.lateFeeWaiverReason,
          waivedAt: invoice.lateFeeWaivedAt,
          waivedBy: invoice.lateFeeWaivedBy
        }
      : null
  };

export const invoiceService = {
  /* Year-scoped list */
  list: async (ctx, { page, limit, status, studentId, feeStructureId, installmentPlanId, overdue }) => {
    const today = await tenantToday(ctx.tenantId);
    const result = await invoiceRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withDetails,
      conditions: [
        eq(invoices.academicYearId, ctx.academicYearId),
        status && eq(invoices.status, status),
        studentId && eq(invoices.studentId, studentId),
        feeStructureId && eq(invoices.feeStructureId, feeStructureId),
        installmentPlanId && eq(invoices.installmentPlanId, installmentPlanId),
        overdue && and(inArray(invoices.status, OPEN_INVOICE_STATUSES), lt(invoices.dueDate, today))
      ].filter(Boolean)
    });
    return { ...result, rows: result.rows.map(row => view(row, today)) };
  },

  getById: async (ctx, invoiceId) => {
    const invoice = await invoiceRepository.findById(ctx.tenantId, invoiceId, { with: withDetails });
    if (!invoice) throw notFound("Invoice");
    const [payments, creditApplications] = await Promise.all([
      paymentService.forInvoice(ctx, invoiceId),
      creditService.appliedTo(ctx, invoiceId)
    ]);
    return { ...view(invoice, await tenantToday(ctx.tenantId)), payments, creditApplications };
  },

  /* Only invoices with nothing paid can be cancelled (locked: a payment may be arriving) */
  cancel: async (ctx, invoiceId, { reason }) =>
    transaction(async tx => {
      const invoice = await invoiceRepository.lockForUpdate(ctx.tenantId, invoiceId, { dbc: tx });
      if (!invoice) throw notFound("Invoice");
      if (invoice.status === "CANCELLED") throw conflict("The invoice is already cancelled");
      if (toMinor(invoice.amountPaid) > 0) throw unprocessable("An invoice with payments cannot be cancelled");
      return invoiceRepository.update(
        ctx.tenantId,
        invoiceId,
        { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
        { dbc: tx }
      );
    }),

  /* Everything a student owes and paid in a year: plan, concessions, invoices with
     gross / concession / net, payments, and unused credit */
  statement: async (ctx, studentId, { academicYearId } = {}) => {
    const year = academicYearId
      ? await academicYearService.findById(ctx, academicYearId)
      : await academicYearService.findCurrent(ctx);
    if (!year) throw unprocessable("No academic year found for this statement");
    const today = await tenantToday(ctx.tenantId);

    const rows = await invoiceRepository.findMany(ctx.tenantId, {
      conditions: [eq(invoices.studentId, studentId), eq(invoices.academicYearId, year.id)],
      with: withDetails
    });
    const live = rows.filter(invoice => invoice.status !== "CANCELLED");
    const [payments, grants, assigned, credit] = await Promise.all([
      /* Including money that reached a cancelled invoice (kept as credit) */
      paymentService.forStudent(
        ctx,
        studentId,
        rows.map(invoice => invoice.id)
      ),
      concessionService.grantsInYear(ctx, year.id, [studentId]),
      installmentPlanService.assignedInYear(ctx, year.id, [studentId]),
      creditService.forStudent(ctx, studentId)
    ]);
    const [plan] = await installmentPlanService.findManyByIds(ctx, [assigned.get(studentId)].filter(Boolean));
    const applied = concessionSummary(live.flatMap(invoice => invoice.lines));

    return {
      studentId,
      academicYearId: year.id,
      /* null: each fee structure's default plan */
      installmentPlan: plan ? { id: plan.id, name: plan.name, installmentCount: plan.installments.length } : null,
      concessions: grants.map(grant => ({
        grantId: grant.id,
        concessionId: grant.concessionId,
        name: grant.concession.name,
        category: grant.concession.category,
        concessionType: grant.concession.concessionType,
        value: grant.concession.value,
        reason: grant.reason,
        /* Taken off this year's live invoices so far */
        amount: applied.find(a => a.concessionId === grant.concessionId)?.amount ?? 0
      })),
      totals: {
        gross: sum(live.map(i => i.subtotal)),
        concessions: sum(live.map(i => i.discount)),
        lateFees: sum(live.map(i => i.lateFee)),
        lateFeesWaived: sum(live.map(i => i.lateFeeWaivedAmount)),
        billed: sum(live.map(i => i.total)),
        paid: sum(live.map(i => i.amountPaid)),
        balance: sum(live.map(i => i.balance)),
        overdue: sum(
          live.filter(i => OPEN_INVOICE_STATUSES.includes(i.status) && i.dueDate < today).map(i => i.balance)
        )
      },
      credit: { balance: credit.balance },
      invoices: rows.map(invoice => view(invoice, today)),
      payments,
      creditEntries: credit.entries
    };
  },

  /* For other submodules */
  existsForStructure: (ctx, feeStructureId) =>
    invoiceRepository.exists(ctx.tenantId, [eq(invoices.feeStructureId, feeStructureId)]),

  existsForPlan: (ctx, installmentPlanId) =>
    invoiceRepository.exists(ctx.tenantId, [eq(invoices.installmentPlanId, installmentPlanId)]),

  existsForStructurePlan: (ctx, feeStructureId, installmentPlanId) =>
    invoiceRepository.exists(ctx.tenantId, [
      eq(invoices.feeStructureId, feeStructureId),
      eq(invoices.installmentPlanId, installmentPlanId),
      inArray(invoices.status, ["ISSUED", "PARTIALLY_PAID", "PAID"])
    ]),

  findById: (ctx, invoiceId) => invoiceRepository.findById(ctx.tenantId, invoiceId),

  /* With lines and concessions (receipts) */
  findDetailed: (ctx, invoiceId) => invoiceRepository.findById(ctx.tenantId, invoiceId, { with: withDetails }),

  findManyByIds: (ctx, invoiceIds) =>
    invoiceIds.length
      ? invoiceRepository.findMany(ctx.tenantId, { conditions: [inArray(invoices.id, invoiceIds)] })
      : [],

  /* All tenants: open invoices due within `days` days or overdue (reminders) */
  findOpenDueWithin: days => invoiceRepository.findOpenDueWithin(days),

  lockForUpdate: (tenantId, invoiceId, options) => invoiceRepository.lockForUpdate(tenantId, invoiceId, options),

  /* Add money to a locked invoice. The caller makes sure it does not exceed the balance. */
  applyPayment: (tenantId, invoice, amount, { dbc }) => {
    const amountPaid = fromMinor(toMinor(invoice.amountPaid) + toMinor(amount));
    return invoiceRepository.update(
      tenantId,
      invoice.id,
      { amountPaid, status: statusFor(invoice.total, amountPaid) },
      { dbc }
    );
  }
};
