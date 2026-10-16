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

/* How often a class takes attendance: once a day, forenoon + afternoon, or every period */
export const ATTENDANCE_MODES = ["DAILY", "TWO_SESSIONS", "PERIOD_WISE"];
/* What one register covers: the whole day, a half day, or one period */
export const ATTENDANCE_KINDS = ["DAY", "FORENOON", "AFTERNOON", "PERIOD"];
/* The registers each mode takes */
export const ATTENDANCE_MODE_KINDS = {
  DAILY: ["DAY"],
  TWO_SESSIONS: ["FORENOON", "AFTERNOON"],
  PERIOD_WISE: ["PERIOD"]
};

/* ISO weekdays: 1 = Monday … 7 = Sunday */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];
export const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/* Request header naming the academic year a year-scoped request acts on */
export const ACADEMIC_YEAR_HEADER = "x-academic-year-id";

/* Exam papers: marked out of max marks, or graded only (Art, Conduct) */
export const PAPER_GRADING_TYPES = ["MARKS", "GRADE"];
/* Parts of one subject's paper, each with its own max and pass marks */
export const PAPER_COMPONENTS = ["THEORY", "PRACTICAL", "INTERNAL", "PROJECT", "ORAL"];
/* Why a student missed a paper (marks.absence_reason) */
export const ABSENCE_REASONS = ["ABSENT", "MEDICAL", "EXEMPT"];

/* Result policies (see result-policies) */
export const GRADING_MODES = ["MARKS", "GRADES", "GPA", "PASS_FAIL"];
export const ABSENCE_TREATMENTS = ["ZERO_FAIL", "EXCLUDE"];
export const RANKING_METHODS = ["COMPETITION", "DENSE", "NONE"];
export const RANK_SCOPES = ["SECTION", "CLASS", "BOTH"];
export const ROUNDING_MODES = ["HALF_UP", "HALF_EVEN", "UP", "DOWN"];
export const SUBJECT_CATEGORIES = ["SCHOLASTIC", "CO_SCHOLASTIC"];
export const RESULT_STATUSES = ["PASS", "FAIL", "COMPARTMENT", "INCOMPLETE"];

/* What a result publication (and its report snapshots) is for */
export const PUBLICATION_KINDS = ["EXAM", "SCHEME"];
