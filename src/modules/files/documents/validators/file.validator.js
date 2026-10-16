import { z } from "../../../../common/validation/zod.js";
import { id, listQuery, optionalText } from "../../../../common/validation/schemas.js";
import { DIRECT_OWNER_TYPES } from "../../shared/constants/file.constants.js";

const objectId = () => z.string().regex(/^[0-9a-f]{24}$/, "must be a valid id");

/* Files uploaded through /files directly: student and staff records, general documents */

export const fileValidators = {
  upload: {
    body: z.object({
      ownerType: z.enum(DIRECT_OWNER_TYPES),
      /* Student or staff-member id; omit for GENERAL */
      ownerId: id().optional(),
      category: z.enum(["PHOTO", "DOCUMENT"]),
      description: optionalText(300)
    })
  },
  list: {
    query: listQuery({ ownerType: z.enum(DIRECT_OWNER_TYPES).optional(), ownerId: z.string().max(64).optional() })
  },
  byId: { params: z.object({ fileId: objectId() }) }
};
