import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, optionalText, patchBody, positiveInt } from "../../../../common/validation/schemas.js";
import { subjectFields } from "../../subjects/index.js";

const fields = z.object({
  /* Required (false, the default): every section of the class gets it */
  isOptional: z.boolean().optional(),
  weeklyNoOfClasses: positiveInt().max(50).optional(),
  description: optionalText()
});

const params = idParams("classSubjectId");

export const classSubjectValidators = {
  create: {
    /* An existing subject (subjectId), or a new one created with it (subject) */
    body: fields
      .extend({
        classId: id(),
        subjectId: id().optional(),
        subject: subjectFields.omit({ isOptional: true }).optional()
      })
      .refine(body => !body.subjectId !== !body.subject, {
        path: ["subjectId"],
        message: "send either subjectId (an existing subject) or subject (a new one)"
      })
  },
  list: { query: listQuery({ classId: id() }) },
  update: { params, body: patchBody(fields) },
  remove: { params }
};
