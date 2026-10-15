import { eq } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { studentService } from "../../../users/students/index.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { feeHeadService } from "../../fee-heads/index.js";
import { studentConcessions } from "../models/concession.schema.js";
import { concessionRepository, studentConcessionRepository } from "../repositories/concession.repository.js";

const base = createCrudService(concessionRepository, { entity: "Concession" });

const checkFeeHead = async (ctx, feeHeadId) => {
  if (feeHeadId && !(await feeHeadService.findById(ctx, feeHeadId))) {
    throw unprocessable("feeHeadId does not refer to an existing fee head");
  }
};

export const concessionService = {
  list: base.list,
  getById: base.getById,
  remove: base.remove,

  create: async (ctx, data) => {
    await checkFeeHead(ctx, data.feeHeadId);
    return concessionRepository.create(ctx.tenantId, data);
  },

  update: async (ctx, concessionId, data) => {
    await checkFeeHead(ctx, data.feeHeadId);
    return base.update(ctx, concessionId, data);
  },

  /* Grants */

  grant: async (ctx, { studentId, concessionId, academicYearId, reason }) => {
    if (!(await studentService.exists(ctx, studentId)))
      throw unprocessable("studentId does not refer to an existing student");
    if (!(await concessionRepository.findById(ctx.tenantId, concessionId))) {
      throw unprocessable("concessionId does not refer to an existing concession");
    }
    const year = academicYearId
      ? await academicYearService.findById(ctx, academicYearId)
      : await academicYearService.findCurrent(ctx);
    if (!year) throw unprocessable("No academic year found for this grant");

    const already = await studentConcessionRepository.exists(ctx.tenantId, [
      eq(studentConcessions.studentId, studentId),
      eq(studentConcessions.concessionId, concessionId),
      eq(studentConcessions.academicYearId, year.id)
    ]);
    if (already) throw conflict("The student already has this concession for the academic year");

    return studentConcessionRepository.create(ctx.tenantId, {
      studentId,
      concessionId,
      academicYearId: year.id,
      reason,
      grantedBy: ctx.userId
    });
  },

  listGrants: (ctx, { page, limit, studentId, academicYearId }) =>
    studentConcessionRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: [
        studentId && eq(studentConcessions.studentId, studentId),
        academicYearId && eq(studentConcessions.academicYearId, academicYearId)
      ].filter(Boolean),
      with: { concession: true }
    }),

  revoke: async (ctx, grantId) => {
    const row = await studentConcessionRepository.softDelete(ctx.tenantId, grantId);
    if (!row) throw notFound("Concession grant");
    return row;
  },

  /* For other submodules: a student's concessions in a year, with their rules */
  activeFor: (ctx, studentId, academicYearId) =>
    studentConcessionRepository.findMany(ctx.tenantId, {
      conditions: [eq(studentConcessions.studentId, studentId), eq(studentConcessions.academicYearId, academicYearId)],
      with: { concession: true }
    }),

  findAllInYear: (ctx, academicYearId) =>
    studentConcessionRepository.findMany(ctx.tenantId, {
      conditions: [eq(studentConcessions.academicYearId, academicYearId)],
      with: { concession: true }
    })
};
