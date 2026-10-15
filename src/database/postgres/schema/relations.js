import { relations } from "drizzle-orm";
import {
  academicYears,
  classes,
  sectionSubjects,
  sections,
  studentEnrollments,
  subjects,
  teacherAssignments
} from "./academics.schema.js";
import { examSubjects, exams, marks } from "./exams.schema.js";
import { parents, studentParents, students, teachers, users } from "./people.schema.js";

/* Used by db.query.* relational reads (`with: { ... }`); no effect on the SQL schema */

export const teachersRelations = relations(teachers, ({ one }) => ({
  user: one(users, { fields: [teachers.userId], references: [users.id] })
}));

export const studentsRelations = relations(students, ({ one }) => ({
  user: one(users, { fields: [students.userId], references: [users.id] })
}));

export const parentsRelations = relations(parents, ({ one }) => ({
  user: one(users, { fields: [parents.userId], references: [users.id] })
}));

export const studentParentsRelations = relations(studentParents, ({ one }) => ({
  student: one(students, { fields: [studentParents.studentId], references: [students.id] }),
  parent: one(parents, { fields: [studentParents.parentId], references: [parents.id] })
}));

export const sectionsRelations = relations(sections, ({ one }) => ({
  academicYear: one(academicYears, { fields: [sections.academicYearId], references: [academicYears.id] }),
  class: one(classes, { fields: [sections.classId], references: [classes.id] }),
  classTeacher: one(teachers, { fields: [sections.classTeacherId], references: [teachers.id] })
}));

export const sectionSubjectsRelations = relations(sectionSubjects, ({ one }) => ({
  section: one(sections, { fields: [sectionSubjects.sectionId], references: [sections.id] }),
  subject: one(subjects, { fields: [sectionSubjects.subjectId], references: [subjects.id] })
}));

export const teacherAssignmentsRelations = relations(teacherAssignments, ({ one }) => ({
  teacher: one(teachers, { fields: [teacherAssignments.teacherId], references: [teachers.id] }),
  section: one(sections, { fields: [teacherAssignments.sectionId], references: [sections.id] }),
  subject: one(subjects, { fields: [teacherAssignments.subjectId], references: [subjects.id] })
}));

export const studentEnrollmentsRelations = relations(studentEnrollments, ({ one }) => ({
  student: one(students, { fields: [studentEnrollments.studentId], references: [students.id] }),
  section: one(sections, { fields: [studentEnrollments.sectionId], references: [sections.id] })
}));

export const examSubjectsRelations = relations(examSubjects, ({ one }) => ({
  exam: one(exams, { fields: [examSubjects.examId], references: [exams.id] }),
  section: one(sections, { fields: [examSubjects.sectionId], references: [sections.id] }),
  subject: one(subjects, { fields: [examSubjects.subjectId], references: [subjects.id] })
}));

export const marksRelations = relations(marks, ({ one }) => ({
  student: one(students, { fields: [marks.studentId], references: [students.id] }),
  examSubject: one(examSubjects, { fields: [marks.examSubjectId], references: [examSubjects.id] }),
  evaluator: one(teachers, { fields: [marks.evaluatedBy], references: [teachers.id] })
}));
