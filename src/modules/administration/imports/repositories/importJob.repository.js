import { createMongoRepository } from "../../../../common/database/mongoRepository.js";
import { ImportJob } from "../models/importJob.model.js";

export const importJobRepository = createMongoRepository(ImportJob);
