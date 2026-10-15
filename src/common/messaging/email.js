import env from "../config/env.config.js";
import { logger } from "../logging/logger.js";
import { outbox } from "./outbox.js";

/* Email delivery: SMTP (any provider: SES, SendGrid, Postmark, Gmail…) via
   SMTP_URL, or `console` (logs) / `memory` (tests) */
let transport = null;

const getTransport = async () => {
  if (transport) return transport;
  if (env.email.driver === "smtp") {
    if (!env.email.smtpUrl) throw new Error("EMAIL_DRIVER=smtp requires SMTP_URL");
    const { default: nodemailer } = await import("nodemailer");
    const smtp = nodemailer.createTransport(env.email.smtpUrl);
    transport = message => smtp.sendMail({ from: env.email.from, ...message });
  } else if (env.email.driver === "memory") {
    transport = async message => outbox.email.push({ from: env.email.from, ...message });
  } else {
    transport = async message => logger.info({ to: message.to, subject: message.subject }, "Email (console driver)");
  }
  return transport;
};

export const email = {
  /* { to, subject, text, html? } */
  send: async message => (await getTransport())(message)
};
