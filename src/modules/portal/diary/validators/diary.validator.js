import { z } from "../../../../common/validation/zod.js";
import { date, idParams, optionalText } from "../../../../common/validation/schemas.js";
import { dayQuery, dayRange } from "../../../academics/diary/index.js";

export const portalDiaryValidators = {
  days: { params: idParams("studentId"), query: dayRange },
  day: { params: idParams("studentId"), query: dayQuery },
  /* note: a message to the class teacher; leaving it out clears an earlier one */
  sign: { params: idParams("studentId"), body: z.object({ date: date(), note: optionalText(1000) }) }
};
