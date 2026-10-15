import { defineJob, enqueue } from "../jobs/queue.js";

/* Domain events: modules publish facts, other modules react.

     subscribe("academics.attendance.recorded", "communication.absenceAlerts", async payload => { ... });
     await publish("academics.attendance.recorded", { tenantId, sessionId, ... });

   Each subscriber runs as its own background job (retried independently), so a
   slow or failing subscriber never affects the request or other subscribers.
   Payloads must be plain JSON and should carry ids, not whole records. */

const subscribers = new Map();

export const subscribe = (eventName, subscriberId, handler, options) => {
  const jobName = `event:${eventName}:${subscriberId}`;
  defineJob(jobName, payload => handler(payload), options);
  if (!subscribers.has(eventName)) subscribers.set(eventName, []);
  subscribers.get(eventName).push(jobName);
};

export const publish = async (eventName, payload) => {
  for (const jobName of subscribers.get(eventName) ?? []) {
    await enqueue(jobName, { ...payload, event: eventName, publishedAt: new Date().toISOString() });
  }
};

export const subscribersOf = eventName => [...(subscribers.get(eventName) ?? [])];
