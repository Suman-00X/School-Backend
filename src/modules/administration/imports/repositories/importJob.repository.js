import { createMongoRepository } from "../../../../common/database/mongoRepository.js";
import { ImportJob } from "../models/importJob.model.js";

const base = createMongoRepository(ImportJob);

export const importJobRepository = {
  ...base,

  /* Move an import from one status to another atomically -> true if this caller did it */
  transition: async (tenantId, importId, from, to, extra = {}) => {
    const result = await ImportJob.updateOne(
      { _id: importId, tenantId, status: from },
      { $set: { status: to, ...extra } }
    );
    return result.modifiedCount === 1;
  }
};
