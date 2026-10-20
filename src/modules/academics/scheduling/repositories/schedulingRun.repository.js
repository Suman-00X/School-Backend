import { desc } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { schedulingRuns } from "../models/schedulingRun.schema.js";

export const schedulingRunRepository = createRepository({
  table: schedulingRuns,
  queryKey: "schedulingRuns",
  orderBy: desc(schedulingRuns.createdAt)
});

/* For lists: a run without its (large) proposed timetable and inputs */
export const schedulingRunSummaryRepository = createRepository({
  table: schedulingRuns,
  queryKey: "schedulingRuns",
  hiddenColumns: ["result", "fingerprint"],
  orderBy: desc(schedulingRuns.createdAt)
});
