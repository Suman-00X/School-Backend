import { inArray, sql } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { transaction } from "../../../../common/database/postgres.js";
import { forbidden, notFound } from "../../../../common/http/errors.js";
import { subjectCodeService } from "../../subject-codes/index.js";
import { OUTSIDE_SCOPE, teachingScope } from "../../teacher-assignments/index.js";
import { subjects } from "../models/subject.schema.js";
import { subjectRepository } from "../repositories/subject.repository.js";

const base = createCrudService(subjectRepository, { entity: "Subject" });

export const subjectService = {
  ...base,

  /* Teachers: the subjects of the sections they teach (D-11) */
  list: async (ctx, query) => {
    const visible = await teachingScope.subjectIds(ctx);
    return base.list(ctx, query, visible ? [visible.length ? inArray(subjects.id, visible) : sql`false`] : []);
  },

  getById: async (ctx, subjectId) => {
    const row = await base.getById(ctx, subjectId);
    const visible = await teachingScope.subjectIds(ctx);
    if (visible && !visible.includes(subjectId)) throw forbidden(OUTSIDE_SCOPE);
    return row;
  },

  /* A new code renames the subject's class subject codes (MA221 -> MAT221) and their sections'
     only while no exam paper or assessment uses one of them */
  update: async (ctx, subjectId, data) => {
    const before = await subjectRepository.findById(ctx.tenantId, subjectId);
    if (!before) throw notFound("Subject");
    if (!data.subjectCode || data.subjectCode === before.subjectCode) return base.update(ctx, subjectId, data);
    const affected = await subjectCodeService.checkRename(ctx, before);
    return transaction(async dbc => {
      const row = await subjectRepository.update(ctx.tenantId, subjectId, data, { dbc });
      await subjectCodeService.renamed(ctx, affected, data.subjectCode, { dbc });
      return row;
    });
  },

  /* { dbc } joins a transaction (class subjects create one with its subject) */
  create: (ctx, data, { dbc } = {}) => subjectRepository.create(ctx.tenantId, data, { dbc }),

  /* For other submodules: null when missing */
  findById: (ctx, subjectId) => subjectRepository.findById(ctx.tenantId, subjectId),

  /* Active subjects among the ids */
  findManyByIds: (ctx, subjectIds) =>
    subjectIds.length
      ? subjectRepository.findMany(ctx.tenantId, { conditions: [inArray(subjects.id, [...new Set(subjectIds)])] })
      : []
};
