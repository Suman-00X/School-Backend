import { defineJob, defineSchedule } from "../../../../common/jobs/queue.js";
import { holdService } from "../services/hold.service.js";

/* Expire uncollected and unwanted holds once a day; kept copies move down the queue */
export const holdExpiryJob = defineJob("library.holdExpiry", () => holdService.expireHolds(), { attempts: 2 });

defineSchedule("library.holdExpiry.daily", {
  job: holdExpiryJob,
  cron: "30 0 * * *",
  everyMs: 24 * 60 * 60 * 1000
});
