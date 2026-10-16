import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import { ATTENDANCE_KINDS, ATTENDANCE_MODES, ATTENDANCE_STATUSES } from "../../shared/constants/academic.constants.js";

const range = z
  .object({ from: date().optional(), to: date().optional() })
  .refine(q => !q.from || !q.to || q.to >= q.from, { path: ["to"], message: "must be on or after from" });

/* Period numbers follow the bell schedule (1..20) */
const periodNumber = () => z.number().int().min(0).max(20);

/* PERIOD needs a period number; the other kinds have none */
const periodFitsKind = [
  body => (body.kind === "PERIOD" ? body.periodNumber > 0 : !body.kind || !body.periodNumber),
  { path: ["periodNumber"], message: "is required for a PERIOD register and not allowed for the other kinds" }
];

export const attendanceValidators = {
  updatePolicy: {
    body: patchBody(
      z.object({
        editWindowDays: z.number().int().min(0).max(365),
        overrideRoles: z
          .array(z.enum(["ADMIN", "PRINCIPAL"]))
          .min(1)
          .refine(roles => roles.includes("ADMIN"), "must include ADMIN")
          .transform(roles => [...new Set(roles)]),
        /* Period-wise days: % of periods to attend for the day to count as present */
        periodPresenceThreshold: z.number().int().min(1).max(100),
        /* The school's mode, and per-class overrides (mode null = follow the school) */
        mode: z.enum(ATTENDANCE_MODES),
        classModes: z
          .array(z.object({ classId: id(), mode: z.enum(ATTENDANCE_MODES).nullable() }))
          .min(1)
          .max(100)
          .refine(list => new Set(list.map(c => c.classId)).size === list.length, "must not list the same class twice"),
        /* Default: tomorrow */
        modeEffectiveFrom: date()
      })
    ).refine(body => !body.modeEffectiveFrom || body.mode || body.classModes, {
      path: ["modeEffectiveFrom"],
      message: "is only used with mode or classModes"
    })
  },
  record: {
    body: z
      .object({
        sectionId: id(),
        date: date(),
        /* Default: PERIOD when periodNumber is sent, else DAY */
        kind: z.enum(ATTENDANCE_KINDS).optional(),
        /* 0 = not a period; 1..20 = a period of the timetable */
        periodNumber: periodNumber().default(0),
        /* Period registers: the timetable's subject (optional, checked when sent) */
        subjectId: id().optional(),
        remarks: optionalText(500),
        /* Required (and only allowed for override roles) once the register is locked */
        overrideReason: optionalText(500),
        records: z
          .array(z.object({ studentId: id(), status: z.enum(ATTENDANCE_STATUSES), remarks: optionalText(300) }))
          .min(1)
          .max(200)
      })
      .refine(...periodFitsKind)
      .refine(body => body.periodNumber > 0 || !body.subjectId, {
        path: ["subjectId"],
        message: "is only used for period registers"
      })
      .refine(body => new Set(body.records.map(r => r.studentId)).size === body.records.length, {
        path: ["records"],
        message: "must not list the same student twice"
      })
  },
  register: {
    query: z
      .object({
        sectionId: id(),
        date: date(),
        /* Without kind: the whole day (every register the class's mode takes) */
        kind: z.enum(ATTENDANCE_KINDS).optional(),
        periodNumber: z.coerce.number().pipe(periodNumber()).optional()
      })
      .transform(q => ({ ...q, kind: q.kind ?? (q.periodNumber ? "PERIOD" : undefined) }))
      .refine(...periodFitsKind)
  },
  summary: { query: range.and(z.object({ sectionId: id() })) },
  student: { params: idParams("studentId"), query: range.and(z.object({ academicYearId: id().optional() })) }
};
