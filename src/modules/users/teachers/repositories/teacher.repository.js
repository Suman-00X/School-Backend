import { createRepository } from "../../../../common/database/repository.js";
import { teachers } from "../models/teacher.schema.js";

export const teacherRepository = createRepository({ table: teachers, queryKey: "teachers" });
