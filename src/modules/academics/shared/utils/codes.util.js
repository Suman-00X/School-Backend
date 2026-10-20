import { nextCode, pad } from "../../../../common/sequences/sequence.service.js";

/* Codes derived from a section's class and name. classSequence stands for the class:
   its level's label ("1" for Class 1, "LKG"), see classCodeLabel */

/* 1A-001: roll numbers of a section. The sequence counts every number the section has
   given out; renumbering (enrollments' rollNumber.service) restarts it after the last one re-issued. */
export const rollNumberScope = ({ yearYY, classSequence, sectionName }) =>
  `ROLL-${yearYY}-${classSequence}${sectionName}`;

export const formatRollNumber = ({ classSequence, sectionName }, n) => `${classSequence}${sectionName}-${pad(n, 3)}`;

/* The next roll number in a section */
export const nextRollNumber = (tenantId, placement, options) =>
  nextCode(tenantId, rollNumberScope(placement), n => formatRollNumber(placement, n), options);

/* MA221: a subject in a class (Mathematics, stage 2 position 2, required). The same every
   year; the suffix is always three digits, so the subject's code can be read back. */
export const classSubjectCode = ({ subjectCode, stage, position, isOptional }) =>
  `${subjectCode}${stage}${position}${isOptional ? 0 : 1}`;

/* MA221-A: a subject taught in a section */
export const sectionSubjectCode = ({ classSubjectCode: code, sectionName }) => `${code}-${sectionName}`;

const COMPONENT_CODES = { THEORY: "TH", PRACTICAL: "PR", INTERNAL: "IA", PROJECT: "PJ", ORAL: "OR" };

/* MA221-A-INTERNAL: a subject paper in an exam; PH431-A-FINAL-PR for a component */
export const examPaperCode = ({ sectionSubjectCode: code, examType, component }) =>
  `${code}-${examType ?? "EXAM"}${component ? `-${COMPONENT_CODES[component]}` : ""}`;
