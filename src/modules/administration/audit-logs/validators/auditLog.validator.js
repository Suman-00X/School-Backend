import { z } from "../../../../common/validation/zod.js";
import { date, id, listQuery } from "../../../../common/validation/schemas.js";

export const auditLogValidators = {
  list: {
    query: listQuery({
      userId: id().optional(),
      /* Exact key ("users.students.admit") or a prefix ending in a dot ("finance.") */
      permission: z
        .string()
        .regex(/^[a-zA-Z.]{2,100}$/, "must be a permission key or a prefix like finance.")
        .optional(),
      entityId: z.string().max(64).optional(),
      method: z.enum(["POST", "PUT", "PATCH", "DELETE"]).optional(),
      from: date().optional(),
      to: date().optional()
    })
  },
  getById: { params: z.object({ auditLogId: z.string().regex(/^[0-9a-f]{24}$/, "must be a valid id") }) }
};
