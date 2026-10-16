import { inArray } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { subjects } from "../models/subject.schema.js";
import { subjectRepository } from "../repositories/subject.repository.js";

export const subjectService = {
  ...createCrudService(subjectRepository, { entity: "Subject" }),

  /* For other submodules: null when missing */
  findById: (ctx, subjectId) => subjectRepository.findById(ctx.tenantId, subjectId),

  /* Active subjects among the ids */
  findManyByIds: (ctx, subjectIds) =>
    subjectIds.length
      ? subjectRepository.findMany(ctx.tenantId, { conditions: [inArray(subjects.id, [...new Set(subjectIds)])] })
      : []
};
