import { unauthorized } from "../../../../common/http/errors.js";
import { operatorRepository } from "../../operators/repositories/operator.repository.js";
import { verifyOperatorToken } from "../utils/operatorToken.util.js";

/* Every onboarding-portal endpoint after sign-in: a valid operator token of an active
   operator. Sets req.operator = { id, name, email }. */
export const authenticateOperator = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw unauthorized("Missing or malformed Authorization header. Expected: Bearer <token>");
  }
  const payload = verifyOperatorToken(header.slice(7));
  if (payload?.expired) throw unauthorized("Your session has expired. Please sign in again.");
  if (!payload) throw unauthorized("Invalid token");

  const operator = await operatorRepository.findById(payload.operatorId);
  if (!operator || operator.status !== "ACTIVE") throw unauthorized("Your session has ended. Please sign in again.");
  req.operator = { id: operator.id, name: operator.name, email: operator.email };
  next();
};
