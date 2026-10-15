import { z } from "../../../../common/validation/zod.js";
import {
  date,
  idParams,
  listQuery,
  nonNegativeInt,
  optionalText,
  patchBody,
  phone,
  text
} from "../../../../common/validation/schemas.js";
import { VEHICLE_STATUSES } from "../../shared/constants/transport.constants.js";

/* "ka 01-ab 1234" -> "KA01AB1234" */
const registrationNumber = () =>
  z
    .string()
    .transform(value => value.replace(/[\s-]+/g, "").toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{4,15}$/, "must be 4-15 letters and digits (spaces and hyphens are ignored)"));

/* Optional on create; null clears it on update */
const optional = schema => schema.nullable().optional();

const fields = z.object({
  registrationNumber: registrationNumber(),
  make: optional(text(100)),
  model: optional(text(100)),
  capacity: z.number().int().positive().max(200),
  driverName: optional(text(100)),
  driverPhone: optional(phone()),
  driverLicenseNumber: optional(text(50)),
  attendantName: optional(text(100)),
  attendantPhone: optional(phone()),
  insuranceExpiresOn: optional(date()),
  fitnessCertificateExpiresOn: optional(date()),
  permitExpiresOn: optional(date()),
  status: z.enum(VEHICLE_STATUSES).default("ACTIVE"),
  notes: optionalText()
});

const params = idParams("vehicleId");

export const vehicleValidators = {
  create: { body: fields },
  list: {
    query: listQuery({
      status: z.enum(VEHICLE_STATUSES).optional(),
      /* Compliance view: vehicles with a document expiring within N days (or already expired) */
      expiringWithinDays: nonNegativeInt().max(365).optional()
    })
  },
  getById: { params },
  update: { params, body: patchBody(fields.extend({ status: z.enum(VEHICLE_STATUSES) })) },
  remove: { params }
};
