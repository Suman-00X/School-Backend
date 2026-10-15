import { z } from "../../../../common/validation/zod.js";
import { id, listQuery, optionalText } from "../../../../common/validation/schemas.js";

const objectId = () => z.string().regex(/^[0-9a-f]{24}$/, "must be a valid id");

/* Files uploaded through /files directly: student and staff records, general documents */
const DIRECT_OWNERS = ["STUDENT", "STAFF", "GENERAL"];

export const fileValidators = {
  upload: {
    body: z.object({
      ownerType: z.enum(DIRECT_OWNERS),
      /* Student or staff-member id; omit for GENERAL */
      ownerId: id().optional(),
      category: z.enum(["PHOTO", "DOCUMENT"]),
      description: optionalText(300)
    })
  },
  list: { query: listQuery({ ownerType: z.enum(DIRECT_OWNERS).optional(), ownerId: z.string().max(64).optional() }) },
  byId: { params: z.object({ fileId: objectId() }) }
};
