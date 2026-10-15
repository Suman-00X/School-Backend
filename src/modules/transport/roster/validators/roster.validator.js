import { z } from "../../../../common/validation/zod.js";
import { idParams } from "../../../../common/validation/schemas.js";

export const rosterValidators = {
  forRoute: { params: idParams("routeId"), query: z.object({ format: z.enum(["csv", "xlsx"]).optional() }) }
};
