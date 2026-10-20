import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { logger } from "../../../../common/logging/logger.js";
import { forgetTenantRecord, refreshTenantRecord, runInTenant } from "../../../../common/tenancy/context.js";
import { provisionTenant } from "../../../../common/tenancy/provisioning.js";
import { getTenant } from "../../../../common/tenancy/tenant.service.js";
import { credentialService } from "../../../auth/credentials/index.js";
import { accountService } from "../../../users/accounts/index.js";
import { studentService } from "../../../users/students/index.js";
import { SCHOOL_MODULES, normaliseModules } from "../../shared/constants/schoolModules.constants.js";
import { schoolRepository } from "../repositories/school.repository.js";

/* The platform acts as the school's administrator while it sets the school up (or reads it) */
const asSchool = tenantId => ({ tenantId, role: "ADMIN", userId: null });

const PROFILE_FIELDS = ["address", "contactEmail", "contactPhone", "description", "timezone", "currency", "country"];

/* Every module with whether it is on: core modules always; null in the registry: all of them */
const moduleStates = enabled =>
  SCHOOL_MODULES.map(({ key, label, core = false }) => ({
    key,
    label,
    core,
    enabled: core || !Array.isArray(enabled) || enabled.includes(key)
  }));

const listView = row => ({
  id: row.id,
  code: row.code,
  name: row.name,
  status: row.status,
  /* The switched-on modules (core ones included) */
  modules: moduleStates(row.enabledModules)
    .filter(module => module.enabled)
    .map(module => module.key),
  /* Declared at onboarding; null for schools onboarded before it was asked */
  studentCount: row.studentCount ?? null,
  createdAt: row.createdAt
});

const adminView = user => ({
  id: user.id,
  firstName: user.firstName,
  middleName: user.middleName ?? null,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone ?? null,
  status: user.status,
  /* Invited but has not set a password yet */
  invitationPending: !user.passwordChangedAt,
  lastLoginAt: user.lastLoginAt ?? null
});

/* What the school's own databases say: its profile, administrators and the students on its
   roll now (a suspended school's databases are closed to everyone, so only the registry is
   shown) */
const schoolDetails = async row => {
  if (row.status !== "ACTIVE") return { profile: null, admins: [], enrolledStudents: null };
  return runInTenant(row.id, async () => {
    const ctx = asSchool(row.id);
    const [profile, admins, enrolledStudents] = await Promise.all([
      getTenant(row.id),
      accountService.findByRoles(ctx, ["ADMIN"]),
      studentService.countActive(ctx)
    ]);
    return {
      profile: profile && Object.fromEntries(PROFILE_FIELDS.map(field => [field, profile[field] ?? null])),
      admins: admins.map(adminView),
      enrolledStudents
    };
  });
};

const detailView = async row => ({
  ...listView(row),
  moduleStates: moduleStates(row.enabledModules),
  ...(await schoolDetails(row))
});

const findOrFail = async schoolId => {
  const row = await schoolRepository.findById(schoolId);
  if (!row) throw notFound("School");
  return row;
};

export const schoolService = {
  list: async filters => {
    const { rows, meta } = await schoolRepository.list(filters);
    return { rows: rows.map(listView), meta };
  },

  codeAvailable: async code => ({ code, available: !(await schoolRepository.codeTaken(code)) }),

  get: async schoolId => detailView(await findOrFail(schoolId)),

  /* A new school: its own databases with its profile, the chosen modules, and its first
     administrator, who is emailed a link to set a password (also returned, to pass on) */
  onboard: async (systemAdmin, { school, admin, modules }) => {
    if (await schoolRepository.codeTaken(school.code)) {
      throw conflict(`A school with code ${school.code} already exists`);
    }
    const enabledModules = normaliseModules(modules);
    const { record } = await provisionTenant({
      code: school.code,
      name: school.name,
      timezone: school.timezone,
      currency: school.currency,
      country: school.country,
      details: {
        address: school.address,
        contactEmail: school.contactEmail,
        contactPhone: school.contactPhone,
        description: school.description
      },
      enabledModules
    });
    await schoolRepository.update(record.id, { studentCount: school.studentCount });

    const invitation = await runInTenant(record.id, async () => {
      const ctx = asSchool(record.id);
      const account = await accountService.createAccount(
        ctx,
        {
          firstName: admin.firstName,
          middleName: admin.middleName,
          lastName: admin.lastName,
          email: admin.email,
          phone: admin.phone
        },
        "ADMIN"
      );
      return { userId: account.id, ...(await credentialService.inviteWithLink(ctx, account.id)) };
    });

    logger.info({ systemAdminId: systemAdmin.id, tenant: record.code, modules: enabledModules }, "School onboarded");
    return { school: await detailView(await findOrFail(record.id)), invitation };
  },

  /* The number of students the school is charged for */
  update: async (systemAdmin, schoolId, { studentCount }) => {
    await findOrFail(schoolId);
    const row = await schoolRepository.update(schoolId, { studentCount });
    logger.info({ systemAdminId: systemAdmin.id, tenantId: schoolId, studentCount }, "School student count changed");
    return detailView(row);
  },

  /* Switch modules on or off. Records of a module switched off are kept. */
  setModules: async (systemAdmin, schoolId, { modules }) => {
    await findOrFail(schoolId);
    const enabledModules = normaliseModules(modules);
    const row = await schoolRepository.update(schoolId, { enabledModules });
    await refreshTenantRecord(schoolId);
    logger.info(
      { systemAdminId: systemAdmin.id, tenantId: schoolId, modules: enabledModules },
      "School modules changed"
    );
    return detailView(row);
  },

  /* Suspend (nobody in the school can sign in or use the API) or reactivate */
  setStatus: async (systemAdmin, schoolId, { status }) => {
    const current = await findOrFail(schoolId);
    if (current.status === status) return detailView(current);
    const row = await schoolRepository.update(schoolId, { status });
    if (status === "SUSPENDED") await forgetTenantRecord(schoolId);
    else await refreshTenantRecord(schoolId);
    logger.info({ systemAdminId: systemAdmin.id, tenantId: schoolId, status }, "School status changed");
    return detailView(row);
  },

  /* A new set-password link for an administrator who has not set one yet */
  inviteAdmin: async (systemAdmin, schoolId, userId) => {
    const row = await findOrFail(schoolId);
    if (row.status !== "ACTIVE") throw unprocessable("The school is suspended. Reactivate it first.");
    return runInTenant(schoolId, async () => {
      const ctx = asSchool(schoolId);
      const [user] = await accountService.findManyByIds(ctx, [userId]);
      if (!user || user.role !== "ADMIN") throw notFound("Administrator");
      const invitation = await credentialService.inviteWithLink(ctx, user.id);
      logger.info({ systemAdminId: systemAdmin.id, tenantId: schoolId, userId }, "Administrator invited again");
      return { userId, ...invitation };
    });
  }
};
