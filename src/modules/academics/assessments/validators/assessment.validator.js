import { z } from "../../../../common/validation/zod.js";
import { bulkBody, date, id, idParams, listQuery, name, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import { ASSESSMENT_MARK_STATUSES, ASSESSMENT_TYPES } from "../../shared/constants/academic.constants.js";

const marks = () => z.coerce.number().min(0).max(1000);

const fields = z.object({
  bucketId: id(),
  sectionId: id(),
  subjectId: id(),
  assessmentType: z.enum(ASSESSMENT_TYPES),
  title: name(120),
  assessedOn: date().optional(),
  maxMarks: marks().refine(value => value > 0, "must be greater than 0"),
  /* false: kept but left out of the bucket (a practice test) */
  counts: z.boolean().default(true),
  description: optionalText()
});

/* MARKED needs marks; the other statuses take none. clear: true removes the entry. */
const entry = z
  .object({
    studentId: id(),
    status: z.enum(ASSESSMENT_MARK_STATUSES).default("MARKED"),
    marksObtained: marks().optional(),
    remarks: optionalText(500),
    clear: z.boolean().optional()
  })
  .refine(e => e.clear || e.status !== "MARKED" || e.marksObtained !== undefined, {
    path: ["marksObtained"],
    message: "is required for a MARKED entry"
  })
  .refine(e => e.status === "MARKED" || e.marksObtained === undefined, {
    path: ["marksObtained"],
    message: "must not be sent with ABSENT, EXEMPT or MEDICAL"
  });

const params = idParams("assessmentId");

export const assessmentValidators = {
  create: { body: fields },
  list: {
    query: listQuery({ sectionId: id().optional(), subjectId: id().optional(), bucketId: id().optional() })
  },
  getById: { params },
  /* Section and subject are fixed once the item exists */
  update: { params, body: patchBody(fields.omit({ sectionId: true, subjectId: true, assessmentType: true }).extend({ counts: z.boolean() })) },
  remove: { params },
  marks: { params },
  recordMarks: {
    params,
    body: bulkBody("marks", entry, { max: 500, unique: [{ field: "studentId", key: e => e.studentId }] })
  }
};
