import { eq, inArray, sql } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { forbidden } from "../../../../common/http/errors.js";
import { OUTSIDE_SCOPE, teachingScope } from "../../teacher-assignments/index.js";
import { classes } from "../models/class.schema.js";
import { classRepository } from "../repositories/class.repository.js";

const base = createCrudService(classRepository, { entity: "Class" });

export const classService = {
  ...base,

  /* Teachers: the classes of the sections they teach (D-11) */
  list: async (ctx, query) => {
    const visible = await teachingScope.classIds(ctx);
    return base.list(ctx, query, visible ? [visible.length ? inArray(classes.id, visible) : sql`false`] : []);
  },

  getById: async (ctx, classId) => {
    const row = await base.getById(ctx, classId);
    const visible = await teachingScope.classIds(ctx);
    if (visible && !visible.includes(classId)) throw forbidden(OUTSIDE_SCOPE);
    return row;
  },

  /* For other submodules */
  exists: (ctx, classId) => classRepository.exists(ctx.tenantId, [eq(classes.id, classId)]),

  /* null when missing */
  findById: (ctx, classId) => classRepository.findById(ctx.tenantId, classId),

  /* True when every id is an active class of the tenant */
  allExist: async (ctx, classIds) => {
    const unique = [...new Set(classIds)];
    return (await classRepository.count(ctx.tenantId, [inArray(classes.id, unique)])) === unique.length;
  }
};
