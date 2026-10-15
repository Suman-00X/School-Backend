import { ROLES } from "../../../../common/auth/roles.js";

/* Enum values used by the hostel module's tables and validators (single source) */
export const RESIDENT_GENDERS = ["BOYS", "GIRLS", "COED"];
export const ROOM_STATUSES = ["AVAILABLE", "MAINTENANCE", "CLOSED"];
export const ALLOCATION_STATUSES = ["ACTIVE", "VACATED"];

/* The account gender a single-gender hostel admits (users.gender) */
export const GENDER_FOR_RESIDENTS = { BOYS: "MALE", GIRLS: "FEMALE" };

/* Accounts that can be a hostel's warden */
export const WARDEN_ROLES = [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.STAFF, ROLES.TEACHER];

export const MAX_ROOM_CAPACITY = 50;
