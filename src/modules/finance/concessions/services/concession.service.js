import { eq, inArray } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { studentService } from "../../../users/students/index.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { feeHeadService } from "../../fee-heads/index.js";
import { installmentPlanService } from "../../installment-plans/index.js";
import { invoiceIssuingService } from "../../invoices/index.js";
import { studentConcessions } from "../models/concession.schema.js";
import { concessionRepository, studentConcessionRepository } from "../repositories/concession.repository.js";

const withFeeHeads = { feeHeads: { with: { feeHead: { columns: { id: true, name: true, code: true } } } } };

const nameOf = student => `${student?.user?.firstName ?? ""} ${student?.user?.lastName ?? ""}`.trim();

/* The template with its fee heads as ids and as names */
const view = ({ feeHeads = [], ...concession }) => ({
  ...concession,
  feeHeadIds: feeHeads.map(link => link.feeHeadId),
  feeHeads: feeHeads.map(link => link.feeHead)
});

const checkFeeHeads = async (ctx, feeHeadIds) => {
  if (feeHeadIds?.length && !(await feeHeadService.allExist(ctx, feeHeadIds))) {
    throw unprocessable("feeHeadIds must refer to existing fee heads");
  }
};

const grantView = grant => ({ ...grant, concession: view(grant.concession) });

