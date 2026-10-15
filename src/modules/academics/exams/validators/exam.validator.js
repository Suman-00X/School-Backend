import { z } from "../../../../common/validation/zod.js";
import { bulkBody, date, id, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import { EXAM_TYPES } from "../../shared/constants/academic.constants.js";

const examFields = z.object({
  examName: text(100),
  examType: z.enum(EXAM_TYPES).optional(),
  startDate: date().optional(),
  endDate: date().optional(),
  description: optionalText()
});

const datesInOrder = [
  exam => !exam.startDate || !exam.endDate || exam.endDate >= exam.startDate,
  { path: ["endDate"], message: "must be on or after startDate" }
];

const marks = () => z.coerce.number().min(0).max(1000);

const paperFields = z
  .object({
    sectionId: id(),
    subjectId: id(),
    examDate: date().optional(),
    maxMarks: marks().refine(value => value > 0, "must be greater than 0"),
    passMarks: marks().optional(),
    description: optionalText()
  })
  .refine(paper => paper.passMarks === undefined || paper.passMarks <= paper.maxMarks, {
    path: ["passMarks"],
    message: "cannot exceed maxMarks"
  });

const params = idParams("examId");

export const examValidators = {
  create: { body: examFields.refine(...datesInOrder) },
  createMany: { body: bulkBody("exams", examFields.refine(...datesInOrder)) },
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(examFields) },

  /* /exams/:examId/papers */
  listPapers: { params, query: listQuery({ sectionId: id().optional() }) },
  createPaper: { params, body: paperFields }
};
