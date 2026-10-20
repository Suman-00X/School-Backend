import { z } from "../../../../common/validation/zod.js";
import { id } from "../../../../common/validation/schemas.js";

const format = z.enum(["csv", "xlsx"]).default("xlsx");

export const governmentExportValidators = {
  readiness: { query: z.object({ sectionId: id().optional() }) },
  udise: { query: z.object({ format, sectionId: id().optional(), examId: id().optional() }) },
  apaar: {
    query: z.object({
      format,
      sectionId: id().optional(),
      pending: z.enum(["true", "false"]).transform(v => v === "true").default(false)
    })
  }
};
