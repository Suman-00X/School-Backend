import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, patchBody, text } from "../../../../common/validation/schemas.js";

/* "08:30" or "08:30:00" */
const time = () => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "must be a time like 08:30");

const periodFields = z.object({
  periodNumber: z.number().int().min(1).max(20),
  name: text(50),
  startTime: time(),
  endTime: time(),
  isBreak: z.boolean().optional()
});

const slotFields = z.object({
  sectionId: id(),
  /* ISO weekday: 1 = Monday … 7 = Sunday */
  weekday: z.number().int().min(1).max(7),
  periodId: id(),
  subjectId: id(),
  /* Defaults to the teacher assigned to the subject in the section */
  teacherId: id().optional(),
  room: z.string().trim().min(1).max(30).optional()
});

const ordered = p => !p.startTime || !p.endTime || p.endTime > p.startTime;

export const timetableValidators = {
  createPeriod: { body: periodFields.refine(ordered, { path: ["endTime"], message: "must be after startTime" }) },
  listPeriods: { query: listQuery() },
  updatePeriod: { params: idParams("periodId"), body: patchBody(periodFields) },
  removePeriod: { params: idParams("periodId") },

  createSlot: { body: slotFields },
  updateSlot: { params: idParams("slotId"), body: patchBody(slotFields.omit({ sectionId: true })) },
  removeSlot: { params: idParams("slotId") },

  sectionGrid: { params: idParams("sectionId") },
  teacherGrid: { params: idParams("teacherId") }
};
