import { defineJob, defineSchedule } from "../../../../common/jobs/queue.js";
import { settlementService } from "../services/settlement.service.js";

/* Import the last week's gateway payouts into the books, every school (idempotent) */
export const settlementImportJob = defineJob(
  "finance.importSettlements",
  ({ tenantId }) => settlementService.importRecent({ tenantId, role: "SYSTEM" }),
  { attempts: 3 }
);

defineSchedule("finance.importSettlements.daily", {
  job: settlementImportJob,
  cron: "0 6 * * *",
  everyMs: 24 * 60 * 60 * 1000
});
