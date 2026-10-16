import { defineJob, defineSchedule } from "../../../../common/jobs/queue.js";
import { runDailyCirculation } from "../services/dailyCirculation.service.js";

/* Once a day: accrue late fines, due-soon and overdue reminders (each sent once) */
export const dailyCirculationJob = defineJob("library.dailyCirculation", runDailyCirculation, { attempts: 2 });

defineSchedule("library.dailyCirculation.daily", {
  job: dailyCirculationJob,
  cron: "0 4 * * *",
  everyMs: 24 * 60 * 60 * 1000
});
