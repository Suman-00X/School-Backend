import { z } from "../../../../common/validation/zod.js";
import { patchBody } from "../../../../common/validation/schemas.js";
import { NEP_STAGE_KEYS, UDISE_CODE } from "../constants/nep.constants.js";

export const nepPolicyValidators = {
  update: {
    body: patchBody(
      z.object({
        holisticProgressCard: z.boolean(),
        hpcStages: z.array(z.enum(NEP_STAGE_KEYS)).max(NEP_STAGE_KEYS.length),
        udiseExport: z.boolean(),
        apaarExport: z.boolean(),
        /* null clears it (only while the UDISE+ export is off) */
        udiseCode: z.string().trim().regex(UDISE_CODE, "must be the school's 11-digit UDISE code").nullable()
      })
    )
  }
};
