import { claimOnce, releaseClaim } from "../../../../common/jobs/claims.js";
import { defineJob } from "../../../../common/jobs/queue.js";
import { notificationService } from "../../../communication/notifications/index.js";

/* One library message (hold ready, fine charged, due soon, overdue) to its
   recipients, in-app and by email. Queued after the change commits, so a slow
   mail server never holds a row lock; `key` makes a retried job send it once. */
const deliver = async ({ tenantId, key, userIds, title, body, data }) => {
  if (!(await claimOnce(`library-notice:${tenantId}:${key}`))) return { sent: 0 };
  try {
    const sent = await notificationService.notify(
      { tenantId, role: "SYSTEM" },
      { userIds, type: "MESSAGE", title, body, data, channels: ["IN_APP", "EMAIL"] }
    );
    return { sent };
  } catch (error) {
    await releaseClaim(`library-notice:${tenantId}:${key}`);
    throw error;
  }
};

export const libraryNoticeJob = defineJob("library.notice", deliver, { attempts: 3 });

/* notices: [{ key, userIds, title, body, data }] */
export const sendNotices = async (ctx, notices) => {
  for (const notice of notices) {
    if (notice.userIds.length) await libraryNoticeJob.enqueue({ tenantId: ctx.tenantId, ...notice });
  }
};
