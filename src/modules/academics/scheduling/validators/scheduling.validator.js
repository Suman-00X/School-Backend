import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, name } from "../../../../common/validation/schemas.js";
import {
  CLASS_TIMETABLE_MODES,
  EXAM_ALIGNMENTS,
  EXAM_SPREADS,
  MAX_ATTEMPTS,
  MAX_TIME_LIMIT_MS,
  SCHEDULING_KINDS,
  SCHEDULING_STATUSES
} from "../constants/scheduling.constants.js";

/* The descriptions are read by people (API docs) and by AI agents (tool input schemas):
   each says what the field does and what happens when it is left out. */

const weekday = () => z.number().int().min(1).max(7).describe("ISO weekday: 1 = Monday … 7 = Sunday");
const periodNumbers = () =>
  z
    .array(z.number().int().min(1).max(20))
    .min(1)
    .max(20)
    .describe("Period numbers as the bell schedule numbers them (breaks are numbered too but never hold classes)");
const time = () => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be a time like 09:30");
const ids = (max, what) => z.array(id()).min(1).max(max).describe(what);

const search = {
  seed: z
    .number()
    .int()
    .min(0)
    .max(2 ** 31 - 1)
    .optional()
    .describe(
      "Same seed and inputs give the same timetable. Leave out for a new one; send another seed for an alternative."
    ),
  attempts: z
    .number()
    .int()
    .min(1)
    .max(MAX_ATTEMPTS)
    .optional()
    .describe(
      "How many fresh starts the search makes before improving the best (default 8 for classes, 12 for exams). More is slower and usually a little better."
    ),
  timeLimitMs: z
    .number()
    .int()
    .min(1000)
    .max(MAX_TIME_LIMIT_MS)
    .optional()
    .describe("Stop searching after this long (default 20000)")
};

/* ---------- class timetable ---------- */

const subjectRule = z
  .object({
    subjectId: id(),
    classIds: ids(100, "Only in these classes (default: wherever the subject is taught)").optional(),
    sectionIds: ids(500, "Only in these sections (default: wherever the subject is taught)").optional(),
    doublePeriods: z
      .number()
      .int()
      .min(0)
      .max(10)
      .optional()
      .describe(
        "How many of the weekly classes are doubles: two periods in a row with no break between (labs, art). Counted in the weekly classes."
      ),
    maxPerDay: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe(
        "Most periods of the subject a section has in one day. Default: the weekly classes over the days the teacher and section are available, rounded up (at least 2 with doubles)."
      ),
    preferredPeriods: periodNumbers()
      .optional()
      .describe("Periods the subject should be in when it can, e.g. [1, 2, 3] for mornings"),
    avoidPeriods: periodNumbers()
      .optional()
      .describe("Periods the subject should stay out of when it can, e.g. the last period"),
    room: z
      .string()
      .trim()
      .min(1)
      .max(30)
      .optional()
      .describe("A shared room the subject is taught in (a lab): never two classes in it at once")
  })
  .describe("Rules for one subject");

const teacherRule = z
  .object({
    teacherId: id(),
    unavailable: z
      .array(
        z.object({
          weekday: weekday(),
          periodNumbers: periodNumbers().optional().describe("Default: the whole day")
        })
      )
      .max(50)
      .optional()
      .describe("Times the teacher cannot teach (part-time days, duties)"),
    maxPerDay: z.number().int().min(1).max(20).optional().describe("Most periods the teacher teaches in a day"),
    maxConsecutive: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Most periods the teacher teaches in a row (a break ends a run)")
  })
  .describe("Rules for one teacher");

const closedPeriod = z
  .object({
    weekday: weekday(),
    periodNumbers: periodNumbers().optional().describe("Default: the whole day"),
    classIds: ids(100, "Only these classes (default: every section in scope)").optional(),
    sectionIds: ids(500, "Only these sections (default: every section in scope)").optional()
  })
  .describe("Periods with no classes, e.g. a half-day Saturday or an assembly");

const pinnedClass = z
  .object({
    sectionId: id(),
    weekday: weekday(),
    periodNumber: z.number().int().min(1).max(20),
    subjectId: id()
  })
  .describe("A class that must be at this time (counted in the subject's weekly classes)");

const weights = z
  .object({
    spread: z.number().min(0).max(100).describe("Spread a subject's classes over the week (default 10)"),
    adjacency: z.number().min(0).max(100).describe("Avoid the same subject twice in a row unless a double (default 4)"),
    holes: z.number().min(0).max(100).describe("Avoid free periods in the middle of a section's day (default 6)"),
    balance: z.number().min(0).max(100).describe("Keep a section's days of similar length (default 1)"),
    teacherGaps: z.number().min(0).max(100).describe("Avoid idle periods between a teacher's classes (default 2)"),
    preferences: z.number().min(0).max(100).describe("Honour preferred and avoided periods (default 3)")
  })
  .partial()
  .describe("How much each soft rule matters; 0 turns one off");

