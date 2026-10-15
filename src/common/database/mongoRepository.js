import mongoose from "mongoose";
import { buildPageMeta } from "../utils/pagination.util.js";

/* Documents leave the repository with `id` (not `_id`/`__v`), like PostgreSQL rows */
const toPlain = doc => {
  if (!doc) return null;
  const { _id, __v, ...rest } = doc;
  return { id: String(_id), ...rest };
};

const isObjectId = value =>
  mongoose.isValidObjectId(value) && String(new mongoose.Types.ObjectId(value)) === String(value);

/* Tenant-scoped access to a Mongoose model (documents carry `tenantId`).

     const importJobRepository = createMongoRepository(ImportJob);   */
export const createMongoRepository = (Model, { sort = { createdAt: -1 } } = {}) => ({
  Model,

  create: async (tenantId, data) => toPlain((await Model.create({ ...data, tenantId })).toObject()),

  findById: async (tenantId, id) =>
    isObjectId(id) ? toPlain(await Model.findOne({ _id: id, tenantId }).lean()) : null,

  findOne: async (tenantId, filter = {}) => toPlain(await Model.findOne({ ...filter, tenantId }).lean()),

  /* -> { rows, meta } */
  list: async (tenantId, { filter = {}, page = 1, limit = 20, sort: order = sort, projection } = {}) => {
    const query = { ...filter, tenantId };
    const [rows, total] = await Promise.all([
      Model.find(query, projection)
        .sort(order)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Model.countDocuments(query)
    ]);
    return { rows: rows.map(toPlain), meta: buildPageMeta(page, limit, total) };
  },

  update: async (tenantId, id, changes) =>
    isObjectId(id)
      ? toPlain(await Model.findOneAndUpdate({ _id: id, tenantId }, changes, { returnDocument: "after" }).lean())
      : null,

  updateMany: (tenantId, filter, changes) => Model.updateMany({ ...filter, tenantId }, changes),

  count: (tenantId, filter = {}) => Model.countDocuments({ ...filter, tenantId }),

  remove: async (tenantId, id) =>
    isObjectId(id) ? toPlain(await Model.findOneAndDelete({ _id: id, tenantId }).lean()) : null
});
