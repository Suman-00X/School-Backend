import { createMongoRepository } from "../../../../common/database/mongoRepository.js";
import { StoredFile } from "../models/storedFile.model.js";

export const storedFileRepository = createMongoRepository(StoredFile);
