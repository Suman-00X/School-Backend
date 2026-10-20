import { hashPassword, needsRehash, verifyPassword } from "../../../../common/crypto/password.js";
import { conflict, unauthorized } from "../../../../common/http/errors.js";
import { logger } from "../../../../common/logging/logger.js";
import { BAD_OPERATOR_CREDENTIALS, OPERATOR_SESSION_HOURS } from "../../shared/constants/platform.constants.js";
import { signOperatorToken } from "../../shared/utils/operatorToken.util.js";
import { operatorRepository } from "../repositories/operator.repository.js";

const summary = operator => ({ id: operator.id, name: operator.name, email: operator.email });

export const operatorService = {
  /* One hash check whether or not the operator exists, so timing reveals nothing */
  login: async ({ email, password }, client = {}) => {
    const operator = await operatorRepository.findCredentials(email);
    const valid = await verifyPassword(password, operator?.passwordHash);
    if (!operator || !valid || operator.status !== "ACTIVE") {
      logger.warn({ operatorId: operator?.id ?? null, ip: client.ipAddress }, "Operator sign-in refused");
      throw unauthorized(BAD_OPERATOR_CREDENTIALS);
    }
    await operatorRepository.update(operator.id, {
      lastLoginAt: new Date(),
      ...(needsRehash(operator.passwordHash) && { passwordHash: await hashPassword(password) })
    });
    logger.info({ operatorId: operator.id, ip: client.ipAddress }, "Operator signed in");
    return {
      tokenType: "Bearer",
      accessToken: signOperatorToken(operator),
      expiresIn: OPERATOR_SESSION_HOURS * 3600,
      operator: summary(operator)
    };
  },

  me: operator => operator,

  /* For the operator CLI (scripts/create-operator.js) */
  create: async ({ name, email, password }) => {
    if (await operatorRepository.findCredentials(email))
      throw conflict(`An operator with email ${email} already exists`);
    return operatorRepository.create({ name, email, passwordHash: await hashPassword(password) });
  },

  setPassword: async (email, password) => {
    const operator = await operatorRepository.findCredentials(email);
    if (!operator) return null;
    await operatorRepository.update(operator.id, { passwordHash: await hashPassword(password), status: "ACTIVE" });
    return summary(operator);
  }
};
