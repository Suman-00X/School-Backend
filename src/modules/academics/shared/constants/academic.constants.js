/* Enum values used by the academics module's tables and validators (single source) */
export const SUBJECT_TYPES = ["THEORY", "PRACTICAL"];
export const ADMISSION_TYPES = ["NEW", "PROMOTED", "REPEAT"];
export const ENROLLMENT_STATUSES = ["ACTIVE", "LEFT"];
export const EXAM_TYPES = ["INTERNAL", "FINAL"];

export const CALENDAR_EVENT_TYPES = ["HOLIDAY", "VACATION", "EXAM", "EVENT", "MEETING", "OTHER"];
/* Event types that close the school for the day */
export const NON_WORKING_EVENT_TYPES = ["HOLIDAY", "VACATION"];

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "HALF_DAY", "EXCUSED"];
/* How much of a day each status counts as attended */
export const ATTENDANCE_WEIGHT = { PRESENT: 1, LATE: 1, HALF_DAY: 0.5, EXCUSED: 0, ABSENT: 0 };

/* ISO weekdays: 1 = Monday … 7 = Sunday */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/* Request header naming the academic year a year-scoped request acts on */
export const ACADEMIC_YEAR_HEADER = "x-academic-year-id";
