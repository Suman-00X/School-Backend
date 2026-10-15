import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery } from "../../../../common/validation/schemas.js";
import { CALENDAR_EVENT_TYPES } from "../../../academics/shared/constants/academic.constants.js";

const params = idParams("studentId");

export const learningValidators = {
  student: { params },
  attendance: { params, query: z.object({ from: date().optional(), to: date().optional() }) },
  reportCards: { params, query: z.object({ examId: id().optional(), academicYearId: id().optional() }) },
  calendar: {
    query: listQuery({
      from: date().optional(),
      to: date().optional(),
      eventType: z.enum(CALENDAR_EVENT_TYPES).optional()
    })
  }
};
