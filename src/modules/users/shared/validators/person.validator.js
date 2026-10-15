import { z } from "../../../../common/validation/zod.js";
import { date, email, optionalText, phone, text } from "../../../../common/validation/schemas.js";
import { EMPLOYMENT_TYPES, GENDERS } from "../constants/user.constants.js";

/* Personal details of a user account, shared by every kind of person */
export const personSchema = z.object({
  firstName: text(100),
  middleName: optionalText(100),
  lastName: text(100),
  email: email(),
  phone: phone().optional(),
  gender: z.enum(GENDERS).optional(),
  dob: date().optional(),
  address: optionalText(500)
});

/* Employment details shared by staff and teachers */
export const employmentSchema = z.object({
  qualification: optionalText(255),
  joiningDate: date().optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  bloodGroup: optionalText(10),
  description: optionalText()
});
