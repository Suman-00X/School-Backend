import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import {
  DEFAULT_RESOURCE_CAPACITY,
  MAX_RESOURCE_CAPACITY,
  RESOURCE_STATUSES,
  RESOURCE_TYPES
} from "../../shared/constants/hostel.constants.js";

const fields = z.object({
  name: text(100),
  /* How many students may hold it on one day. Defaults to 1 for lockers, cupboards and study tables. */
  capacity: z.number().int().min(1).max(MAX_RESOURCE_CAPACITY),
  monthlyFee: z.number().min(0).max(10_000_000).multipleOf(0.01).optional(),
  status: z.enum(RESOURCE_STATUSES).optional(),
  /* What a CUSTOM resource is ("Bicycle stand") */
  customType: text(50),
  description: optionalText()
});

const params = idParams("resourceId");

export const resourceValidators = {
  create: {
    body: fields
      .partial({ capacity: true, customType: true })
      .extend({
        hostelId: id(),
        /* Omit for a hostel-wide resource (plans are always hostel-wide) */
        roomId: id().optional(),
        resourceType: z.enum(RESOURCE_TYPES)
      })
      .superRefine((body, issues) => {
        if (body.capacity === undefined && !DEFAULT_RESOURCE_CAPACITY[body.resourceType]) {
          issues.addIssue({ code: "custom", path: ["capacity"], message: `is required for ${body.resourceType}` });
        }
        if ((body.resourceType === "CUSTOM") !== (body.customType !== undefined)) {
          issues.addIssue({
            code: "custom",
            path: ["customType"],
            message: body.resourceType === "CUSTOM" ? "is required for CUSTOM" : "is only for CUSTOM resources"
          });
        }
      })
  },
  list: {
    query: listQuery({
      hostelId: id().optional(),
      roomId: id().optional(),
      resourceType: z.enum(RESOURCE_TYPES).optional(),
      status: z.enum(RESOURCE_STATUSES).optional()
    })
  },
  getById: { params },
  /* The type, hostel and room are fixed: create a new resource instead */
  update: { params, body: patchBody(fields) },
  remove: { params }
};
