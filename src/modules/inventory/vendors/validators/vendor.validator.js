import { z } from "../../../../common/validation/zod.js";
import {
  email,
  idParams,
  listQuery,
  name,
  optionalText,
  patchBody,
  phone
} from "../../../../common/validation/schemas.js";
import { searchText } from "../../shared/utils/schemas.util.js";

const fields = z.object({
  name: name(150),
  contactPerson: optionalText(100),
  phone: phone().optional(),
  email: email().optional(),
  /* Format checked here; the GSTIN shape is checked by the service for schools in India */
  taxId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9 /-]{2,29}$/, "must be 3-30 letters, digits, spaces, / or -")
    .optional(),
  address: optionalText(500),
  notes: optionalText(1000)
});

const params = idParams("vendorId");

export const vendorValidators = {
  create: { body: fields },
  list: { query: listQuery({ q: searchText() }) },
  getById: { params },
  update: { params, body: patchBody(fields) },
  remove: { params }
};
