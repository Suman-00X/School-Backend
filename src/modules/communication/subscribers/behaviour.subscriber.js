import { subscribe } from "../../../common/events/events.js";
import {
  BEHAVIOUR_REMARK_RECORDED,
  REMARK_CATEGORIES,
  REMARK_KIND_LABELS,
  behaviourRemarkService
} from "../../academics/behaviour-remarks/index.js";
import { notificationService } from "../notifications/index.js";
import { recipients } from "../shared/services/recipients.service.js";
import { messages } from "../shared/templates/messages.js";

const categoryLabel = key => REMARK_CATEGORIES.find(c => c.key === key)?.label ?? key;

/* A new behaviour remark -> the student and their parents (in-app) */
subscribe(BEHAVIOUR_REMARK_RECORDED, "communication.behaviourRemark", async ({ tenantId, remarkId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const remark = await behaviourRemarkService.findById(ctx, remarkId);
  if (!remark) return;
  const user = remark.student?.user;
  await notificationService.notify(ctx, {
    userIds: await recipients.forStudents(ctx, [remark.studentId]),
    type: "MESSAGE",
    ...messages.behaviourRemark({
      studentName: user ? `${user.firstName} ${user.lastName}`.trim() : "your child",
      kind: remark.kind,
      kindLabel: REMARK_KIND_LABELS[remark.kind],
      categoryLabel: categoryLabel(remark.category),
      occurredOn: remark.occurredOn
    }),
    data: { remarkId, studentId: remark.studentId }
  });
});
