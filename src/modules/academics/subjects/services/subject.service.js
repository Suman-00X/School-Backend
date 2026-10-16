import { inArray, sql } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { forbidden } from "../../../../common/http/errors.js";
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

  /* For other submodules: null when missing */
  findById: (ctx, subjectId) => subjectRepository.findById(ctx.tenantId, subjectId),

  /* Active subjects among the ids */
  findManyByIds: (ctx, subjectIds) =>
    subjectIds.length
      ? subjectRepository.findMany(ctx.tenantId, { conditions: [inArray(subjects.id, [...new Set(subjectIds)])] })
      : []
};
