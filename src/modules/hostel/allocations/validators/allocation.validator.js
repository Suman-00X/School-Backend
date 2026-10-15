import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText } from "../../../../common/validation/schemas.js";
import { ALLOCATION_STATUSES, MAX_ROOM_CAPACITY } from "../../shared/constants/hostel.constants.js";

/* Omit to take the lowest free bed. Whether it exists in the room is checked against its capacity. */
const bedNumber = z.number().int().min(1).max(MAX_ROOM_CAPACITY).optional();

const params = idParams("allocationId");

export const allocationValidators = {
  create: {
    body: z.object({
      studentId: id(),
      roomId: id(),
      bedNumber,
      /* Defaults to today */
      allocatedOn: date().optional(),
      notes: optionalText(500)
    })
  },
  list: {
    query: listQuery({
      hostelId: id().optional(),
      roomId: id().optional(),
      studentId: id().optional(),
      status: z.enum(ALLOCATION_STATUSES).optional()
    })
  },
  getById: { params },
  update: { params, body: z.object({ notes: z.string().trim().max(500) }) },
  vacate: { params, body: z.object({ vacatedOn: date().optional(), notes: optionalText(500) }) },
  transfer: {
    params,
    body: z.object({ roomId: id(), bedNumber, transferredOn: date().optional(), notes: optionalText(500) })
  }
};
