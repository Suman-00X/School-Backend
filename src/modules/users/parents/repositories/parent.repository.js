import { createRepository } from "../../../../common/database/repository.js";
import { parents } from "../models/parent.schema.js";

export const parentRepository = createRepository({ table: parents, queryKey: "parents" });
