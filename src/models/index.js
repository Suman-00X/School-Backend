/* Registers every model with mongoose (used by index sync and dev scripts) */
export { default as Tenant } from "./Tenant.js";
export { default as AuditLog } from "./AuditLog.js";
export { default as SerialCounter } from "./SerialCounter.js";

export { default as User } from "./user-db/User.js";
export { default as Teacher } from "./user-db/Teacher.js";
export { default as Student } from "./user-db/Student.js";
export { default as Parent } from "./user-db/Parent.js";
export { default as StudentParentMap } from "./user-db/StudentParentMap.js";

export { default as AcademicYear } from "./academic-db/AcademicYear.js";
export { default as Class } from "./academic-db/Class.js";
export { default as Section } from "./academic-db/Section.js";
export { default as Subject } from "./academic-db/Subject.js";
export { default as ClassSectionSubjectMap } from "./academic-db/ClassSectionSubjectMap.js";
export { default as StudentSectionMap } from "./academic-db/StudentSectionMap.js";
export { default as TeacherSectionSubjectMap } from "./academic-db/TeacherSectionSubjectMap.js";

export { default as Exam } from "./academic-db/exam-db/Exam.js";
export { default as ExamSectionSubjectMap } from "./academic-db/exam-db/ExamSectionSubjectMap.js";
export { default as Marks } from "./academic-db/exam-db/Marks.js";
