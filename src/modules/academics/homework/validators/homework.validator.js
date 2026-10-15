import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";

const objectId = () => z.string().regex(/^[0-9a-f]{24}$/, "must be a valid id");

const fields = z.object({
  sectionId: id(),
  subjectId: id(),
  title: text(200),
  description: optionalText(5000),
  dueDate: date(),
  maxMarks: z.number().positive().max(1000).optional(),
  allowLateSubmission: z.boolean().default(false)
});

const params = idParams("homeworkId");

export const homeworkValidators = {
  create: { body: fields },
  list: {
    query: listQuery({
      sectionId: id().optional(),
      subjectId: id().optional(),
      from: date().optional(),
      to: date().optional()
    })
  },
  getById: { params },
  update: {
    params,
    body: patchBody(
      z.object({
        title: text(200),
        description: optionalText(5000),
        dueDate: date(),
        maxMarks: z.number().positive().max(1000),
        allowLateSubmission: z.boolean()
      })
    )
  },
  attachment: { params: params.extend({ fileId: objectId() }) },
  submissions: { params },
  grade: {
    params: idParams("homeworkId", "submissionId"),
    body: z.object({
      status: z.enum(["GRADED", "RETURNED"]).default("GRADED"),
      marksAwarded: z.number().min(0).max(1000).optional(),
      feedback: optionalText(2000)
    })
  },
  submissionAttachment: { params: idParams("homeworkId", "submissionId").extend({ fileId: objectId() }) }
};