export const classTimetableRequest = z
  .object({
    sectionIds: ids(500, "Sections to plan (default: every section of the academic year)").optional(),
    mode: z
      .enum(CLASS_TIMETABLE_MODES)
      .default("FILL")
      .describe(
        "FILL: keep the lessons already on the timetable and place only what is missing. REPLACE: plan the sections' whole week again; applying removes their current lessons."
      ),
    subjects: z.array(subjectRule).max(500).default([]),
    teachers: z.array(teacherRule).max(1000).default([]),
    closedPeriods: z.array(closedPeriod).max(200).default([]),
    pinned: z.array(pinnedClass).max(2000).default([]),
    teacherMaxPerDay: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Most periods any teacher teaches in a day (a teacher's own rule wins)"),
    teacherMaxConsecutive: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Most periods any teacher teaches in a row (a teacher's own rule wins)"),
    weights: weights.optional(),
    ...search
  })
  .describe(
    "What to plan and the rules the timetable must follow. Weekly classes come from each section subject's classes a week; teachers from the teacher assignments."
  );

/* ---------- exam timetable ---------- */

const sitting = z
  .object({
    name: name(30).describe('"Morning", "Afternoon"'),
    startTime: time(),
    endTime: time()
  })
  .refine(s => s.endTime > s.startTime, { path: ["endTime"], message: "must be after startTime" });

const duration = z
  .object({
    subjectId: id().optional().describe("Default: every subject"),
    component: z.string().trim().min(1).max(20).optional().describe("THEORY, PRACTICAL…; default: every component"),
    classIds: ids(100, "Only these classes (default: every class)").optional(),
    minutes: z.number().int().min(15).max(480)
  })
  .describe("How long matching papers last; the most specific rule wins. Default: the whole sitting.");

export const examTimetableRequest = z
  .object({
    examId: id(),
    startDate: date().optional().describe("First day papers may be sat (default: the exam's start date)"),
    endDate: date().optional().describe("Last day papers may be sat (default: the exam's end date)"),
    sessions: z
      .array(sitting)
      .min(1)
      .max(3)
      .default([{ name: "Morning", startTime: "09:30", endTime: "12:30" }])
      .describe("The sittings of a school day, in order (default: one, 09:30–12:30)"),
    maxPapersPerDay: z.number().int().min(1).max(3).default(1).describe("Most papers a section sits in one day"),
    minGapDays: z
      .number()
      .int()
      .min(0)
      .max(5)
      .default(0)
      .describe("School days a section has free between two papers on different days"),
    align: z
      .enum(EXAM_ALIGNMENTS)
      .default("CLASS")
      .describe(
        "Papers sat together: CLASS, a subject at the same time for every section of a class (one question paper); SCHOOL, for every section; NONE, each on its own"
      ),
    spread: z
      .enum(EXAM_SPREADS)
      .default("EVEN")
      .describe("EVEN: spread each section's papers over the window; COMPACT: finish as early as possible"),
    durations: z.array(duration).max(200).default([]),
    restDayBefore: z
      .array(id())
      .max(50)
      .default([])
      .describe("Subjects that should have a free school day before them, when possible"),
    avoidDates: z
      .array(date())
      .max(60)
      .default([])
      .describe("Days with no papers, beyond holidays and weekly off days"),
    keepScheduled: z
      .boolean()
      .default(false)
      .describe("Keep papers that already have a date and time where they are, and plan only the others"),
    ...search
  })
  .refine(r => !r.startDate || !r.endDate || r.endDate >= r.startDate, {
    path: ["endDate"],
    message: "must be on or after startDate"
  })
  .refine(r => r.sessions.every((s, i) => i === 0 || s.startTime >= r.sessions[i - 1].endTime), {
    path: ["sessions"],
    message: "must be in order and must not overlap"
  })
  .describe(
    "Which exam to plan, over which days, and the rules its timetable must follow. Papers come from the exam's papers."
  );

/* ---------- runs ---------- */

export const applyRequest = z.object({
  allowIncomplete: z
    .boolean()
    .default(false)
    .describe(
      "Apply a class timetable even when some classes could not be placed (they stay to be added by hand). An exam timetable must be complete."
    )
});

const runParams = idParams("runId");

export const schedulingValidators = {
  classInputs: {
    query: z.object({
      /* ?sectionIds=a,b,c */
      sectionIds: z
        .string()
        .optional()
        .transform(value =>
          value
            ? value
                .split(",")
                .map(part => part.trim())
                .filter(Boolean)
            : undefined
        )
        .pipe(z.array(id()).max(500).optional()),
      mode: z.enum(CLASS_TIMETABLE_MODES).default("FILL")
    })
  },
  generateClass: { body: classTimetableRequest },
  generateExam: { body: examTimetableRequest },
  listRuns: {
    query: listQuery({
      kind: z.enum(SCHEDULING_KINDS).optional(),
      status: z.enum(SCHEDULING_STATUSES).optional(),
      examId: id().optional()
    })
  },
  getRun: { params: runParams },
  sectionGrid: { params: idParams("runId", "sectionId") },
  teacherGrid: { params: idParams("runId", "teacherId") },
  apply: { params: runParams, body: applyRequest },
  discard: { params: runParams }
};
