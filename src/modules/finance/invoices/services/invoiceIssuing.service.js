import { transaction } from "../../../../common/database/postgres.js";
import { publish } from "../../../../common/events/events.js";
import { conflict, unprocessable } from "../../../../common/http/errors.js";
import { fromMinor, sum, toMinor } from "../../../../common/money/money.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { maxDate } from "../../../../common/utils/date.util.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { enrollmentService } from "../../../academics/enrollments/index.js";
import { sectionService } from "../../../academics/sections/index.js";
import { concessionService } from "../../concessions/index.js";
import { feeStructureService } from "../../fee-structures/index.js";
import { installmentPlanService } from "../../installment-plans/index.js";
import { nextInvoiceNumber } from "../../shared/utils/codes.util.js";
import { annualFees, installmentLines, statusFor } from "../../shared/utils/invoiceMath.util.js";
import { invoiceRepository } from "../repositories/invoice.repository.js";
import { INVOICES_ISSUED } from "./invoice.service.js";

const nameOf = student => `${student?.user?.firstName ?? ""} ${student?.user?.lastName ?? ""}`.trim();

/* The plan a student pays a structure by: their assigned plan when the structure
   offers it, else the structure's default */
const planFor = (structure, assignedPlanId) =>
  structure.installmentPlans.find(p => p.id === assignedPlanId) ??
  structure.installmentPlans.find(p => p.id === structure.defaultInstallmentPlanId);

/* A student's grants as the concessions the math expects (oldest grant first) */
const concessionsOf = grants => grants.map(grant => ({ ...grant.concession, grantId: grant.id }));

const byStudent = grants => {
  const map = new Map();
  for (const grant of grants) map.set(grant.studentId, [...(map.get(grant.studentId) ?? []), grant]);
  return map;
};

/* Lines of one installment for a student: gross, concessions (named) and net per fee head */
const buildLines = (structure, plan, installment, concessions) => {
  const shares = plan.installments.map(i => i.sharePercent);
  const index = plan.installments.findIndex(i => i.id === installment.id);
  return installmentLines(annualFees(structure.items, concessions), shares, index).map((line, k) => ({
    feeHeadId: line.feeHeadId,
    description: `${structure.items[k].feeHead.name} (${installment.name})`,
    amount: line.amount,
    discount: line.discount,
    netAmount: line.netAmount,
    concessions: line.concessions.map(c => ({
      concessionId: c.concession.id,
      studentConcessionId: c.concession.grantId,
      name: c.concession.name,
      amount: c.amount
    }))
  }));
};

const amountsOf = lines => {
  const subtotal = sum(lines.map(l => l.amount));
  const discount = sum(lines.map(l => l.discount));
  return { subtotal, discount, net: fromMinor(toMinor(subtotal) - toMinor(discount)) };
};

/* Lines compared by what they charge and which concessions took what */
const signature = lines =>
  lines
    .map(
      l =>
        `${l.feeHeadId}:${toMinor(l.amount)}:${toMinor(l.discount)}:${(l.concessions ?? [])
          .map(c => `${c.concessionId}=${toMinor(c.amount)}`)
          .sort()
          .join(",")}`
    )
    .sort()
    .join("|");

/* Insert one invoice (inside the caller's transaction) */
const issueOne = async (
  ctx,
  { structure, plan, installment, studentId, concessions, academicYear, issueDate, notes },
  tx
) => {
  const lines = buildLines(structure, plan, installment, concessions);
  const { subtotal, discount, net } = amountsOf(lines);
  const invoice = await invoiceRepository.create(
    ctx.tenantId,
    {
      invoiceNumber: await nextInvoiceNumber(ctx.tenantId, academicYear.startDate, { dbc: tx }),
      studentId,
      academicYearId: academicYear.id,
      feeStructureId: structure.id,
      installmentPlanId: plan.id,
      planInstallmentId: installment.id,
      issueDate,
      dueDate: installment.dueDate,
      subtotal,
      discount,
      total: net,
      status: statusFor(net, 0),
      notes
    },
    { dbc: tx }
  );
  await invoiceRepository.insertLines(ctx.tenantId, invoice.id, lines, { dbc: tx });
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    studentId,
    installmentPlanId: plan.id,
    installment: installment.name,
    dueDate: invoice.dueDate,
    total: invoice.total
  };
};

