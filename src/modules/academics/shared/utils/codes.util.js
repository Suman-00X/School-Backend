import { nextCode, pad } from "../../../../common/sequences/sequence.service.js";

/* Codes derived from a section's class and name (classSequence = class order) */

/* 1A-001: next roll number in a section */
export const nextRollNumber = (tenantId, { yearYY, classSequence, sectionName }, options) =>
  nextCode(
    tenantId,
    `ROLL-${yearYY}-${classSequence}${sectionName}`,
    n => `${classSequence}${sectionName}-${pad(n, 3)}`,
    options
  );

/* MA01-1A: a subject taught in a section */
export const sectionSubjectCode = ({ subjectCode, classSequence, sectionName }) =>
  `${subjectCode}-${classSequence}${sectionName}`;

/* MA01-1A-INTERNAL: a subject paper in an exam */
export const examPaperCode = ({ subjectCode, classSequence, sectionName, examType }) =>
  `${subjectCode}-${classSequence}${sectionName}-${examType ?? "EXAM"}`;