export const concessionService = {
  list: async (ctx, { page, limit, category }) => {
    const result = await concessionRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withFeeHeads,
      conditions: [category && eq(concessionRepository.table.category, category)].filter(Boolean)
    });
    return { ...result, rows: result.rows.map(view) };
  },

  getById: async (ctx, concessionId) => {
    const concession = await concessionRepository.findById(ctx.tenantId, concessionId, { with: withFeeHeads });
    if (!concession) throw notFound("Concession");
    return view(concession);
  },

  create: async (ctx, { feeHeadIds = [], ...data }) => {
    await checkFeeHeads(ctx, feeHeadIds);
    const id = await transaction(async tx => {
      const concession = await concessionRepository.create(ctx.tenantId, data, { dbc: tx });
      await concessionRepository.replaceFeeHeads(ctx.tenantId, concession.id, feeHeadIds, { dbc: tx });
      return concession.id;
    });
    return concessionService.getById(ctx, id);
  },

  /* Name, category and description can always change. What it takes off only until it is granted. */
  update: async (ctx, concessionId, { feeHeadIds, ...data }) => {
    const existing = await concessionService.getById(ctx, concessionId);
    const changesAmount = feeHeadIds || data.concessionType || data.value;
    if (changesAmount) {
      const granted = await studentConcessionRepository.exists(ctx.tenantId, [
        eq(studentConcessions.concessionId, concessionId)
      ]);
      if (granted) {
        throw conflict(
          `${existing.name} has been granted; its type, value and fee heads can no longer change. Create a new concession instead`
        );
      }
      const type = data.concessionType ?? existing.concessionType;
      if (type === "PERCENT" && (data.value ?? existing.value) > 100) {
        throw unprocessable("A percentage concession cannot be more than 100%");
      }
    }
    await checkFeeHeads(ctx, feeHeadIds);
    await transaction(async tx => {
      await concessionRepository.update(ctx.tenantId, concessionId, data, { dbc: tx });
      if (feeHeadIds) await concessionRepository.replaceFeeHeads(ctx.tenantId, concessionId, feeHeadIds, { dbc: tx });
    });
    return concessionService.getById(ctx, concessionId);
  },

  remove: async (ctx, concessionId) => {
    const concession = await concessionService.getById(ctx, concessionId);
    const grants = await studentConcessionRepository.count(ctx.tenantId, [
      eq(studentConcessions.concessionId, concessionId)
    ]);
    if (grants) throw conflict(`${concession.name} is granted to ${grants} student(s); revoke the grants first`);
    return concessionRepository.softDelete(ctx.tenantId, concessionId);
  },

  /* Grants. A grant (or revocation) recalculates the student's unpaid invoices of
     that year; invoices with any payment are never touched (D-18). */

  grant: async (ctx, { studentId, concessionId, academicYearId, reason }) => {
    const [student] = await studentService.findManyByIds(ctx, [studentId]);
    if (!student) throw unprocessable("studentId does not refer to an existing student");
    const concession = await concessionRepository.findById(ctx.tenantId, concessionId, { with: withFeeHeads });
    if (!concession) throw unprocessable("concessionId does not refer to an existing concession");
    const year = academicYearId
      ? await academicYearService.findById(ctx, academicYearId)
      : await academicYearService.findCurrent(ctx);
    if (!year) throw unprocessable("No academic year found for this grant");

    const { grant, recalculated } = await transaction(async tx => {
      await installmentPlanService.lockStudents(ctx, year.id, [studentId], { dbc: tx });
      const already = await studentConcessionRepository.exists(
        ctx.tenantId,
        [
          eq(studentConcessions.studentId, studentId),
          eq(studentConcessions.concessionId, concessionId),
          eq(studentConcessions.academicYearId, year.id)
        ],
        { dbc: tx }
      );
      if (already) throw conflict(`${nameOf(student)} already has ${concession.name} for ${year.yearName}`);
      const created = await studentConcessionRepository.create(
        ctx.tenantId,
        { studentId, concessionId, academicYearId: year.id, reason, grantedBy: ctx.userId },
        { dbc: tx }
      );
      return {
        grant: created,
        recalculated: await invoiceIssuingService.recalculateUnpaid(ctx, studentId, year.id, { dbc: tx })
      };
    });
    return { ...grant, concession: view(concession), studentName: nameOf(student), recalculatedInvoices: recalculated };
  },

  listGrants: async (ctx, { page, limit, studentId, academicYearId, concessionId }) => {
    const result = await studentConcessionRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: [
        studentId && eq(studentConcessions.studentId, studentId),
        academicYearId && eq(studentConcessions.academicYearId, academicYearId),
        concessionId && eq(studentConcessions.concessionId, concessionId)
      ].filter(Boolean),
      with: {
        concession: { with: withFeeHeads },
        student: {
          columns: { id: true, studentCode: true, admissionNumber: true },
          with: { user: { columns: { firstName: true, lastName: true } } }
        }
      }
    });
    return { ...result, rows: result.rows.map(grantView) };
  },

  revoke: async (ctx, grantId) => {
    const grant = await studentConcessionRepository.findById(ctx.tenantId, grantId, {
      with: { concession: { with: withFeeHeads } }
    });
    if (!grant) throw notFound("Concession grant");
    const [student] = await studentService.findManyByIds(ctx, [grant.studentId]);

    const recalculated = await transaction(async tx => {
      await installmentPlanService.lockStudents(ctx, grant.academicYearId, [grant.studentId], { dbc: tx });
      const removed = await studentConcessionRepository.softDelete(ctx.tenantId, grantId, { dbc: tx });
      if (!removed) throw notFound("Concession grant");
      return invoiceIssuingService.recalculateUnpaid(ctx, grant.studentId, grant.academicYearId, { dbc: tx });
    });
    return { ...grantView(grant), isActive: false, studentName: nameOf(student), recalculatedInvoices: recalculated };
  },

  /* For other submodules: grants of a year (oldest first), with their templates.
     Pass { dbc } to read inside a transaction. */
  grantsInYear: async (ctx, academicYearId, studentIds, { dbc } = {}) =>
    (
      await studentConcessionRepository.findMany(ctx.tenantId, {
        conditions: [
          eq(studentConcessions.academicYearId, academicYearId),
          studentIds && inArray(studentConcessions.studentId, studentIds)
        ].filter(Boolean),
        with: { concession: { with: withFeeHeads } },
        dbc
      })
    ).map(grantView)
};
