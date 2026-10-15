import { defineJob, defineSchedule } from "../../../../common/jobs/queue.js";
import { sendOverdueReminders } from "../services/overdueReminder.service.js";

/* Remind borrowers of overdue books once a day (idempotent per loan per day) */
export const overdueReminderJob = defineJob("library.overdueReminders", sendOverdueReminders, { attempts: 2 });

defineSchedule("library.overdueReminders.daily", {
  job: overdueReminderJob,
  cron: "0 4 * * *",
  everyMs: 24 * 60 * 60 * 1000
});
