import { z } from "../../../../common/validation/zod.js";
import {
  bulkBody,
  date,
  id,
  idParams,
  listQuery,
  optionalText,
  patchBody,
  text
} from "../../../../common/validation/schemas.js";
import { EXAM_TYPES, PAPER_COMPONENTS, PAPER_GRADING_TYPES } from "../../shared/constants/academic.constants.js";

const examFields = z.object({
  examName: text(100),
  examType: z.enum(EXAM_TYPES).optional(),
  startDate: date().optional(),
  endDate: date().optional(),
  gradeScaleId: id().optional(),
  description: optionalText()
});

const datesInOrder = [
  exam => !exam.startDate || !exam.endDate || exam.endDate >= exam.startDate,
  { path: ["endDate"], message: "must be on or after startDate" }
];

const marks = () => z.coerce.number().min(0).max(1000);
const time = () => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "must be a time like 09:30");

const paperShape = z.object({
  sectionId: id(),
  subjectId: id(),
  /* GRADE: graded only (Art, Conduct), no max or pass marks */
  gradingType: z.enum(PAPER_GRADING_TYPES).default("MARKS"),
  /* THEORY, PRACTICAL…: one paper per component of the subject */
  component: z.enum(PAPER_COMPONENTS).optional(),
  examDate: date().optional(),
  startTime: time().optional(),
  endTime: time().optional(),
  room: z.string().trim().min(1).max(30).optional(),
  maxMarks: marks()
    .refine(value => value > 0, "must be greater than 0")
    .optional(),
  passMarks: marks().optional(),
  description: optionalText()
});

const paperFields = paperShape
  .refine(paper => paper.gradingType === "GRADE" || paper.maxMarks !== undefined, {
    path: ["maxMarks"],
    message: "is required for a paper marked out of marks"
  })
  .refine(paper => paper.gradingType === "MARKS" || (paper.maxMarks === undefined && paper.passMarks === undefined), {
    path: ["maxMarks"],
    message: "must not be sent for a GRADE paper (it is graded without marks)"
  })
  .refine(paper => paper.passMarks === undefined || paper.passMarks <= paper.maxMarks, {
    path: ["passMarks"],
    message: "cannot exceed maxMarks"
  })
  .refine(paper => !paper.startTime || !paper.endTime || paper.endTime > paper.startTime, {
    path: ["endTime"],
    message: "must be after startTime"
  });

const params = idParams("examId");
const paperParams = idParams("examId", "paperId");

export const examValidators = {
  create: { body: examFields.refine(...datesInOrder) },
  createMany: { body: bulkBody("exams", examFields.refine(...datesInOrder)) },
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(examFields) },

  /* /exams/:examId/papers */
  listPapers: { params, query: listQuery({ sectionId: id().optional() }) },
  createPaper: { params, body: paperFields },
  updatePaper: {
    params: paperParams,
    body: patchBody(paperShape.omit({ sectionId: true, subjectId: true, gradingType: true, component: true }))
  },
  removePaper: { params: paperParams }
};
