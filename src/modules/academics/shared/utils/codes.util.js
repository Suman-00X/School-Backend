import { nextCode, pad } from "../../../../common/sequences/sequence.service.js";

/* Codes derived from a section's class and name. classSequence stands for the class:
   its level's label ("1" for Class 1, "LKG"), see classCodeLabel */

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

const COMPONENT_CODES = { THEORY: "TH", PRACTICAL: "PR", INTERNAL: "IA", PROJECT: "PJ", ORAL: "OR" };

/* MA01-1A-INTERNAL: a subject paper in an exam; PH01-10A-FINAL-PR for a component */
export const examPaperCode = ({ subjectCode, classSequence, sectionName, examType, component }) =>
  `${subjectCode}-${classSequence}${sectionName}-${examType ?? "EXAM"}${component ? `-${COMPONENT_CODES[component]}` : ""}`;
