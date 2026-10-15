import { z } from "../../../../common/validation/zod.js";
import { id, idParams } from "../../../../common/validation/schemas.js";

export const reportCardValidators = {
  section: { params: idParams("sectionId"), query: z.object({ examId: id() }) },
  pdf: { params: idParams("studentId"), query: z.object({ examId: id() }) },
  student: {
    params: idParams("studentId"),
    query: z.object({ examId: id().optional(), academicYearId: id().optional() })
  }
};
