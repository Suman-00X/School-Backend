import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import { ADMISSION_TYPES, ENROLLMENT_STATUSES, ROLL_NUMBER_ORDERS } from "../../shared/constants/academic.constants.js";

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
  updatePolicy: { body: z.object({ rollNumberOrder: z.enum(ROLL_NUMBER_ORDERS) }) },
  /* Exactly one of sectionId, classId or all: true (sections of the selected year) */
  assignRollNumbers: {
    body: z
      .object({
        sectionId: id().optional(),
        classId: id().optional(),
        all: z.literal(true).optional(),
        /* Preview: the new order, nothing saved */
        dryRun: z.boolean().default(false)
      })
      .refine(body => [body.sectionId, body.classId, body.all].filter(Boolean).length === 1, {
        message: "must name exactly one of sectionId, classId or all: true"
      })
  },
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
