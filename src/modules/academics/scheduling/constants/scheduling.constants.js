/* What a scheduling run plans */
export const SCHEDULING_KINDS = ["CLASS_TIMETABLE", "EXAM_TIMETABLE"];

/* DRAFT: generated, nothing changed yet; APPLIED: written to the timetable or the exam's
   papers; DISCARDED: set aside. Only a draft can be applied or discarded. */
export const SCHEDULING_STATUSES = ["DRAFT", "APPLIED", "DISCARDED"];

/* Who asked for the run: a person through the API/UI, or an AI agent through a tool */
export const SCHEDULING_ORIGINS = ["API", "AGENT_TOOL"];

/* FILL: keep the section's lessons already on the timetable and place only what is missing;
   REPLACE: plan the sections' whole week again (applying removes their current lessons) */
export const CLASS_TIMETABLE_MODES = ["FILL", "REPLACE"];

/* Which papers of an exam are sat together, in one sitting (see the exam solver) */
export const EXAM_ALIGNMENTS = ["CLASS", "SCHOOL", "NONE"];

/* EVEN: spread each section's papers over the window; COMPACT: finish as early as possible */
export const EXAM_SPREADS = ["EVEN", "COMPACT"];

/* The search's own limits */
export const MAX_ATTEMPTS = 40;
export const MAX_TIME_LIMIT_MS = 60_000;
export const DEFAULT_TIME_LIMIT_MS = 20_000;
