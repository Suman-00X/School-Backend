import { claimOnce, releaseClaim } from "../../../../common/jobs/claims.js";
import { getTenant } from "../../../../common/tenancy/tenant.service.js";
import { todayIn } from "../../../../common/utils/date.util.js";
import { notificationService } from "../../../communication/notifications/index.js";
import { libraryPolicyService } from "../../policy/index.js";
import { daysLate, formatAmount, lateFineFor } from "../../shared/utils/circulation.util.js";
import { loanRepository } from "../repositories/loan.repository.js";

const reminder = ({ title, accessionNumber, dueDate, days, fine }) => ({
  title: `Library book overdue: ${title}`,
  body:
    `${title} (${accessionNumber}) was due on ${dueDate} and is ${days} day(s) overdue. ` +
    `Please return it to the library.${fine > 0 ? ` Fine so far: ${formatAmount(fine)}.` : ""}`
});

/* Daily, every school: one in-app reminder per overdue loan per day */
export const sendOverdueReminders = async () => {
  const schools = new Map();
  let sent = 0;

  for (const { loan, title, accessionNumber } of await loanRepository.findPossiblyOverdue()) {
    const { tenantId } = loan;
    const ctx = { tenantId, role: "SYSTEM" };
    if (!schools.has(tenantId)) {
      const tenant = await getTenant(tenantId);
      schools.set(tenantId, { today: todayIn(tenant?.timezone ?? "UTC"), policy: await libraryPolicyService.get(ctx) });
    }
    const { today, policy } = schools.get(tenantId);
    const days = daysLate(loan.dueDate, today);
    if (days <= 0) continue;

    const claim = `library-overdue:${tenantId}:${loan.id}:${today}`;
    if (!(await claimOnce(claim))) continue;
    try {
      await notificationService.notify(ctx, {
        userIds: [loan.borrowerUserId],
        type: "MESSAGE",
        ...reminder({
          title,
          accessionNumber,
          dueDate: loan.dueDate,
          days,
          fine: lateFineFor(policy, loan.dueDate, today)
        }),
        data: { loanId: loan.id, bookId: loan.bookId, copyId: loan.copyId, on: today },
        channels: ["IN_APP"]
      });
    } catch (error) {
      /* Let the retry send it */
      await releaseClaim(claim);
      throw error;
    }
    sent++;
  }
  return { sent };
};
