import { getNextSerial } from "./serialCounter.service.js";

/* Student ID */
export const generateStudentId = async ({
  tenantId,
  admissionYearYY,
  classSequence,
  session
}) => {
  const serial = await getNextSerial({
    tenantId,
    scope: `STUDENT-${admissionYearYY}-${classSequence}`,
    session
  });

  return `STU${admissionYearYY}-${classSequence}-${String(serial).padStart(6, "0")}`;
};

/* Parent ID */
export const generateParentId = async ({
  tenantId,
  yearYY,
  session
}) => {
  const serial = await getNextSerial({
    tenantId,
    scope: `PARENT-${yearYY}`,
    session
  });

  return `PRT${yearYY}-${String(serial).padStart(6, "0")}`;
};

/* Teacher ID */
export const generateTeacherId = async ({
  tenantId,
  joiningYearYY,
  session
}) => {
  const serial = await getNextSerial({
    tenantId,
    scope: `TEACHER-${joiningYearYY}`,
    session
  });

  return `TCHR${joiningYearYY}-${String(serial).padStart(6, "0")}`;
};

/* Subject Code (MA01, EN01 etc.) */
export const generateSubjectCode = async ({
  tenantId,
  subjectPrefix,
  session
}) => {
  const serial = await getNextSerial({
    tenantId,
    scope: `SUBJECT-${subjectPrefix}`,
    session
  });

  return `${subjectPrefix}${String(serial).padStart(2, "0")}`;
};

/* Class Code */
export const generateClassCode = ({ classSequence }) => {
  return `CLS-${classSequence}`;
};

/* Section Code */
export const generateSectionCode = ({ classSequence, sectionName }) => {
  return `SEC-${classSequence}${sectionName}`;
};

/* Class–Section–Subject Display */
export const generateClassSectionSubjectDisplay = ({
  subjectCode,
  classSequence,
  sectionName
}) => {
  return `${subjectCode}-${classSequence}${sectionName}`;
};

/* Student Roll Number */
export const generateStudentRollNumber = async ({
  tenantId,
  academicYearYY,
  classSequence,
  sectionName,
  session
}) => {
  const serial = await getNextSerial({
    tenantId,
    scope: `ROLL-${academicYearYY}-${classSequence}${sectionName}`,
    session
  });

  return `${classSequence}${sectionName}-${String(serial).padStart(3, "0")}`;
};

/* Exam Code */
export const generateExamCode = async ({
  tenantId,
  yearYY,
  examType,
  session
}) => {
  const serial = await getNextSerial({
    tenantId,
    scope: `EXAM-${yearYY}-${examType}`,
    session
  });

  return `EXM${yearYY}-${examType}-${String(serial).padStart(2, "0")}`;
};

/* Exam–Section–Subject Display */
export const generateExamSectionSubjectDisplay = ({
  subjectCode,
  classSequence,
  sectionName,
  examType
}) => {
  return `${subjectCode}-${classSequence}${sectionName}-${examType}`;
};