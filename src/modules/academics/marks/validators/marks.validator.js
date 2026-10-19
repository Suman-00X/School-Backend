import { z } from "../../../../common/validation/zod.js";
import { bulkBody, id, listQuery, optionalText } from "../../../../common/validation/schemas.js";
import { ABSENCE_REASONS } from "../../shared/constants/academic.constants.js";

/* Marks, or a grade alone for papers graded without marks (Art, Conduct), or an absence */
const entry = z
  .object({
    studentId: id(),
    examPaperId: id(),
    marksObtained: z.number().min(0).max(1000).optional(),
    isAbsent: z.boolean().default(false),
    /* MEDICAL and EXEMPT absences can be excluded from results by the result policy */
    absenceReason: z.enum(ABSENCE_REASONS).optional(),
    grade: optionalText(5),
    remarks: optionalText(500)
  })
  .refine(e => e.isAbsent || e.marksObtained !== undefined || e.grade !== undefined, {
    path: ["marksObtained"],
    message: "is required unless isAbsent is true or a grade is given"
  })
  .refine(e => !e.absenceReason || e.isAbsent, { path: ["absenceReason"], message: "requires isAbsent: true" });

const uniquePairs = body => {
  const keys = body.marks.map(m => `${m.studentId}:${m.examPaperId}`);
  return new Set(keys).size === keys.length;
};

export const marksValidators = {
  record: { body: entry },
  recordMany: {
    body: bulkBody("marks", entry, { max: 500 }).refine(uniquePairs, {
      path: ["marks"],
      message: "must not contain the same student and paper twice"
    })
  },
  list: { query: listQuery({ studentId: id(), examId: id().optional() }) }
};
