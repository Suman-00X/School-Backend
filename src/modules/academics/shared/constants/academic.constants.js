/* Enum values used by the academics module's tables and validators (single source) */
export const SUBJECT_TYPES = ["THEORY", "PRACTICAL"];
export const ADMISSION_TYPES = ["NEW", "PROMOTED", "REPEAT"];
export const ENROLLMENT_STATUSES = ["ACTIVE", "LEFT"];
/* How a section's roll numbers are ordered when they are assigned (enrollment policy) */
export const ROLL_NUMBER_ORDERS = ["ALPHABETICAL", "RESULT_RANK"];
export const EXAM_TYPES = ["INTERNAL", "FINAL"];

/* The grade levels a school can have, in order. A class is one of them: its name and
   order come from the level. `label` stands for the class in generated codes
   (STU26-1-000001, MA01-1A, roll number LKGA-001). */
export const CLASS_LEVELS = [
  { level: "NURSERY", className: "Nursery", classOrder: 1, label: "NUR" },
  { level: "LKG", className: "LKG", classOrder: 2, label: "LKG" },
  { level: "UKG", className: "UKG", classOrder: 3, label: "UKG" },
  ...Array.from({ length: 12 }, (_, i) => ({
    level: `GRADE_${i + 1}`,
    className: `Class ${i + 1}`,
    classOrder: i + 4,
    label: String(i + 1)
  }))
];
export const CLASS_LEVEL_KEYS = CLASS_LEVELS.map(l => l.level);

/* Class subject codes (MA221): the subject's code, then the class's stage and its position
   in the stage (each 1-9, set per school under Policy › Subject codes), then 1 for a required
   subject or 0 for an optional one. A new class takes its level's default place when free. */
export const CODE_SLOT_MAX = 9;
export const DEFAULT_CODE_SLOTS = {
  NURSERY: [1, 1],
  LKG: [1, 2],
  UKG: [1, 3],
  GRADE_1: [2, 1],
  GRADE_2: [2, 2],
  GRADE_3: [2, 3],
  GRADE_4: [3, 1],
  GRADE_5: [3, 2],
  GRADE_6: [3, 3],
  GRADE_7: [3, 4],
  GRADE_8: [4, 1],
  GRADE_9: [4, 2],
  GRADE_10: [4, 3],
  GRADE_11: [5, 1],
  GRADE_12: [5, 2]
};

export const CALENDAR_EVENT_TYPES = ["HOLIDAY", "VACATION", "EXAM", "EVENT", "MEETING", "OTHER"];
/* Event types that close the school for the day */
export const NON_WORKING_EVENT_TYPES = ["HOLIDAY", "VACATION"];
/* What kind of holiday, vacation, event or meeting it is (calendar_events.category).
   An exam has none: it names its exam instead. Other has none. */
export const CALENDAR_EVENT_CATEGORIES = {
  HOLIDAY: ["NATIONAL", "FESTIVAL", "REGIONAL", "SCHOOL"],
  VACATION: ["SUMMER", "WINTER", "FESTIVAL_BREAK", "TERM_BREAK"],
  EVENT: ["SPORTS_DAY", "ANNUAL_DAY", "CULTURAL", "CELEBRATION", "COMPETITION", "FIELD_TRIP", "WORKSHOP"],
  MEETING: ["PARENT_TEACHER", "PARENT_ORIENTATION", "STAFF", "MANAGEMENT"]
};
/* Meetings for staff only: they have no classes */
export const STAFF_MEETING_CATEGORIES = ["STAFF", "MANAGEMENT"];
/* A holiday is a few days at most; a longer break is a vacation */
export const MAX_HOLIDAY_DAYS = 7;

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "HALF_DAY", "EXCUSED"];
/* How much of a day each status counts as attended */
export const ATTENDANCE_WEIGHT = { PRESENT: 1, LATE: 1, HALF_DAY: 0.5, EXCUSED: 0, ABSENT: 0 };

/* How often a class takes attendance: once a day, forenoon + afternoon, or every period */
export const ATTENDANCE_MODES = ["DAILY", "TWO_SESSIONS", "PERIOD_WISE"];
/* After the academic year changes, teachers keep last year's sections this many months
   (late marks, report-card fixes, attendance corrections); then ADMIN and PRINCIPAL only */
export const PREVIOUS_YEAR_GRACE_MONTHS = 1;
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

/* Teachers' own marked work in a scheme bucket (see assessments). Labels only: every kind counts the same. */
export const ASSESSMENT_TYPES = ["TEST", "ASSIGNMENT", "PROJECT", "HOMEWORK", "OTHER"];
/* A student's entry for one item: ABSENT counts 0%, EXEMPT and MEDICAL drop the item for the student */
export const ASSESSMENT_MARK_STATUSES = ["MARKED", "ABSENT", "EXEMPT", "MEDICAL"];

/* How an absent teacher's period is covered on a date (substitution planning):
   SUBSTITUTE  another teacher takes the class (their own subject or the timetabled one)
   ACTIVITY    an extra or co-curricular activity, with a teacher in charge or none
   LEISURE     nobody covers it: a leisure (free) period, no register due
   NOT_NEEDED  the timetabled teacher takes it after all (a half day that misses it) */
export const SUBSTITUTION_KINDS = ["SUBSTITUTE", "ACTIVITY", "LEISURE", "NOT_NEEDED"];
/* Staff attendance marks that keep a teacher from their periods (HALF_DAY: the periods
   before check-in or after check-out; all of them when neither is recorded) */
export const AWAY_STATUSES = ["ABSENT", "LEAVE", "HALF_DAY"];

/* An admit card is ISSUED to an eligible student; generating again WITHDRAWS it from one no longer eligible */
export const ADMIT_CARD_STATUSES = ["ISSUED", "WITHDRAWN"];
