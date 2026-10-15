import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["ADMIN", "TEACHER", "STUDENT", "PARENT"]);
export const userStatus = pgEnum("user_status", ["ACTIVE", "INACTIVE", "BLOCKED"]);
export const gender = pgEnum("gender", ["MALE", "FEMALE", "OTHER"]);

export const employmentType = pgEnum("employment_type", ["FULL_TIME", "PART_TIME"]);
export const parentRelation = pgEnum("parent_relation", ["FATHER", "MOTHER", "GUARDIAN"]);

export const subjectType = pgEnum("subject_type", ["THEORY", "PRACTICAL"]);
export const admissionType = pgEnum("admission_type", ["NEW", "PROMOTED", "REPEAT"]);
export const enrollmentStatus = pgEnum("enrollment_status", ["ACTIVE", "LEFT"]);

export const examType = pgEnum("exam_type", ["INTERNAL", "FINAL"]);
