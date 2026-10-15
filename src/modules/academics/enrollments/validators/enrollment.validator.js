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
  promoteSection: {
    body: z
      .object({
        fromSectionId: id(),
        toAcademicYearId: id(),
        toSectionId: id(),
        overrides: z
          .array(
            z
              .object({
                studentId: id(),
                action: z.enum(["PROMOTE", "REPEAT", "LEAVE"]),
                /* PROMOTE: a different target section; REPEAT: required */
                toSectionId: id().optional()
              })
              .refine(o => o.action !== "REPEAT" || o.toSectionId, {
                path: ["toSectionId"],
                message: "is required when the student repeats"
              })
          )
          .max(200)
          .default([])
      })
      .refine(body => new Set(body.overrides.map(o => o.studentId)).size === body.overrides.length, {
        path: ["overrides"],
        message: "must not list the same student twice"
      })
  },
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
