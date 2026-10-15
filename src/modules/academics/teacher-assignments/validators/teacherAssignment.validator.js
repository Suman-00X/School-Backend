import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, optionalText } from "../../../../common/validation/schemas.js";

export const teacherAssignmentValidators = {
  create: {
    body: z.object({
      teacherId: id(),
      sectionId: id(),
      subjectId: id(),
      description: optionalText()
    })
  },
  list: { query: listQuery({ sectionId: id().optional(), teacherId: id().optional() }) },
  remove: { params: idParams("assignmentId") }
};
