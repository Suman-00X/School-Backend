import { created, done, ok, paginated } from "../http/responses.js";

/* Standard handlers with consistent messages ("Class created successfully").
   Express 5 forwards thrown/rejected errors to the error handler, so no try/catch.

     export const classController = {
       ...createCrudController(classService, { singular: "Class", plural: "Classes", idParam: "classId" }),
       createMany: ...
     };                                                                                */
export const createCrudController = (service, { singular, plural, idParam, bulkKey }) => ({
  create: async (req, res) =>
    created(res, await service.create(req.context, req.body), `${singular} created successfully`),

  /* POST /bulk with body { [bulkKey]: [...] } */
  createMany: async (req, res) => {
    const rows = await service.createMany(req.context, req.body[bulkKey]);
    const noun = (rows.length === 1 ? singular : plural).toLowerCase();
    return created(res, rows, `${rows.length} ${noun} created successfully`);
  },

  list: async (req, res) =>
    paginated(res, await service.list(req.context, req.query), `${plural} retrieved successfully`),

  getById: async (req, res) =>
    ok(res, await service.getById(req.context, req.params[idParam]), `${singular} retrieved successfully`),

  update: async (req, res) =>
    ok(res, await service.update(req.context, req.params[idParam], req.body), `${singular} updated successfully`),

  remove: async (req, res) => {
    await service.remove(req.context, req.params[idParam]);
    return done(res, `${singular} removed successfully`);
  }
});
