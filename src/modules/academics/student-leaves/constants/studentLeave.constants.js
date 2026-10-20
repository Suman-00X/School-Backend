/* A parent's request for a child's leave from school: a run of days, or half of one day.
   Statuses and sessions are database enums; reasons are checked here only, so the list
   can grow without a migration. */
export const STUDENT_LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];

/* FULL_DAY covers every register of the days; a half day covers that session only */
export const STUDENT_LEAVE_SESSIONS = ["FULL_DAY", "FORENOON", "AFTERNOON"];

export const STUDENT_LEAVE_SESSION_LABELS = { FULL_DAY: "Full day", FORENOON: "Forenoon", AFTERNOON: "Afternoon" };

export const STUDENT_LEAVE_REASONS = [
  { key: "ILLNESS", label: "Illness" },
  { key: "MEDICAL", label: "Doctor or hospital visit" },
  { key: "FAMILY", label: "Family function or emergency" },
  { key: "TRAVEL", label: "Travel / out of station" },
  { key: "RELIGIOUS", label: "Festival or religious occasion" },
  { key: "EVENT", label: "Competition or event outside school" },
  { key: "OTHER", label: "Other" }
];

export const STUDENT_LEAVE_REASON_KEYS = STUDENT_LEAVE_REASONS.map(r => r.key);

/* Requests that hold their days: a new one may not overlap them */
export const HOLDING_STATUSES = ["PENDING", "APPROVED"];

/* At most this many calendar days in one request (a typo in the year should not ask for 400) */
export const MAX_LEAVE_SPAN_DAYS = 60;

/* Registers a leave excuses: a full day every kind; a half day its own session */
export const EXCUSED_KINDS = {
  FULL_DAY: ["DAY", "FORENOON", "AFTERNOON", "PERIOD"],
  FORENOON: ["FORENOON"],
  AFTERNOON: ["AFTERNOON"]
};
