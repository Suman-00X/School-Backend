/* Every role a user account can have */
export const ROLES = Object.freeze({
  ADMIN: "ADMIN",
  PRINCIPAL: "PRINCIPAL",
  ACCOUNTANT: "ACCOUNTANT",
  STAFF: "STAFF",
  TEACHER: "TEACHER",
  STUDENT: "STUDENT",
  PARENT: "PARENT"
});

export const ALL_ROLES = Object.values(ROLES);

/* Convenience groups for permission lists */
export const ROLE_GROUPS = Object.freeze({
  /* Privileged, non-teaching accounts (users/staff) */
  STAFF_ROLES: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT, ROLES.STAFF],
  MANAGEMENT: [ROLES.ADMIN, ROLES.PRINCIPAL],
  OFFICE: [ROLES.ADMIN, ROLES.STAFF],
  ALL_EMPLOYEES: [ROLES.ADMIN, ROLES.PRINCIPAL, ROLES.ACCOUNTANT, ROLES.STAFF, ROLES.TEACHER]
});
