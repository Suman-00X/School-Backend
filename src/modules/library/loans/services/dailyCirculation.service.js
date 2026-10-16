import { toMinor } from "../../../../common/money/money.js";
import { getTenant } from "../../../../common/tenancy/tenant.service.js";
import { daysBetween, todayIn } from "../../../../common/utils/date.util.js";
import { libraryPolicyService } from "../../policy/index.js";
import { sendNotices } from "../../shared/jobs/notice.job.js";
import { borrowers } from "../../shared/services/borrowers.service.js";
import { dueSoonNotice, overdueNotice } from "../../shared/utils/notices.util.js";
import { loanRepository } from "../repositories/loan.repository.js";
import { loanView } from "./loanView.service.js";

/* One school's open loans: accrue late fines, remind of due dates, chase overdue books */
const runForSchool = async (tenantId, rows) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const tenant = await getTenant(tenantId);
  const today = todayIn(tenant?.timezone ?? "UTC");
  const policy = await libraryPolicyService.get(ctx);
  const accrue = await loanView.accrualFor(
    ctx,
    rows.map(row => row.loan),
    today,
    { policy }
  );
  const notices = [];
  let accrued = 0;

  for (const { loan, title, accessionNumber } of rows) {
    const daysToDue = daysBetween(today, loan.dueDate);
    if (daysToDue > 0) {
      if (daysToDue <= policy.dueSoonDays)
        notices.push(dueSoonNotice({ loan, title, accessionNumber, days: daysToDue }));
      continue;
    }
    if (daysToDue === 0) continue;

    /* Overdue: record the fine so far, so reports and blocks see it */
    const { lateFine } = accrue(loan);
    if (toMinor(lateFine) > toMinor(loan.lateFine)) {
      await loanRepository.raiseLateFine(tenantId, loan.id, lateFine);
      accrued++;
    }

    /* One reminder per N-day period from the first late day (a run missed on the
       period's first day sends it the next day; each goes out once) */
    const days = -daysToDue;
    const parents =
      loan.borrowerRole === "STUDENT" && policy.notifyParents
        ? await borrowers.parentUserIdsOf(ctx, [loan.borrowerUserId])
        : [];
    notices.push(
      overdueNotice({
        loan,
        title,
        accessionNumber,
        days,
        fine: lateFine,
        borrowerName: await borrowers.nameOf(ctx, loan.borrowerUserId),
        userIds: [loan.borrowerUserId, ...parents],
        period: Math.floor((days - 1) / policy.overdueReminderEveryDays)
      })
    );
  }
  await sendNotices(ctx, notices);
  return { notices: notices.length, accrued };
};

/* Daily, every school */
export const runDailyCirculation = async () => {
  const bySchool = new Map();
  for (const row of await loanRepository.findOpenDueBefore()) {
    if (!bySchool.has(row.loan.tenantId)) bySchool.set(row.loan.tenantId, []);
    bySchool.get(row.loan.tenantId).push(row);
  }
  const totals = { notices: 0, accrued: 0 };
  for (const [tenantId, rows] of bySchool) {
    const result = await runForSchool(tenantId, rows);
    totals.notices += result.notices;
    totals.accrued += result.accrued;
  }
  return totals;
};
