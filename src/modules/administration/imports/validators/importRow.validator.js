import { z } from "../../../../common/validation/zod.js";
import { date, email, id, listQuery, optionalText, phone, text } from "../../../../common/validation/schemas.js";
import { GENDERS, PARENT_RELATIONS } from "../../../users/shared/constants/user.constants.js";
import { STUDENT_FIELD_NAMES } from "../../shared/utils/studentFields.util.js";
import { IMPORT_STATUSES } from "../models/importJob.model.js";

/* One CSV row of a student import (headers are camel-cased: "First Name" -> firstName) */
export const studentRowSchema = z
  .object({
    firstName: text(100),
    lastName: text(100),
    email: email(),
    phone: phone().optional(),
    gender: z.string().trim().toUpperCase().pipe(z.enum(GENDERS)).optional(),
    dob: date().optional(),
    admissionDate: date().optional(),
    className: text(50),
    sectionName: z.string().trim().toUpperCase().min(1).max(5),
    parentFirstName: optionalText(100),
    parentLastName: optionalText(100),
    parentEmail: email().optional(),
    parentPhone: phone().optional(),
    parentRelation: z.string().trim().toUpperCase().pipe(z.enum(PARENT_RELATIONS)).optional()
  })
  .refine(row => !row.parentEmail || (row.parentRelation && row.parentFirstName && row.parentLastName), {
    path: ["parentEmail"],
    message: "needs parentFirstName, parentLastName and parentRelation"
  });

/* Column order of the downloadable template */
export const STUDENT_TEMPLATE_COLUMNS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "gender",
  "dob",
  "admissionDate",
  "className",
  "sectionName",
  "parentFirstName",
  "parentLastName",
  "parentEmail",
  "parentPhone",
  "parentRelation"
];

/* field -> sheet column header (null unmaps a field) */
const mapping = z.partialRecord(z.enum(STUDENT_FIELD_NAMES), z.string().trim().min(1).max(200).nullable());

/* Multipart forms carry the mapping as a JSON string */
const mappingField = z
  .string()
  .transform((text, ctx) => {
    try {
      return JSON.parse(text);
    } catch {
      ctx.addIssue({ code: "custom", message: "must be a JSON object" });
      return z.NEVER;
    }
  })
  .pipe(mapping);

const importParams = z.object({ importId: z.string().regex(/^[0-9a-f]{24}$/, "must be a valid import id") });

export const importValidators = {
  createStudents: {
    query: z.object({ academicYearId: id().optional() }),
    body: z.object({ mapping: mappingField.optional() })
  },
  updateMapping: { params: importParams, body: z.object({ mapping }) },
  list: { query: listQuery({ status: z.enum(IMPORT_STATUSES).optional() }) },
  getById: { params: importParams }
};
