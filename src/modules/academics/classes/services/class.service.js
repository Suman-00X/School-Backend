import { eq, inArray } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { classes } from "../models/class.schema.js";
import { classRepository } from "../repositories/class.repository.js";

export const classService = {
  ...createCrudService(classRepository, { entity: "Class" }),

  /* For other submodules */
  exists: (ctx, classId) => classRepository.exists(ctx.tenantId, [eq(classes.id, classId)]),

  /* True when every id is an active class of the tenant */
  allExist: async (ctx, classIds) => {
    const unique = [...new Set(classIds)];
    return (await classRepository.count(ctx.tenantId, [inArray(classes.id, unique)])) === unique.length;
  }
};
