import { ROLES } from "../../../../common/auth/roles.js";

/* Enum values used by the hostel module's tables and validators (single source) */
export const RESIDENT_GENDERS = ["BOYS", "GIRLS", "COED"];
export const ROOM_STATUSES = ["AVAILABLE", "MAINTENANCE", "CLOSED"];

/* Bed allocations and resource assignments are date ranges [fromDate, toDate] (toDate null = open-ended).
   ACTIVE rows hold their bed or resource for that range; CANCELLED rows hold nothing and stay as history. */
export const BOOKING_STATUSES = ["ACTIVE", "CANCELLED"];

/* Derived from the dates and today (never stored) */
export const BOOKING_PHASES = ["UPCOMING", "CURRENT", "ENDED", "CANCELLED"];

/* How an allocation came about */
export const ALLOCATION_SOURCES = ["DIRECT", "TRANSFER", "ROLLOVER"];

/* Why an allocation or assignment ended (or was cancelled) early by an action */
/* (RELEASED: a resource handed back; BED_ENDED: a resource that ended with its bed) */
export const END_REASONS = ["VACATED", "RELEASED", "TRANSFERRED", "LEFT_SCHOOL", "CANCELLED", "BED_ENDED"];

/* Assignable things in a room or a hostel */
export const RESOURCE_TYPES = ["LOCKER", "CUPBOARD", "STUDY_TABLE", "MESS_PLAN", "LAUNDRY_PLAN", "CUSTOM"];
export const RESOURCE_STATUSES = ["AVAILABLE", "OUT_OF_SERVICE"];

/* Plans are hostel-wide, and a student is on at most one plan of each kind at a time */
export const PLAN_TYPES = ["MESS_PLAN", "LAUNDRY_PLAN"];

/* Capacity when none is given: one person per locker, cupboard or table. Plans and custom types must say. */
export const DEFAULT_RESOURCE_CAPACITY = { LOCKER: 1, CUPBOARD: 1, STUDY_TABLE: 1 };
export const MAX_RESOURCE_CAPACITY = 10_000;

/* Readable resource types: "Mess plan" */
export const RESOURCE_TYPE_LABELS = {
  LOCKER: "Locker",
  CUPBOARD: "Cupboard",
  STUDY_TABLE: "Study table",
  MESS_PLAN: "Mess plan",
  LAUNDRY_PLAN: "Laundry plan",
  CUSTOM: "Resource"
};

/* Exclusion constraints (hand-written SQL in the migration, btree_gist) */
export const OVERLAP_CONSTRAINTS = {
  BED: "hostel_allocations_bed_no_overlap",
  STUDENT: "hostel_allocations_student_no_overlap",
  RESOURCE_STUDENT: "hostel_resource_assignments_student_no_overlap",
  PLAN: "hostel_resource_assignments_plan_no_overlap"
};

/* The account gender a single-gender hostel admits (users.gender) */
export const GENDER_FOR_RESIDENTS = { BOYS: "MALE", GIRLS: "FEMALE" };

/* Accounts that can be a hostel's warden */
/* A warden is often a resident teacher; being warden gives no module access by itself */
export const WARDEN_ROLES = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.HOSTEL_MANAGER, ROLES.STAFF, ROLES.TEACHER];

export const MAX_ROOM_CAPACITY = 50;

/* Residents a single roll-over may continue */
export const MAX_ROLLOVER = 2000;
