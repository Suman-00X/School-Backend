import { defineJob, defineSchedule } from "../../../../common/jobs/queue.js";
import { lateFeeService } from "../services/lateFee.service.js";

/* Recompute late fees on overdue invoices once a day from each structure's rule (idempotent) */
export const lateFeeJob = defineJob("finance.applyLateFees", () => lateFeeService.applyLateFees(), { attempts: 3 });

defineSchedule("finance.applyLateFees.daily", { job: lateFeeJob, cron: "30 0 * * *", everyMs: 24 * 60 * 60 * 1000 });
