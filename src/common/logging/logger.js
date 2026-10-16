import pino from "pino";
import env from "../config/env.config.js";

/* Structured JSON logs (pretty in development). Never log secrets:
   authorization headers and passwords are redacted. */
export const logger = pino({
  level: env.logLevel,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.currentPassword",
      "*.newPassword",
      "*.passwordHash",
      "*.token",
      "*.refreshToken",
      "*.accessToken"
    ],
    censor: "[redacted]"
  },
  ...(env.nodeEnv === "development" && {
    transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
  })
});
