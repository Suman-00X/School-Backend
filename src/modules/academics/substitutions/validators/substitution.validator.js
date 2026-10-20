import { z } from "../../../../common/validation/zod.js";
import { daysBetween } from "../../../../common/utils/date.util.js";
import { date, id, idParams, optionalText, text } from "../../../../common/validation/schemas.js";
import { SUBSTITUTION_KINDS } from "../../shared/constants/academic.constants.js";

/* A teacher's duties: at most a month at a time */
const MAX_DUTY_DAYS = 31;

/* SUBSTITUTE needs the teacher; ACTIVITY the activity (a teacher in charge is optional);
   LEISURE and NOT_NEEDED take neither. Only a substitute takes another subject. */
const fitsKind = [
  [b => b.kind !== "SUBSTITUTE" || b.substituteTeacherId, "substituteTeacherId", "is required for a SUBSTITUTE"],
  [b => b.kind !== "ACTIVITY" || b.activity, "activity", "is required for an ACTIVITY"],
  [b => b.kind === "ACTIVITY" || !b.activity, "activity", "is only for an ACTIVITY"],
  [b => b.kind === "SUBSTITUTE" || !b.subjectId, "subjectId", "is only for a SUBSTITUTE"],
  [
    b => ["SUBSTITUTE", "ACTIVITY"].includes(b.kind) || !b.substituteTeacherId,
    "substituteTeacherId",
    "is only for a SUBSTITUTE or an ACTIVITY"
  ]
];

const assignBody = fitsKind.reduce(
  (schema, [test, path, message]) => schema.refine(test, { path: [path], message }),
  z.object({
    date: date(),
    timetableSlotId: id(),
    kind: z.enum(SUBSTITUTION_KINDS),
    substituteTeacherId: id().optional(),
    /* SUBSTITUTE: the subject they take, when not the lesson's */
    subjectId: id().optional(),
    /* ACTIVITY: "Library", "Games", "Quiz" … */
    activity: text(100).optional(),
    note: optionalText(300)
  })
);

export const substitutionValidators = {
  plan: { query: z.object({ date: date().optional() }) },
  candidates: { query: z.object({ date: date(), timetableSlotId: id() }) },
  assign: { body: assignBody },
  cancel: { params: idParams("substitutionId") },
  mine: {
    query: z
      .object({ from: date().optional(), to: date().optional() })
      .refine(q => !q.from || !q.to || q.to >= q.from, { path: ["to"], message: "must be on or after from" })
      .refine(q => !q.from || !q.to || daysBetween(q.from, q.to) < MAX_DUTY_DAYS, {
        path: ["to"],
        message: `must be within ${MAX_DUTY_DAYS} days of from`
      })
  }
};
