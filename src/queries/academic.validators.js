import Section from "../models/academic-db/Section.js";
import StudentSectionMap from "../models/academic-db/StudentSectionMap.js";
import TeacherSectionSubjectMap from "../models/academic-db/TeacherSectionSubjectMap.js";
import ClassSectionSubjectMap from "../models/academic-db/ClassSectionSubjectMap.js";

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

export const isSectionInAcademicYear = async (tenantId, academicYearId, sectionId) => {
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
   TEACHER ALLOCATION
====================================================== */

/* One teacher per subject per section per year */
export const isSubjectTeacherAssigned = async (
  tenantId,
  academicYearId,
  sectionId,
  subjectId
) => {
  return TeacherSectionSubjectMap.exists({
    tenantId,
    academicYearId,
    sectionId,
    subjectId,
    isActive: true
  });
};

/* ======================================================
   MARKS
====================================================== */

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
