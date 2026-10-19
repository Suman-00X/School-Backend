import { z } from "../../../../common/validation/zod.js";
import {
  code,
  date,
  id,
  idParams,
  listQuery,
  name,
  optionalText,
  patchBody,
  phone
} from "../../../../common/validation/schemas.js";
import { RESIDENT_GENDERS } from "../../shared/constants/hostel.constants.js";

const fields = z.object({
  name: name(100),
  /* Generated (HST-001) when omitted */
  code: code().optional(),
  residentGender: z.enum(RESIDENT_GENDERS),
  /* null removes the warden */
  wardenUserId: id().nullable().optional(),
  address: optionalText(500),
  contactPhone: phone().optional(),
  description: optionalText()
});

const params = idParams("hostelId");

export const hostelValidators = {
  create: { body: fields },
  list: { query: listQuery({ residentGender: z.enum(RESIDENT_GENDERS).optional() }) },
  getById: { params },
  update: { params, body: patchBody(fields) },
  remove: { params },
  /* ?on=YYYY-MM-DD (default today) */
  occupancy: { params, query: z.object({ on: date().optional() }) }
};
