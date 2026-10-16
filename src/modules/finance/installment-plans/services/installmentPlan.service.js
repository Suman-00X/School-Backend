import { asc, eq, inArray, isNotNull } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { sum } from "../../../../common/money/money.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { feeStructureService } from "../../fee-structures/index.js";
import { invoiceService } from "../../invoices/index.js";
import { installmentPlans, planInstallments, studentInstallmentPlans } from "../models/installmentPlan.schema.js";
import { installmentPlanRepository, planAssignmentRepository } from "../repositories/installmentPlan.repository.js";

const withInstallments = { installments: { orderBy: [asc(planInstallments.sequence)] } };

const view = plan => plan && { ...plan, installmentCount: plan.installments.length };

/* "Quarterly plan (4 installments)" */
export const describePlan = plan =>
  `${plan.name} plan (${plan.installments.length} installment${plan.installments.length === 1 ? "" : "s"})`;

/* Shares add up to exactly 100%, and due dates fall inside the year in order */
const checkInstallments = (installments, academicYear) => {
  const total = sum(installments.map(i => i.sharePercent));
  if (total !== 100) throw unprocessable(`Installment shares must add up to 100% (they add up to ${total}%)`);
  installments.forEach((installment, index) => {
    if (installment.dueDate < academicYear.startDate || installment.dueDate > academicYear.endDate) {
      throw unprocessable(
        `${installment.name} is due ${installment.dueDate}, outside the academic year ${academicYear.yearName}`
      );
    }
    const previous = installments[index - 1];
    if (previous && installment.dueDate <= previous.dueDate) {
      throw unprocessable(`${installment.name} must be due after ${previous.name} (${previous.dueDate})`);
    }
  });
};

export const installmentPlanService = {
  /* Year-scoped */
  list: async (ctx, { page, limit }) => {
    const result = await installmentPlanRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: [eq(installmentPlans.academicYearId, ctx.academicYearId)],
      with: withInstallments
    });
    return { ...result, rows: result.rows.map(view) };
  },

  getById: async (ctx, planId) => {
    const plan = await installmentPlanRepository.findById(ctx.tenantId, planId, { with: withInstallments });
    if (!plan) throw notFound("Installment plan");
    return view(plan);
  },

  create: async (ctx, { installments, ...data }) => {
    checkInstallments(installments, ctx.academicYear);
    const id = await transaction(async tx => {
      const plan = await installmentPlanRepository.create(
        ctx.tenantId,
        { ...data, academicYearId: ctx.academicYearId },
        { dbc: tx }
      );
      await installmentPlanRepository.replaceInstallments(ctx.tenantId, plan.id, installments, { dbc: tx });
      return plan.id;
    });
    return installmentPlanService.getById(ctx, id);
  },

  /* Name and description can always change; installments only until invoices use them */
  update: async (ctx, planId, { installments, ...data }) => {
    const plan = await installmentPlanService.getById(ctx, planId);
    if (installments) {
      if (await invoiceService.existsForPlan(ctx, planId)) {
        throw conflict(`Invoices have been issued under the ${plan.name} plan; its installments can no longer change`);
      }
      checkInstallments(installments, await academicYearService.findById(ctx, plan.academicYearId));
    }
    await transaction(async tx => {
      await installmentPlanRepository.update(ctx.tenantId, planId, data, { dbc: tx });
      if (installments) {
        await installmentPlanRepository.replaceInstallments(ctx.tenantId, planId, installments, { dbc: tx });
      }
    });
    return installmentPlanService.getById(ctx, planId);
  },

  remove: async (ctx, planId) => {
    const plan = await installmentPlanService.getById(ctx, planId);
    const offeredBy = await feeStructureService.offeringPlan(ctx, planId);
    if (offeredBy.length) {
      throw conflict(
        `The ${plan.name} plan is offered by ${offeredBy.map(s => s.name).join(", ")}; remove it from the fee structure first`
      );
    }
    const assigned = await planAssignmentRepository.count(ctx.tenantId, [
      eq(studentInstallmentPlans.installmentPlanId, planId)
    ]);
    if (assigned) {
      throw conflict(`The ${plan.name} plan is assigned to ${assigned} student(s); assign them another plan first`);
    }
    return installmentPlanRepository.softDelete(ctx.tenantId, planId);
  },

  /* For other submodules: plans with installments (in sequence) */
  findManyByIds: (ctx, planIds) =>
    planIds.length
      ? installmentPlanRepository.findMany(ctx.tenantId, {
          conditions: [inArray(installmentPlans.id, [...new Set(planIds)])],
          with: withInstallments
        })
      : [],

  /* Explicit assignments of a year: Map studentId -> installmentPlanId */
  assignedInYear: async (ctx, academicYearId, studentIds) => {
    if (!studentIds.length) return new Map();
    const rows = await planAssignmentRepository.findMany(ctx.tenantId, {
      conditions: [
        eq(studentInstallmentPlans.academicYearId, academicYearId),
        inArray(studentInstallmentPlans.studentId, studentIds),
        isNotNull(studentInstallmentPlans.installmentPlanId)
      ]
    });
    return new Map(rows.map(row => [row.studentId, row.installmentPlanId]));
  },

  /* Lock the students' plan rows for the year (see planAssignmentRepository.lockForStudents) */
  lockStudents: (ctx, academicYearId, studentIds, { dbc }) =>
    planAssignmentRepository.lockForStudents(ctx.tenantId, academicYearId, studentIds, { dbc })
};
