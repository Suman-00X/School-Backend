import { asc, eq, isNull, or } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { sum } from "../../../../common/money/money.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { classService } from "../../../academics/classes/index.js";
import { feeHeadService } from "../../fee-heads/index.js";
import { installmentPlanService } from "../../installment-plans/index.js";
import { invoiceService } from "../../invoices/index.js";
import { lateFeeRuleService } from "../../late-fee-rules/index.js";
import { planInstallments } from "../../installment-plans/models/installmentPlan.schema.js";
import { feeStructures } from "../models/feeStructure.schema.js";
import { feeStructureRepository } from "../repositories/feeStructure.repository.js";

const withChildren = {
  items: { with: { feeHead: { columns: { id: true, name: true, code: true } } } },
  plans: {
    with: {
      plan: {
        columns: { id: true, name: true, academicYearId: true },
        with: { installments: { orderBy: [asc(planInstallments.sequence)] } }
      }
    }
  },
  class: { columns: { id: true, className: true } },
  lateFeeRule: { columns: { id: true, name: true } }
};

/* Offered plans (default first) with their installments, and the annual total */
const view = ({ plans, ...structure }) => ({
  ...structure,
  totalAmount: sum(structure.items.map(item => item.amount)),
  defaultInstallmentPlanId: plans.find(p => p.isDefault)?.installmentPlanId ?? null,
  installmentPlans: plans
    .map(p => ({ ...p.plan, isDefault: p.isDefault }))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
});

const checkReferences = async (ctx, { classId, items, lateFeeRuleId }) => {
  if (classId && !(await classService.exists(ctx, classId)))
    throw unprocessable("classId does not refer to an existing class");
  if (
    items &&
    !(await feeHeadService.allExist(
      ctx,
      items.map(i => i.feeHeadId)
    ))
  ) {
    throw unprocessable("One or more items reference a fee head that does not exist");
  }
  if (lateFeeRuleId && !(await lateFeeRuleService.exists(ctx, lateFeeRuleId))) {
    throw unprocessable("lateFeeRuleId does not refer to an existing late fee rule");
  }
};

/* The offered plans must be plans of the structure's year; one of them is the default */
const planRows = async (ctx, academicYear, installmentPlanIds, defaultInstallmentPlanId) => {
  const plans = await installmentPlanService.findManyByIds(ctx, installmentPlanIds);
  if (plans.length !== installmentPlanIds.length || plans.some(p => p.academicYearId !== academicYear.id)) {
    throw unprocessable(`installmentPlanIds must refer to installment plans of ${academicYear.yearName}`);
  }
  if (!installmentPlanIds.includes(defaultInstallmentPlanId)) {
    throw unprocessable("defaultInstallmentPlanId must be one of the structure's installment plans");
  }
  return installmentPlanIds.map(installmentPlanId => ({
    installmentPlanId,
    isDefault: installmentPlanId === defaultInstallmentPlanId
  }));
};

/* chargesLateFee false never has a rule */
const lateFeeFields = ({ chargesLateFee, lateFeeRuleId }) => {
  if (chargesLateFee === false && lateFeeRuleId) {
    throw unprocessable("A structure that charges no late fee cannot have a late fee rule");
  }
  return chargesLateFee === false ? { chargesLateFee, lateFeeRuleId: null } : { chargesLateFee, lateFeeRuleId };
};

