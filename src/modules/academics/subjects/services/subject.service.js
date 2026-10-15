import { createCrudService } from "../../../../common/crud/crudService.js";
import { subjectRepository } from "../repositories/subject.repository.js";

export const subjectService = {
  ...createCrudService(subjectRepository, { entity: "Subject" }),

  /* For other submodules: null when missing */
  findById: (ctx, subjectId) => subjectRepository.findById(ctx.tenantId, subjectId)
};
