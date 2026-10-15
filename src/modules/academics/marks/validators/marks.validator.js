import { z } from "../../../../common/validation/zod.js";
import { bulkBody, id, listQuery, optionalText } from "../../../../common/validation/schemas.js";

const entry = z
  .object({
    studentId: id(),
    examPaperId: id(),
    marksObtained: z.number().min(0).max(1000).optional(),
    isAbsent: z.boolean().default(false),
    grade: optionalText(5),
    remarks: optionalText(500)
  })
  .refine(e => e.isAbsent || e.marksObtained !== undefined, {
    path: ["marksObtained"],
    message: "is required unless isAbsent is true"
  });

const uniquePairs = body => {
  const keys = body.marks.map(m => `${m.studentId}:${m.examPaperId}`);
  return new Set(keys).size === keys.length;
};

export const marksValidators = {
  record: { body: entry },
  recordMany: {
    body: bulkBody("marks", entry, 500).refine(uniquePairs, {
      path: ["marks"],
      message: "must not contain the same student and paper twice"
    })
  },
  list: { query: listQuery({ studentId: id(), examId: id().optional() }) }
};
