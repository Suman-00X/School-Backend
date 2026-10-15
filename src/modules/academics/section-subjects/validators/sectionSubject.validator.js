import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, optionalText, positiveInt } from "../../../../common/validation/schemas.js";

export const sectionSubjectValidators = {
  create: {
    body: z.object({
      sectionId: id(),
      subjectId: id(),
      weeklyNoOfClasses: positiveInt().max(50).optional(),
      description: optionalText()
    })
  },
  list: { query: listQuery({ sectionId: id() }) },
  remove: { params: idParams("sectionSubjectId") }
};