export const feeStructureService = {
  /* Year-scoped */
  list: async (ctx, { page, limit, classId }) => {
    const result = await feeStructureRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: [
        eq(feeStructures.academicYearId, ctx.academicYearId),
        classId && eq(feeStructures.classId, classId)
      ].filter(Boolean),
      with: withChildren
    });
    return { ...result, rows: result.rows.map(view) };
  },

  getById: async (ctx, structureId) => {
    const structure = await feeStructureRepository.findById(ctx.tenantId, structureId, { with: withChildren });
    if (!structure) throw notFound("Fee structure");
    return view(structure);
  },

  create: async (ctx, { items, installmentPlanIds, defaultInstallmentPlanId, ...data }) => {
    const plans = await planRows(ctx, ctx.academicYear, installmentPlanIds, defaultInstallmentPlanId);
    await checkReferences(ctx, { classId: data.classId, items, lateFeeRuleId: data.lateFeeRuleId });
    const id = await transaction(async tx => {
      const structure = await feeStructureRepository.create(
        ctx.tenantId,
        { ...data, ...lateFeeFields(data), academicYearId: ctx.academicYearId },
        { dbc: tx }
      );
      await feeStructureRepository.replaceChildren(ctx.tenantId, structure.id, { items, plans }, { dbc: tx });
      return structure.id;
    });
    return feeStructureService.getById(ctx, id);
  },

  /* Amounts are frozen once invoices exist. Plans can be added, and the default
     changed, but a plan with live invoices from this structure stays offered. */
  update: async (ctx, structureId, { items, installmentPlanIds, defaultInstallmentPlanId, ...data }) => {
    const existing = await feeStructureService.getById(ctx, structureId);
    if (items && (await invoiceService.existsForStructure(ctx, structureId))) {
      throw conflict("Invoices have been issued from this structure; its items can no longer change");
    }

    let plans;
    if (installmentPlanIds || defaultInstallmentPlanId) {
      const ids = installmentPlanIds ?? existing.installmentPlans.map(p => p.id);
      for (const removed of existing.installmentPlans.filter(p => !ids.includes(p.id))) {
        if (await invoiceService.existsForStructurePlan(ctx, structureId, removed.id)) {
          throw conflict(
            `Invoices have been issued under the ${removed.name} plan from this structure; it must stay offered`
          );
        }
      }
      const year = await academicYearService.findById(ctx, existing.academicYearId);
      plans = await planRows(ctx, year, ids, defaultInstallmentPlanId ?? existing.defaultInstallmentPlanId);
    }
    await checkReferences(ctx, { items, lateFeeRuleId: data.lateFeeRuleId });
    const lateFee =
      "chargesLateFee" in data || "lateFeeRuleId" in data
        ? lateFeeFields({
            chargesLateFee: data.chargesLateFee ?? existing.chargesLateFee,
            lateFeeRuleId: "lateFeeRuleId" in data ? data.lateFeeRuleId : existing.lateFeeRuleId
          })
        : {};

    await transaction(async tx => {
      await feeStructureRepository.update(ctx.tenantId, structureId, { ...data, ...lateFee }, { dbc: tx });
      await feeStructureRepository.replaceChildren(ctx.tenantId, structureId, { items, plans }, { dbc: tx });
    });
    return feeStructureService.getById(ctx, structureId);
  },

  remove: async (ctx, structureId) => {
    await feeStructureService.getById(ctx, structureId);
    if (await invoiceService.existsForStructure(ctx, structureId)) {
      throw conflict("Invoices have been issued from this structure; cancel them before removing it");
    }
    return feeStructureRepository.softDelete(ctx.tenantId, structureId);
  },

  /* For other submodules */

  /* Structures of a year that apply to a class (its own and the all-classes ones) */
  forClass: async (ctx, academicYearId, classId) =>
    (
      await feeStructureRepository.findMany(ctx.tenantId, {
        conditions: [
          eq(feeStructures.academicYearId, academicYearId),
          or(eq(feeStructures.classId, classId), isNull(feeStructures.classId))
        ],
        with: withChildren
      })
    ).map(view),

  offeringPlan: (ctx, installmentPlanId) => feeStructureRepository.offeringPlan(ctx.tenantId, installmentPlanId),

  usingLateFeeRule: (ctx, lateFeeRuleId) =>
    feeStructureRepository.findMany(ctx.tenantId, { conditions: [eq(feeStructures.lateFeeRuleId, lateFeeRuleId)] })
};
