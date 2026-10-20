import { z } from "../../../../common/validation/zod.js";
import { id } from "../../../../common/validation/schemas.js";
import { CODE_SLOT_MAX } from "../../shared/constants/academic.constants.js";

const digit = () => z.coerce.number().int().min(1).max(CODE_SLOT_MAX);

export const subjectCodeValidators = {
  /* The places of some or all classes; a class not sent keeps its place */
  saveSlots: {
    body: z.object({
      slots: z
        .array(z.object({ classId: id(), stage: digit(), position: digit() }))
        .min(1)
        .max(50)
        .refine(list => new Set(list.map(s => s.classId)).size === list.length, "each class may be sent once")
        .refine(list => new Set(list.map(s => `${s.stage}-${s.position}`)).size === list.length, "two classes cannot share a place")
    })
  }
};
