/* Enum values used by the users module's tables and validators (single source) */
export const USER_STATUSES = ["ACTIVE", "INACTIVE", "BLOCKED"];
export const GENDERS = ["MALE", "FEMALE", "OTHER"];
export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME"];
export const PARENT_RELATIONS = ["FATHER", "MOTHER", "GUARDIAN"];

/* Columns embedded when a profile includes its user account */
export const USER_SUMMARY_COLUMNS = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true
};

export const toUserSummary = user =>
  Object.fromEntries(Object.keys(USER_SUMMARY_COLUMNS).map(key => [key, user[key] ?? null]));