/* Active students of the sections a structure covers (optionally one section, or some students) */
const studentsCovered = async (ctx, structure, { sectionId, studentIds }) => {
  let sections = await sectionService.findAllInYear(ctx, structure.academicYearId);
  if (structure.classId) sections = sections.filter(section => section.classId === structure.classId);
  if (sectionId) {
    sections = sections.filter(section => section.id === sectionId);
    if (!sections.length) throw unprocessable("The section is not covered by this fee structure");
  }
  const rosters = await Promise.all(sections.map(section => enrollmentService.findRoster(ctx, section.id)));
  const covered = [...new Set(rosters.flat().map(enrollment => enrollment.studentId))];
  if (!studentIds) return covered;
  const missing = studentIds.filter(id => !covered.includes(id));
  if (missing.length) {
    throw unprocessable(`${missing.length} of the students are not active in the sections this fee structure covers`);
  }
  return studentIds;
};

export const invoiceIssuingService = {
  /* Issue each covered student's installments due on or before `throughDate` (default:
     the whole year), scheduled by the student's own plan. Idempotent: installments
     already invoiced are skipped. A student keeps the plan their invoices from this
     structure were issued under; changing it goes through plan assignment. */
  generate: async (ctx, { feeStructureId, sectionId, studentIds, throughDate, issueDate, notes }) => {
    const structure = await feeStructureService.getById(ctx, feeStructureId);
    const academicYear = await academicYearService.findById(ctx, structure.academicYearId);
    const students = (await studentsCovered(ctx, structure, { sectionId, studentIds })).sort();
    const through = throughDate ?? academicYear.endDate;
    const issuedOn = issueDate ?? (await tenantToday(ctx.tenantId));

    const result = await transaction(async tx => {
      /* Plans and concessions are read under the students' locks, so a concurrent plan
         change or grant either sees these invoices or is seen by them */
      const locked = await installmentPlanService.lockStudents(ctx, academicYear.id, students, { dbc: tx });
      const assigned = new Map(locked.map(row => [row.studentId, row.installmentPlanId]));
      const live = await invoiceRepository.liveForStructure(ctx.tenantId, structure.id, students, { dbc: tx });
      const grants = byStudent(await concessionService.grantsInYear(ctx, academicYear.id, students, { dbc: tx }));

      const created = [];
      let skipped = 0;
      for (const studentId of students) {
        const existing = live.filter(row => row.studentId === studentId);
        const plan =
          structure.installmentPlans.find(p => p.id === existing[0]?.installmentPlanId) ??
          planFor(structure, assigned.get(studentId));
        const issued = new Set(existing.map(row => row.planInstallmentId));
        const concessions = concessionsOf(grants.get(studentId) ?? []);
        for (const installment of plan.installments.filter(i => i.dueDate <= through)) {
          if (issued.has(installment.id)) {
            skipped++;
            continue;
          }
          created.push(
            await issueOne(
              ctx,
              { structure, plan, installment, studentId, concessions, academicYear, issueDate: issuedOn, notes },
              tx
            )
          );
        }
      }
      return { created, skipped };
    });

    if (result.created.length) {
      await publish(INVOICES_ISSUED, { tenantId: ctx.tenantId, invoiceIds: result.created.map(i => i.id) });
    }
    const byPlan = structure.installmentPlans
      .map(plan => ({
        installmentPlanId: plan.id,
        name: plan.name,
        invoices: result.created.filter(i => i.installmentPlanId === plan.id).length
      }))
      .filter(entry => entry.invoices);
    return {
      created: result.created.length,
      skipped: result.skipped,
      throughDate: through,
      byPlan,
      invoices: result.created
    };
  },

  /* A student's plan for the year is changing (their plan row is locked by the caller).
     Refused once any invoice of the year has money on it. Otherwise each structure's
     unpaid invoices under the old plan are cancelled and the new plan's installments
     due by the latest cancelled due date (at least its first) are issued instead. */
  rescheduleForPlanChange: async (ctx, { student, academicYear, installmentPlanId }, { dbc }) => {
    const live = await invoiceRepository.lockLiveForStudent(ctx.tenantId, student.id, academicYear.id, { dbc });
    const paid = live.filter(invoice => toMinor(invoice.amountPaid) > 0);
    if (paid.length) {
      throw conflict(
        `${nameOf(student)} has already paid towards ${academicYear.yearName} invoices (${paid
          .map(i => i.invoiceNumber)
          .join(", ")}); the installment plan can no longer change`
      );
    }
    const result = { cancelled: [], issued: [] };
    if (!live.length) return result;

    const concessions = concessionsOf(
      await concessionService.grantsInYear(ctx, academicYear.id, [student.id], { dbc })
    );
    const today = await tenantToday(ctx.tenantId);
    const byStructure = Map.groupBy(live, invoice => invoice.feeStructureId);
    for (const [feeStructureId, invoices] of byStructure) {
      const structure = await feeStructureService.getById(ctx, feeStructureId);
      const plan = planFor(structure, installmentPlanId);
      if (plan.id === invoices[0].installmentPlanId) continue;

      for (const invoice of invoices) {
        await invoiceRepository.update(
          ctx.tenantId,
          invoice.id,
          { status: "CANCELLED", cancelledAt: new Date(), cancelReason: `Installment plan changed to ${plan.name}` },
          { dbc }
        );
        result.cancelled.push(invoice.invoiceNumber);
      }
      const horizon = invoices.map(i => i.dueDate).reduce(maxDate);
      const due = plan.installments.filter(i => i.dueDate <= horizon);
      for (const installment of due.length ? due : plan.installments.slice(0, 1)) {
        result.issued.push(
          await issueOne(
            ctx,
            {
              structure,
              plan,
              installment,
              studentId: student.id,
              concessions,
              academicYear,
              issueDate: today,
              notes: `Re-issued: installment plan changed to ${plan.name}`
            },
            dbc
          )
        );
      }
    }
    return result;
  },

  /* Concessions changed (the student's plan row is locked by the caller): rebuild the
     lines of every invoice of the year with nothing paid. Invoices with money on them
     are never touched. -> invoice numbers that changed */
  recalculateUnpaid: async (ctx, studentId, academicYearId, { dbc }) => {
    const unpaid = (
      await invoiceRepository.lockLiveForStudent(ctx.tenantId, studentId, academicYearId, { dbc })
    ).filter(invoice => toMinor(invoice.amountPaid) === 0);
    if (!unpaid.length) return [];

    const concessions = concessionsOf(await concessionService.grantsInYear(ctx, academicYearId, [studentId], { dbc }));
    const structures = new Map();
    const changed = [];
    for (const invoice of unpaid) {
      if (!structures.has(invoice.feeStructureId)) {
        structures.set(invoice.feeStructureId, await feeStructureService.getById(ctx, invoice.feeStructureId));
      }
      const structure = structures.get(invoice.feeStructureId);
      const plan = structure.installmentPlans.find(p => p.id === invoice.installmentPlanId);
      const installment = plan.installments.find(i => i.id === invoice.planInstallmentId);
      const lines = buildLines(structure, plan, installment, concessions);

      const current = await invoiceRepository.findById(ctx.tenantId, invoice.id, {
        with: { lines: { with: { concessions: true } } },
        dbc
      });
      if (signature(current.lines) === signature(lines)) continue;

      const { subtotal, discount, net } = amountsOf(lines);
      const total = fromMinor(toMinor(net) + toMinor(invoice.lateFee));
      await invoiceRepository.deleteLines(ctx.tenantId, invoice.id, { dbc });
      await invoiceRepository.insertLines(ctx.tenantId, invoice.id, lines, { dbc });
      await invoiceRepository.update(
        ctx.tenantId,
        invoice.id,
        { subtotal, discount, total, status: statusFor(total, 0) },
        { dbc }
      );
      changed.push(invoice.invoiceNumber);
    }
    return changed;
  }
};
