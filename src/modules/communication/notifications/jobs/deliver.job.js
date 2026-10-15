import { defineJob } from "../../../../common/jobs/queue.js";
import { DELIVER_JOB, notificationService } from "../services/notification.service.js";

/* One email or SMS. Retried with backoff; the delivery status records the outcome. */
export const deliverJob = defineJob(DELIVER_JOB, notificationService.deliver, { attempts: 4, backoffMs: 30_000 });
