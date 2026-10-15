import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import { ADMISSION_TYPES, ENROLLMENT_STATUSES } from "../../shared/constants/academic.constants.js";

const editable = z.object({
  sectionId: id(),
  rollNumber: text(20),
  status: z.enum(ENROLLMENT_STATUSES),
  admissionType: z.enum(ADMISSION_TYPES),
  description: optionalText()
});

export const enrollmentValidators = {
  create: {
    body: z.object({
      studentId: id(),
      sectionId: id(),
      rollNumber: text(20).optional(),
      admissionType: z.enum(ADMISSION_TYPES).default("NEW"),
      description: optionalText()
    })
  },
  list: { query: listQuery({ sectionId: id() }) },
  update: { params: idParams("enrollmentId"), body: patchBody(editable) },
  promote: {
    body: z
      .object({
        studentId: id(),
        fromAcademicYearId: id(),
        toAcademicYearId: id(),
        toSectionId: id(),
        admissionType: z.enum(ADMISSION_TYPES).default("PROMOTED")
      })
      .refine(body => body.fromAcademicYearId !== body.toAcademicYearId, {
        path: ["toAcademicYearId"],
        message: "must differ from fromAcademicYearId"
      })
  }
};
