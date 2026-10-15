import { asc, eq } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { sum } from "../../../../common/money/money.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { classService } from "../../../academics/classes/index.js";
import { feeHeadService } from "../../fee-heads/index.js";
import { invoiceService } from "../../invoices/index.js";
import { feeInstallments, feeStructures } from "../models/feeStructure.schema.js";
import { feeStructureRepository } from "../repositories/feeStructure.repository.js";

const withChildren = {
  items: { with: { feeHead: { columns: { id: true, name: true, code: true } } } },
  installments: { orderBy: [asc(feeInstallments.dueDate)] },
  class: { columns: { id: true, className: true } }
};

/* Shares must add up to exactly 100% and due dates fall inside the year */
const checkInstallments = (installments, academicYear) => {
  const total = sum(installments.map(i => i.sharePercent));
  if (total !== 100) throw unprocessable(`Installment shares must add up to 100% (they add up to ${total}%)`);
  for (const inst of installments) {
    if (inst.dueDate < academicYear.startDate || inst.dueDate > academicYear.endDate) {
      throw unprocessable(`${inst.name} is due ${inst.dueDate}, outside the academic year`);
    }
  }
};

const checkReferences = async (ctx, { classId, items }) => {
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
};

const withTotal = structure =>
  structure && { ...structure, totalAmount: sum((structure.items ?? []).map(item => item.amount)) };

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
    return { ...result, rows: result.rows.map(withTotal) };
  },

  getById: async (ctx, structureId) => {
    const structure = await feeStructureRepository.findById(ctx.tenantId, structureId, { with: withChildren });
    if (!structure) throw notFound("Fee structure");
    return withTotal(structure);
  },

  create: async (ctx, { items, installments, ...data }) => {
    checkInstallments(installments, ctx.academicYear);
    await checkReferences(ctx, { classId: data.classId, items });
    const id = await transaction(async tx => {
      const structure = await feeStructureRepository.create(
        ctx.tenantId,
        { ...data, academicYearId: ctx.academicYearId },
        { dbc: tx }
      );
      await feeStructureRepository.replaceChildren(ctx.tenantId, structure.id, { items, installments }, { dbc: tx });
      return structure.id;
    });
    return feeStructureService.getById(ctx, id);
  },

  /* Amounts and installments are frozen once invoices exist */
  update: async (ctx, structureId, { items, installments, ...data }) => {
    const existing = await feeStructureService.getById(ctx, structureId);
    if ((items || installments) && (await invoiceService.existsForStructure(ctx, structureId))) {
      throw conflict("Invoices have been issued from this structure; its items and installments can no longer change");
    }
    if (installments) checkInstallments(installments, await academicYearService.findById(ctx, existing.academicYearId));
    await checkReferences(ctx, { classId: data.classId, items });

    await transaction(async tx => {
      await feeStructureRepository.update(ctx.tenantId, structureId, data, { dbc: tx });
      await feeStructureRepository.replaceChildren(ctx.tenantId, structureId, { items, installments }, { dbc: tx });
    });
    return feeStructureService.getById(ctx, structureId);
  },

  remove: async (ctx, structureId) => {
    await feeStructureService.getById(ctx, structureId);
    if (await invoiceService.existsForStructure(ctx, structureId)) {
      throw conflict("Invoices have been issued from this structure; cancel them before removing it");
    }
    return feeStructureRepository.softDelete(ctx.tenantId, structureId);
  }
};
