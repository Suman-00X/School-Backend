import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import { parentProfileSchema } from "../../parents/index.js";
import { ADMISSION_TYPES } from "../../../academics/shared/constants/academic.constants.js";
import { PARENT_RELATIONS } from "../../shared/constants/user.constants.js";
import { personSchema } from "../../shared/validators/person.validator.js";

/* The admission number is generated on admission (ADM26-0001) and never changes;
   one sent by a client is ignored, like any unknown field */
const profileSchema = z.object({
  admissionDate: date().optional(),
  bloodGroup: optionalText(10),
  category: optionalText(50),
  religion: optionalText(50),
  description: optionalText()
});

const parentLink = {
  relation: z.enum(PARENT_RELATIONS),
  isPrimaryContact: z.boolean().default(false)
};

/* A parent in an admission: an existing one by id, or a new one */
const admissionParent = z.union([
  z.object({ parentId: id(), ...parentLink }),
  z.object({ user: personSchema, profile: parentProfileSchema.default({}), ...parentLink })
]);

const params = idParams("studentId");

export const studentValidators = {
  admit: {
    body: z.object({
      user: personSchema,
      profile: profileSchema.default({}),
      parents: z.array(admissionParent).max(4).default([]),
      enrollment: z.object({
        academicYearId: id(),
        sectionId: id(),
        admissionType: z.enum(ADMISSION_TYPES).default("NEW")
      })
    })
  },
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(profileSchema) },

  /* /students/:studentId/parents */
  listParents: { params, query: listQuery() },
  linkParent: { params, body: z.object({ parentId: id(), ...parentLink }) },
  unlinkParent: { params: idParams("studentId", "parentId") }
};
