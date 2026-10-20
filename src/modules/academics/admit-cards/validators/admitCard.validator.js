import { z } from "../../../../common/validation/zod.js";
import { id, idParams } from "../../../../common/validation/schemas.js";

const params = idParams("examId");

export const admitCardValidators = {
  generate: { params, body: z.object({ sectionId: id().optional() }) },
  list: { params, query: z.object({ sectionId: id().optional() }) },
  sectionPdf: { params, query: z.object({ sectionId: id() }) },
  card: { params: idParams("examId", "admitCardId") }
};
