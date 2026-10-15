import { createRepository } from "../../../../common/database/repository.js";
import { teacherAssignments } from "../models/teacherAssignment.schema.js";

export const teacherAssignmentRepository = createRepository({
  table: teacherAssignments,
  queryKey: "teacherAssignments"
});
