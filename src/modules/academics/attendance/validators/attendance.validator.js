import { z } from "../../../../common/validation/zod.js";
import { daysBetween } from "../../../../common/utils/date.util.js";
import { date, id, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import { ATTENDANCE_KINDS, ATTENDANCE_MODES, ATTENDANCE_STATUSES } from "../../shared/constants/academic.constants.js";

const range = z
  .object({ from: date().optional(), to: date().optional() })
  .refine(q => !q.from || !q.to || q.to >= q.from, { path: ["to"], message: "must be on or after from" });

/* Missing registers: at most a term at a time */
const MAX_MISSING_DAYS = 92;

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
        /* The school's mode: the same for every class */
        mode: z.enum(ATTENDANCE_MODES),
        /* Default: tomorrow, also the earliest (D-66) */
        modeEffectiveFrom: date(),
        /* Gone: refused rather than silently ignored */
        classModes: z.unknown()
      })
    )
      .refine(body => body.classModes === undefined, {
        path: ["classModes"],
        message: "is not supported: the attendance mode is the same for the whole school"
      })
      .refine(body => !body.modeEffectiveFrom || body.mode, {
        path: ["modeEffectiveFrom"],
        message: "is only used with mode"
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
        /* Period registers: the subject taught. Default: the timetable's; required when
           the section has no class timetabled then (a substitute's own subject) */
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
  cover: { params: idParams("sectionId") },
  markFree: {
    body: z.object({
      sectionId: id(),
      date: date(),
      periodNumber: periodNumber().min(1),
      /* Why the period is free: "Science teacher on leave" */
      reason: text(300),
      /* Required (and only allowed for override roles) once the date is locked */
      overrideReason: optionalText(500)
    })
  },
  listFree: { query: listQuery({ sectionId: id().optional() }).and(range) },
  removeFree: { params: idParams("freePeriodId"), query: z.object({ overrideReason: optionalText(500) }) },
  missingRegisters: {
    query: z
      .object({ from: date(), to: date(), sectionId: id().optional(), teacherId: id().optional() })
      .refine(q => q.to >= q.from, { path: ["to"], message: "must be on or after from" })
      .refine(q => daysBetween(q.from, q.to) <= MAX_MISSING_DAYS, {
        path: ["to"],
        message: `must be within ${MAX_MISSING_DAYS} days of from`
      })
  },
  student: { params: idParams("studentId"), query: range.and(z.object({ academicYearId: id().optional() })) }
};
