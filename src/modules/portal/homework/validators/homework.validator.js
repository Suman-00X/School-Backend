import { z } from "../../../../common/validation/zod.js";
import { idParams, listQuery, optionalText } from "../../../../common/validation/schemas.js";

const objectId = () => z.string().regex(/^[0-9a-f]{24}$/, "must be a valid id");

export const portalHomeworkValidators = {
  list: {
    params: idParams("studentId"),
    query: listQuery({ status: z.enum(["pending", "submitted", "graded"]).optional() })
  },
  detail: { params: idParams("studentId", "homeworkId") },
  attachment: { params: idParams("studentId", "homeworkId").extend({ fileId: objectId() }) },
  submit: { params: idParams("homeworkId"), body: z.object({ content: optionalText(10_000) }) }
};
