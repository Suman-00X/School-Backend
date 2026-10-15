import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import { MAX_ROOM_CAPACITY, ROOM_STATUSES } from "../../shared/constants/hostel.constants.js";

const fields = z.object({
  roomNumber: text(20),
  /* 0 = ground floor; negative for basements */
  floor: z.number().int().min(-5).max(200).optional(),
  capacity: z.number().int().min(1).max(MAX_ROOM_CAPACITY),
  roomType: optionalText(50),
  monthlyFee: z.number().min(0).max(10_000_000).multipleOf(0.01).optional(),
  status: z.enum(ROOM_STATUSES).optional(),
  description: optionalText()
});

const params = idParams("roomId");

export const roomValidators = {
  create: { body: fields.extend({ hostelId: id() }) },
  list: {
    query: listQuery({
      hostelId: id().optional(),
      status: z.enum(ROOM_STATUSES).optional(),
      floor: z.coerce.number().int().optional()
    })
  },
  getById: { params },
  /* A room cannot move to another hostel: create a new one instead */
  update: { params, body: patchBody(fields) },
  remove: { params }
};
