import { z } from "../../../../common/validation/zod.js";
import { id, listQuery, text } from "../../../../common/validation/schemas.js";
import { CHANNELS, NOTIFICATION_TYPES } from "../../shared/constants/communication.constants.js";

const objectId = () => z.string().regex(/^[0-9a-f]{24}$/, "must be a valid id");

export const notificationValidators = {
  /* Staff -> specific people, or the parents of specific students */
  send: {
    body: z
      .object({
        userIds: z.array(id()).max(500).default([]),
        studentIds: z.array(id()).max(500).default([]),
        includeParents: z.boolean().default(true),
        title: text(200),
        body: text(2000),
        channels: z
          .array(z.enum(CHANNELS))
          .default(["IN_APP"])
          .transform(channels => [...new Set(["IN_APP", ...channels])])
      })
      .refine(b => b.userIds.length || b.studentIds.length, {
        path: ["userIds"],
        message: "or studentIds must name at least one recipient"
      })
  },
  inbox: {
    query: listQuery({
      unread: z
        .enum(["true", "false"])
        .transform(v => v === "true")
        .optional(),
      type: z.enum(NOTIFICATION_TYPES).optional()
    })
  },
  markRead: { params: z.object({ notificationId: objectId() }), body: z.object({ read: z.boolean() }) }
};
