import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, patchBody, text } from "../../../../common/validation/schemas.js";
import { DIARY_ENTRY_KINDS, MAX_DAYS, SUBJECT_KINDS } from "../constants/diary.constants.js";

const kind = z.enum(DIARY_ENTRY_KINDS);
const body = text(2000);

const fields = z
  .object({
    sectionId: id(),
    entryDate: date(),
    kind,
    subjectId: id().optional(),
    /* A note to this student's family only */
    studentId: id().optional(),
    body
  })
  .refine(e => !SUBJECT_KINDS.includes(e.kind) || e.subjectId, {
    message: "Classwork and homework need a subject",
    path: ["subjectId"]
  })
  .refine(e => !e.studentId || e.kind === "NOTE", {
    message: "Only a note can be written to one student's family",
    path: ["studentId"]
  });

const dayDiff = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/* ?from=&to= (both days included, up to MAX_DAYS) */
export const dayRange = z
  .object({ from: date(), to: date() })
  .refine(r => r.from <= r.to, { message: "from must be on or before to", path: ["from"] })
  .refine(r => dayDiff(r.from, r.to) < MAX_DAYS, { message: `The range can be at most ${MAX_DAYS} days`, path: ["to"] });

export const dayQuery = z.object({ date: date() });

export const diaryValidators = {
  create: { body: fields },
  /* subjectId: null takes the subject off (only for a reminder or note) */
  update: { params: idParams("entryId"), body: patchBody(z.object({ kind, subjectId: id().nullable(), body })) },
  remove: { params: idParams("entryId") },
  days: { params: idParams("sectionId"), query: dayRange },
  day: { params: idParams("sectionId"), query: dayQuery }
};
