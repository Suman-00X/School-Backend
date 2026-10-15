import { eq, inArray } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";
import { scoped } from "../../../../common/database/repository.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { payrollRuns } from "../../payroll/models/payroll.schema.js";
import { monthLabel, monthOf } from "../utils/period.util.js";

/* A month whose payroll is finalized is closed: its attendance and leave can no
   longer change, so payslips always match the records they were computed from. */
export const payrollLock = {
  assertOpen: async (ctx, dates, { dbc = db } = {}) => {
    const months = [...new Set(dates.map(monthOf))];
    if (!months.length) return;
    const [closed] = await dbc
      .select({ month: payrollRuns.month })
      .from(payrollRuns)
      .where(scoped(payrollRuns, ctx.tenantId, inArray(payrollRuns.month, months), eq(payrollRuns.status, "FINALIZED")))
      .orderBy(payrollRuns.month)
      .limit(1);
    if (closed) {
      throw unprocessable(
        `Payroll for ${monthLabel(closed.month)} is finalized; attendance and leave in that month can no longer change`
      );
    }
  }
};
