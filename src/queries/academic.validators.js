import Section from "../models/academic-db/Section.js";
import StudentSectionMap from "../models/academic-db/StudentSectionMap.js";
import TeacherSectionSubjectMap from "../models/academic-db/TeacherSectionSubjectMap.js";
import ClassSectionSubjectMap from "../models/academic-db/ClassSectionSubjectMap.js";
import Exam from "../models/academic-db/exam-db/Exam.js";
import ExamSectionSubjectMap from "../models/academic-db/exam-db/ExamSectionSubjectMap.js";

/* ======================================================
   STUDENT ADMISSION
====================================================== */

export const isStudentAlreadyAdmitted = async (tenantId, academicYearId, studentId) => {
  return StudentSectionMap.exists({
    tenantId,
    academicYearId,
    studentId,
    isActive: true
  });
};

export const isSectionInAcademicYear = async (tenantId, sectionId, academicYearId) => {
  return Section.exists({
    _id: sectionId,
    tenantId,
    academicYearId,
    isActive: true
  });
};

export const isRollNumberTaken = async (tenantId, academicYearId, sectionId, rollNumber) => {
  return StudentSectionMap.exists({
    tenantId,
    academicYearId,
    sectionId,
    rollNumber,
    isActive: true
  });
};

/* ======================================================
   CLASS - SECTION - SUBJECT
====================================================== */

export const isSubjectAlreadyMappedToSection = async (
  tenantId,
  academicYearId,
  sectionId,
  subjectId
) => {
  return ClassSectionSubjectMap.exists({
    tenantId,
    academicYearId,
    sectionId,
    subjectId,
    isActive: true
  });
};

/* ======================================================
   TEACHER ALLOCATION
====================================================== */

export const isTeacherAlreadyAssigned = async (
  tenantId,
  academicYearId,
  teacherId,
  sectionId,
  subjectId
) => {
  return TeacherSectionSubjectMap.exists({
    tenantId,
    academicYearId,
    teacherId,
    sectionId,
    subjectId,
    isActive: true
  });
};

export const isSubjectMappedToSection = async (
  tenantId,
  academicYearId,
  sectionId,
  subjectId
) => {
  return ClassSectionSubjectMap.exists({
    tenantId,
    academicYearId,
    sectionId,
    subjectId,
    isActive: true
  });
};

/* ======================================================
   EXAM
====================================================== */

export const doesExamBelongToAcademicYear = async (
  tenantId,
  examId,
  academicYearId
) => {
  return Exam.exists({
    _id: examId,
    tenantId,
    academicYearId,
    isActive: true
  });
};

/* ======================================================
   MARKS
====================================================== */

export const doesExamStructureExist = async (tenantId, examSectionSubjectId) => {
  return ExamSectionSubjectMap.exists({
    _id: examSectionSubjectId,
    tenantId,
    isActive: true
  });
};

export const isStudentInSection = async (
  tenantId,
  studentId,
  sectionId,
  academicYearId
) => {
  return StudentSectionMap.exists({
    tenantId,
    studentId,
    sectionId,
    academicYearId,
    isActive: true
  });
};