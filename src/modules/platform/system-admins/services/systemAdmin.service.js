import { hashPassword, needsRehash, verifyPassword } from "../../../../common/crypto/password.js";
import { conflict, unauthorized } from "../../../../common/http/errors.js";
import { logger } from "../../../../common/logging/logger.js";
import { BAD_CREDENTIALS } from "../../shared/constants/platform.constants.js";
import { systemAdminRepository } from "../repositories/systemAdmin.repository.js";

const summary = admin => ({ id: admin.id, name: admin.name, email: admin.email });

export const systemAdminService = {
  /* One hash check whether or not the admin exists, so timing reveals nothing -> the admin */
  login: async ({ email, password }, client = {}) => {
    const admin = await systemAdminRepository.findCredentials(email);
    const valid = await verifyPassword(password, admin?.passwordHash);
    if (!admin || !valid || admin.status !== "ACTIVE") {
      logger.warn({ systemAdminId: admin?.id ?? null, ip: client.ipAddress }, "System admin sign-in refused");
      throw unauthorized(BAD_CREDENTIALS);
    }
    await systemAdminRepository.update(admin.id, {
      lastLoginAt: new Date(),
      ...(needsRehash(admin.passwordHash) && { passwordHash: await hashPassword(password) })
    });
    logger.info({ systemAdminId: admin.id, ip: client.ipAddress }, "System admin signed in");
    return summary(admin);
  },

  /* Signing out ends every session of the admin (any browser holding a copy of the cookie) */
  logout: async admin => {
    await systemAdminRepository.update(admin.id, { sessionsValidAfter: new Date() });
    logger.info({ systemAdminId: admin.id }, "System admin signed out");
  },

  /* For the CLI (scripts/create-system-admin.js) */
  create: async ({ name, email, password }) => {
    if (await systemAdminRepository.findCredentials(email)) {
      throw conflict(`A system admin with email ${email} already exists`);
    }
    return systemAdminRepository.create({ name, email, passwordHash: await hashPassword(password) });
  },

  /* A new password also ends the admin's sessions, and re-enables a disabled admin */
  setPassword: async (email, password) => {
    const admin = await systemAdminRepository.findCredentials(email);
    if (!admin) return null;
    await systemAdminRepository.update(admin.id, {
      passwordHash: await hashPassword(password),
      status: "ACTIVE",
      sessionsValidAfter: new Date()
    });
    return summary(admin);
  }
};
