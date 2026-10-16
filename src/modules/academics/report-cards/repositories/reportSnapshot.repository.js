import { createMongoRepository } from "../../../../common/database/mongoRepository.js";
import { ReportSnapshot } from "../models/reportSnapshot.model.js";

const toPlain = ({ _id, __v, ...rest }) => ({ id: String(_id), ...rest });

const base = createMongoRepository(ReportSnapshot, { sort: { publishedAt: -1, version: -1 } });

export const reportSnapshotRepository = {
  ...base,

  insertMany: async (tenantId, docs) =>
    docs.length
      ? ReportSnapshot.insertMany(
          docs.map(doc => ({ ...doc, tenantId })),
          { ordered: true }
        )
      : [],

  /* Undo a publication whose PostgreSQL transaction did not commit */
  removePublication: (tenantId, publicationId) => ReportSnapshot.deleteMany({ tenantId, publicationId }),

  setWithdrawn: (tenantId, publicationId, withdrawnAt) =>
    ReportSnapshot.updateMany({ tenantId, publicationId }, { $set: { withdrawnAt } }),

  /* { studentId -> contentHash } of one publication */
  hashesOf: async (tenantId, publicationId) => {
    const docs = await ReportSnapshot.find({ tenantId, publicationId }, { studentId: 1, contentHash: 1 }).lean();
    return new Map(docs.map(doc => [doc.studentId, doc.contentHash]));
  },

  findMany: async (tenantId, filter, { sort = { sourceName: 1 } } = {}) =>
    (
      await ReportSnapshot.find({ ...filter, tenantId })
        .sort(sort)
        .lean()
    ).map(toPlain)
};
