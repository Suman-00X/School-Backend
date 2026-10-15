import { and, eq, inArray, lt } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { publish } from "../../../../common/events/events.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { fromMinor, sum, toMinor } from "../../../../common/money/money.js";
import { getTenant, tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { todayIn } from "../../../../common/utils/date.util.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { enrollmentService } from "../../../academics/enrollments/index.js";
import { sectionService } from "../../../academics/sections/index.js";
import { concessionService } from "../../concessions/index.js";
import { feeStructureService } from "../../fee-structures/index.js";
import { paymentService } from "../../payments/index.js";
import { OPEN_INVOICE_STATUSES } from "../../shared/constants/finance.constants.js";
import { nextInvoiceNumber } from "../../shared/utils/codes.util.js";
import { installmentAmount, lateFeeFor, lineDiscount, statusFor } from "../../shared/utils/invoiceMath.util.js";
import { invoices } from "../models/invoice.schema.js";
import { invoiceRepository } from "../repositories/invoice.repository.js";

export const INVOICES_ISSUED = "finance.invoices.issued";

const withDetails = {
  lines: { with: { feeHead: { columns: { id: true, name: true, code: true } } } },
  installment: { columns: { id: true, name: true, dueDate: true } },
  structure: { columns: { id: true, name: true } },
  student: {
    columns: { id: true, studentCode: true, admissionNumber: true },
    with: { user: { columns: { firstName: true, lastName: true } } }
  }
};

const withOverdue = (invoice, today) =>
  invoice && { ...invoice, isOverdue: OPEN_INVOICE_STATUSES.includes(invoice.status) && invoice.dueDate < today };

/* Lines of one student's invoice for an installment, with concession discounts */
const buildLines = (structure, installment, concessions) =>
  structure.items.map(item => {
    const amount = installmentAmount(item.amount, installment, structure.installments);
    const discount = lineDiscount({ feeHeadId: item.feeHeadId, amount }, concessions);
    return {
      feeHeadId: item.feeHeadId,
      description: `${item.feeHead.name} (${installment.name})`,
      amount,
      discount,
      netAmount: fromMinor(toMinor(amount) - toMinor(discount))
    };
  });

export const invoiceService = {
  /* Issue invoices for one installment to every active student of the
     structure's class (or one section). Students already invoiced are skipped. */
  generate: async (ctx, { feeStructureId, feeInstallmentId, sectionId, issueDate, notes }) => {
    const structure = await feeStructureService.getById(ctx, feeStructureId);
    const installment = structure.installments.find(i => i.id === feeInstallmentId);
    if (!installment) throw unprocessable("feeInstallmentId is not an installment of this fee structure");
    const academicYear = await academicYearService.findById(ctx, structure.academicYearId);

    let sections = await sectionService.findAllInYear(ctx, structure.academicYearId);
    if (structure.classId) sections = sections.filter(section => section.classId === structure.classId);
    if (sectionId) {
      sections = sections.filter(section => section.id === sectionId);
      if (!sections.length) throw unprocessable("The section is not covered by this fee structure");
    }

    const rosters = await Promise.all(sections.map(section => enrollmentService.findRoster(ctx, section.id)));
    const studentIds = [...new Set(rosters.flat().map(enrollment => enrollment.studentId))];
    const alreadyInvoiced = await invoiceRepository.liveStudentIdsForInstallment(ctx.tenantId, feeInstallmentId);
    const toInvoice = studentIds.filter(id => !alreadyInvoiced.has(id));

    const concessionsByStudent = new Map();
    for (const grant of await concessionService.findAllInYear(ctx, structure.academicYearId)) {
      if (!concessionsByStudent.has(grant.studentId)) concessionsByStudent.set(grant.studentId, []);
      concessionsByStudent.get(grant.studentId).push(grant.concession);
    }

    const issuedOn = issueDate ?? (await tenantToday(ctx.tenantId));
    const created = await transaction(async tx => {
      const rows = [];
      for (const studentId of toInvoice) {
        const lines = buildLines(structure, installment, concessionsByStudent.get(studentId) ?? []);
        const subtotal = sum(lines.map(l => l.amount));
        const discount = sum(lines.map(l => l.discount));
        const invoice = await invoiceRepository.create(
          ctx.tenantId,
          {
            invoiceNumber: await nextInvoiceNumber(ctx.tenantId, academicYear.startDate, { dbc: tx }),
            studentId,
            academicYearId: structure.academicYearId,
            feeStructureId,
            feeInstallmentId,
            issueDate: issuedOn,
            dueDate: installment.dueDate,
            subtotal,
            discount,
            total: fromMinor(toMinor(subtotal) - toMinor(discount)),
            notes
          },
          { dbc: tx }
        );
        await invoiceRepository.insertLines(ctx.tenantId, invoice.id, lines, { dbc: tx });
        rows.push({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, studentId, total: invoice.total });
      }
      return rows;
    });

    if (created.length) await publish(INVOICES_ISSUED, { tenantId: ctx.tenantId, invoiceIds: created.map(i => i.id) });
    return { created: created.length, skipped: alreadyInvoiced.size, invoices: created };
  },

  /* Year-scoped list */
  list: async (ctx, { page, limit, status, studentId, feeStructureId, overdue }) => {
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
        overdue && and(inArray(invoices.status, OPEN_INVOICE_STATUSES), lt(invoices.dueDate, today))
      ].filter(Boolean)
    });
    return { ...result, rows: result.rows.map(row => withOverdue(row, today)) };
  },

  getById: async (ctx, invoiceId) => {
    const invoice = await invoiceRepository.findById(ctx.tenantId, invoiceId, { with: withDetails });
    if (!invoice) throw notFound("Invoice");
    const payments = await paymentService.forInvoice(ctx, invoiceId);
    return { ...withOverdue(invoice, await tenantToday(ctx.tenantId)), payments };
  },

  /* Only invoices with nothing paid can be cancelled */
  cancel: async (ctx, invoiceId, { reason }) => {
    const invoice = await invoiceRepository.findById(ctx.tenantId, invoiceId);
    if (!invoice) throw notFound("Invoice");
    if (invoice.status === "CANCELLED") throw conflict("The invoice is already cancelled");
    if (toMinor(invoice.amountPaid) > 0) throw unprocessable("An invoice with payments cannot be cancelled");
    return invoiceRepository.update(ctx.tenantId, invoiceId, {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: reason
    });
  },

  /* Every invoice and payment of a student in a year, with totals */
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
    const payments = await paymentService.forStudent(
      ctx,
      studentId,
      live.map(invoice => invoice.id)
    );

    return {
      studentId,
      academicYearId: year.id,
      totals: {
        billed: sum(live.map(i => i.total)),
        paid: sum(live.map(i => i.amountPaid)),
        balance: sum(live.map(i => i.balance)),
        overdue: sum(
          live.filter(i => OPEN_INVOICE_STATUSES.includes(i.status) && i.dueDate < today).map(i => i.balance)
        )
      },
      invoices: rows.map(invoice => withOverdue(invoice, today)),
      payments
    };
  },

  /* For other submodules */
  existsForStructure: (ctx, feeStructureId) =>
    invoiceRepository.exists(ctx.tenantId, [eq(invoices.feeStructureId, feeStructureId)]),

  findById: (ctx, invoiceId) => invoiceRepository.findById(ctx.tenantId, invoiceId),

  findManyByIds: (ctx, invoiceIds) =>
    invoiceIds.length
      ? invoiceRepository.findMany(ctx.tenantId, { conditions: [inArray(invoices.id, invoiceIds)] })
      : [],

  /* All tenants: open invoices due within `days` days or overdue (reminders) */
  findOpenDueWithin: days => invoiceRepository.findOpenDueWithin(days),

  lockForUpdate: (tenantId, invoiceId, options) => invoiceRepository.lockForUpdate(tenantId, invoiceId, options),

  /* Add a payment to a locked invoice */
  applyPayment: (tenantId, invoice, amount, { dbc }) => {
    const amountPaid = fromMinor(toMinor(invoice.amountPaid) + toMinor(amount));
    return invoiceRepository.update(
      tenantId,
      invoice.id,
      { amountPaid, status: statusFor(invoice.total, amountPaid) },
      { dbc }
    );
  },

  /* Scheduled job: bring late fees up to date on every overdue open invoice (all schools) */
  applyLateFees: async () => {
    const candidates = await invoiceRepository.findLateFeeCandidates();
    const todayByTenant = new Map();
    let updated = 0;
    for (const { invoice, structure } of candidates) {
      if (!todayByTenant.has(invoice.tenantId)) {
        todayByTenant.set(invoice.tenantId, todayIn((await getTenant(invoice.tenantId))?.timezone ?? "UTC"));
      }
      const lateFee = lateFeeFor(structure, invoice.dueDate, todayByTenant.get(invoice.tenantId));
      if (toMinor(lateFee) === toMinor(invoice.lateFee)) continue;
      const total = fromMinor(toMinor(invoice.subtotal) - toMinor(invoice.discount) + toMinor(lateFee));
      await invoiceRepository.update(invoice.tenantId, invoice.id, {
        lateFee,
        total,
        status: statusFor(total, invoice.amountPaid)
      });
      updated++;
    }
    return { checked: candidates.length, updated };
  }
};
