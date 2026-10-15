import { z } from "../../../../common/validation/zod.js";
import { email, optionalText, patchBody, phone, text } from "../../../../common/validation/schemas.js";
import { isTimeZone } from "../../../../common/tenancy/tenant.service.js";

export const settingsValidators = {
  update: {
    body: patchBody(
      z.object({
        name: text(150),
        address: optionalText(500),
        contactEmail: email(),
        contactPhone: phone(),
        description: optionalText(),
        timezone: z.string().refine(isTimeZone, "must be an IANA time zone such as Asia/Kolkata"),
        currency: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{3}$/, "must be an ISO 4217 code such as INR"),
        country: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z]{2}$/, "must be an ISO 3166 code such as IN")
      })
    )
  }
};
