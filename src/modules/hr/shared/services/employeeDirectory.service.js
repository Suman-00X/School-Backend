import { ROLES } from "../../../../common/auth/roles.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { accountService } from "../../../users/accounts/index.js";
import { staffService } from "../../../users/staff/index.js";
import { teacherService } from "../../../users/teachers/index.js";
import { EMPLOYEE_ROLES } from "../constants/hr.constants.js";

/* Employees are active user accounts with an employee role (ADMIN, PRINCIPAL,
   ACCOUNTANT, STAFF, TEACHER). Their employee code and designation come from
   the teacher or staff profile, when there is one. */

const PAGE_SIZE = 100;

const isEmployee = user => Boolean(user) && EMPLOYEE_ROLES.includes(user.role) && user.status === "ACTIVE";

export const fullName = user => [user?.firstName, user?.lastName].filter(Boolean).join(" ");

const toEmployee = (user, profile) => ({
  userId: user.id,
  name: fullName(user),
  email: user.email,
  role: user.role,
  employeeCode: profile?.employeeCode ?? null,
  designation: profile?.designation ?? (user.role === ROLES.TEACHER ? "Teacher" : null),
  department: profile?.department ?? null
});

const byName = (a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId);

/* Every row of a paginated list */
const allPages = async fetchPage => {
  const rows = [];
  for (let page = 1; ; page++) {
    const result = await fetchPage(page);
    rows.push(...result.rows);
    if (page >= result.meta.totalPages) return rows;
  }
};

const profilesByUser = async ctx => {
  const [teachers, staff] = await Promise.all([
    allPages(page => teacherService.list(ctx, { page, limit: PAGE_SIZE })),
    allPages(page => staffService.list(ctx, { page, limit: PAGE_SIZE }))
  ]);
  return new Map([...teachers, ...staff].map(profile => [profile.userId, profile]));
};

export const employeeDirectory = {
  /* Every active employee, by name */
  list: async ctx => {
    const [accounts, profiles] = await Promise.all([
      accountService.findByRoles(ctx, EMPLOYEE_ROLES),
      profilesByUser(ctx)
    ]);
    return accounts
      .filter(isEmployee)
      .map(user => toEmployee(user, profiles.get(user.id)))
      .sort(byName);
  },

  /* One active employee, or null */
  find: async (ctx, userId) => {
    const [user] = await accountService.findManyByIds(ctx, [userId]);
    if (!isEmployee(user)) return null;
    const profile =
      user.role === ROLES.TEACHER
        ? await teacherService.findByUserId(ctx, userId)
        : await staffService.findByUserId(ctx, userId);
    return toEmployee(user, profile);
  },

  /* 422 naming every id that is not an active employee */
  assertEmployees: async (ctx, userIds) => {
    const unique = [...new Set(userIds)];
    const accounts = await accountService.findManyByIds(ctx, unique);
    const employees = new Set(accounts.filter(isEmployee).map(user => user.id));
    const strangers = unique.filter(id => !employees.has(id));
    if (strangers.length) {
      throw unprocessable(`${strangers.length} user(s) are not active employees: ${strangers.join(", ")}`);
    }
  }
};
