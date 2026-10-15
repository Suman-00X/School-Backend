import { notFound } from "../http/errors.js";

/* Standard service over a repository. Modules spread it and add their own logic:

     const base = createCrudService(classRepository, { entity: "Class" });
     export const classService = { ...base, createMany: ... };

   Every method takes the request context first ({ tenantId, userId, role, ... }). */
export const createCrudService = (repository, { entity, with: relations } = {}) => ({
  list: (ctx, { page, limit } = {}, conditions = []) =>
    repository.list(ctx.tenantId, { page, limit, conditions, with: relations }),

  getById: async (ctx, id) => {
    const row = await repository.findById(ctx.tenantId, id, { with: relations });
    if (!row) throw notFound(entity);
    return row;
  },

  create: (ctx, data) => repository.create(ctx.tenantId, data),

  createMany: (ctx, items) => repository.createMany(ctx.tenantId, items),

  update: async (ctx, id, data) => {
    const row = await repository.update(ctx.tenantId, id, data);
    if (!row) throw notFound(entity);
    return row;
  },

  remove: async (ctx, id) => {
    const row = await repository.softDelete(ctx.tenantId, id);
    if (!row) throw notFound(entity);
    return row;
  }
});
