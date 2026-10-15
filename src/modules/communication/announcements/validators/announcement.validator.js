import { z } from "../../../../common/validation/zod.js";
import { id, listQuery, patchBody, text } from "../../../../common/validation/schemas.js";
import { ANNOUNCEMENT_STATUSES, AUDIENCE_ROLES, CHANNELS } from "../../shared/constants/communication.constants.js";

const objectId = () => z.string().regex(/^[0-9a-f]{24}$/, "must be a valid id");

const fields = z.object({
  title: text(200),
  body: text(5000),
  audience: z.object({
    roles: z.array(z.enum(AUDIENCE_ROLES)).min(1),
    /* Narrow STUDENT/PARENT recipients to classes or sections (current year) */
    classIds: z.array(id()).default([]),
    sectionIds: z.array(id()).default([])
  }),
  channels: z
    .array(z.enum(CHANNELS))
    .min(1)
    .default(["IN_APP"])
    .transform(channels => [...new Set(["IN_APP", ...channels])])
});

const params = z.object({ announcementId: objectId() });

export const announcementValidators = {
  create: { body: fields },
  list: { query: listQuery({ status: z.enum(ANNOUNCEMENT_STATUSES).optional() }) },
  getById: { params },
  update: {
    params,
    body: patchBody(fields.omit({ channels: true }).extend({ channels: z.array(z.enum(CHANNELS)).min(1) }))
  },
  remove: { params },
  publish: {
    params,
    body: z.object({
      publishAt: z.iso
        .datetime({ offset: true })
        .refine(value => new Date(value) > new Date(Date.now() - 60_000), "must not be in the past")
        .optional()
    })
  }
};
