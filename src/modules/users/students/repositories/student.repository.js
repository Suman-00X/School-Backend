import { createRepository } from "../../../../common/database/repository.js";
import { students } from "../models/student.schema.js";

export const studentRepository = createRepository({ table: students, queryKey: "students" });
