import env from "../config/env.config.js";
import { logger } from "../logging/logger.js";
import { outbox } from "./outbox.js";

/* SMS delivery. `http` posts JSON { to, text, senderId } to SMS_HTTP_URL with
   SMS_API_KEY as a Bearer token: put a small adapter in front of the chosen
   provider (MSG91, Twilio, Gupshup…). `console` logs, `memory` is for tests. */
const send = async ({ to, text }) => {
  switch (env.sms.driver) {
    case "http": {
      if (!env.sms.httpUrl) throw new Error("SMS_DRIVER=http requires SMS_HTTP_URL");
      const response = await fetch(env.sms.httpUrl, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${env.sms.apiKey ?? ""}` },
        body: JSON.stringify({ to, text, senderId: env.sms.senderId })
      });
      if (!response.ok) throw new Error(`SMS provider responded ${response.status}`);
      return;
    }
    case "memory":
      outbox.sms.push({ to, text });
      return;
    default:
      logger.info({ to, length: text.length }, "SMS (console driver)");
  }
};

export const sms = { send };
