import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import { ATTENDANCE_STATUSES } from "../../shared/constants/academic.constants.js";

const range = z
  .object({ from: date().optional(), to: date().optional() })
  .refine(q => !q.from || !q.to || q.to >= q.from, { path: ["to"], message: "must be on or after from" });

export const attendanceValidators = {
  updatePolicy: {
    body: patchBody(
      z.object({
        editWindowDays: z.number().int().min(0).max(365),
        overrideRoles: z
          .array(z.enum(["ADMIN", "PRINCIPAL"]))
          .min(1)
          .refine(roles => roles.includes("ADMIN"), "must include ADMIN")
          .transform(roles => [...new Set(roles)])
      })
    )
  },
  record: {
    body: z
      .object({
        sectionId: id(),
        date: date(),
        /* 0 = whole day; 1..12 = a period (then subjectId is required) */
        periodNumber: z.number().int().min(0).max(12).default(0),
        subjectId: id().optional(),
        remarks: optionalText(500),
        /* Required (and only allowed for override roles) once the register is locked */
        overrideReason: optionalText(500),
        records: z
          .array(z.object({ studentId: id(), status: z.enum(ATTENDANCE_STATUSES), remarks: optionalText(300) }))
          .min(1)
          .max(200)
      })
      .refine(body => body.periodNumber === 0 || body.subjectId, {
        path: ["subjectId"],
        message: "is required for period-wise attendance"
      })
      .refine(body => new Set(body.records.map(r => r.studentId)).size === body.records.length, {
        path: ["records"],
        message: "must not list the same student twice"
      })
  },
  register: {
    query: z.object({ sectionId: id(), date: date(), periodNumber: z.coerce.number().int().min(0).max(12).default(0) })
  },
  summary: { query: range.and(z.object({ sectionId: id() })) },
  student: { params: idParams("studentId"), query: range.and(z.object({ academicYearId: id().optional() })) }
};
