import jwt from "jsonwebtoken";
import env from "../../../../common/config/env.config.js";
import { OPERATOR_SESSION_HOURS, OPERATOR_TOKEN_TYPE } from "../constants/platform.constants.js";

/* An operator's token carries typ "platform": school endpoints only take typ "access",
   so it opens nothing in a school, and a school token opens nothing here */
export const signOperatorToken = operator =>
  jwt.sign({ operatorId: operator.id, typ: OPERATOR_TOKEN_TYPE }, env.jwtSecret, {
    algorithm: "HS256",
    expiresIn: OPERATOR_SESSION_HOURS * 3600
  });

/* -> payload, or null when the token is not a valid operator token */
export const verifyOperatorToken = token => {
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
    return payload.typ === OPERATOR_TOKEN_TYPE && payload.operatorId ? payload : null;
  } catch (error) {
    if (error.name === "TokenExpiredError") return { expired: true };
    return null;
  }
};
