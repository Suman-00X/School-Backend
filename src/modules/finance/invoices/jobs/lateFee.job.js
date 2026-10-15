import { defineJob, defineSchedule } from "../../../../common/jobs/queue.js";
import { invoiceService } from "../services/invoice.service.js";

/* Recompute late fees on overdue invoices once a day (idempotent) */
export const lateFeeJob = defineJob("finance.applyLateFees", () => invoiceService.applyLateFees(), { attempts: 3 });

defineSchedule("finance.applyLateFees.daily", { job: lateFeeJob, cron: "30 0 * * *", everyMs: 24 * 60 * 60 * 1000 });
