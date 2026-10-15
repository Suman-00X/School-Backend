import { asc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { studentEnrollments } from "../models/enrollment.schema.js";

export const enrollmentRepository = createRepository({
  table: studentEnrollments,
  queryKey: "studentEnrollments",
  orderBy: asc(studentEnrollments.rollNumber)
});
