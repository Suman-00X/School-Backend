import { z } from "../../../../common/validation/zod.js";
import { email, idParams, listQuery, name, optionalText, phone, text } from "../../../../common/validation/schemas.js";
import { isTimeZone } from "../../../../common/tenancy/tenant.service.js";
import { SWITCHABLE_MODULE_KEYS } from "../../shared/constants/schoolModules.constants.js";

/* The same rule as provisioning: 2-20 letters, digits or dashes */
const schoolCode = () =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, "must be 2-20 letters, digits or dashes");

const modules = () =>
  z
    .array(z.enum(SWITCHABLE_MODULE_KEYS))
    .max(SWITCHABLE_MODULE_KEYS.length)
    .refine(keys => new Set(keys).size === keys.length, "must not repeat a module");

/* The number of students the school is onboarded (and charged) for */
const studentCount = () => z.coerce.number().int().min(1).max(1_000_000);

const schoolFields = z.object({
  name: text(150),
  studentCount: studentCount(),
  code: schoolCode(),
  address: text(500),
  contactEmail: email(),
  contactPhone: phone(),
  description: optionalText(1000),
  timezone: z
    .string()
    .trim()
    .refine(isTimeZone, "must be an IANA time zone such as Asia/Kolkata")
    .default("Asia/Kolkata"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "must be an ISO 4217 code such as INR")
    .default("INR"),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "must be an ISO 3166 code such as IN")
    .default("IN")
});

const adminFields = z.object({
  firstName: name(100),
  middleName: name(100).optional(),
  lastName: name(100),
  email: email(),
  phone: phone().optional()
});

const schoolParams = idParams("schoolId");

export const schoolValidators = {
  list: {
    query: listQuery({
      status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
      search: z.string().trim().min(1).max(100).optional(),
      /* Schools with this module switched on */
      module: z.enum(SWITCHABLE_MODULE_KEYS).optional(),
      sort: z.enum(["newest", "oldest", "name", "students"]).default("newest")
    })
  },
  codeAvailability: { query: z.object({ code: schoolCode() }) },
  onboard: {
    body: z.object({
      school: schoolFields,
      admin: adminFields,
      modules: modules()
    })
  },
  get: { params: schoolParams },
  update: { params: schoolParams, body: z.object({ studentCount: studentCount() }) },
  setModules: { params: schoolParams, body: z.object({ modules: modules() }) },
  setStatus: { params: schoolParams, body: z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) }) },
  invite: { params: idParams("schoolId", "userId") }
};
