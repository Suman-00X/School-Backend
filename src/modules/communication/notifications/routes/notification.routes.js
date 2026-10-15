import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import { notificationController as controller } from "../controllers/notification.controller.js";
import { NOTIFICATION_PERMISSIONS as can } from "../permissions/notification.permissions.js";
import { notificationValidators as rules } from "../validators/notification.validator.js";

/* /api/v1/communication/messages: staff send a message to people */
export const messageRoutes = createRouter();
messageRoutes.post("/", authorize(can.send), validate(rules.send), controller.send);

/* /api/v1/me/notifications: the signed-in person's inbox */
export const inboxRoutes = createRouter();
inboxRoutes.get("/notifications", authorize(can.inbox), validate(rules.inbox), controller.inbox);
inboxRoutes.get("/notifications/unread-count", authorize(can.inbox), controller.unreadCount);
inboxRoutes.post("/notifications/read-all", authorize(can.inbox), controller.markAllRead);
inboxRoutes.patch(
  "/notifications/:notificationId",
  authorize(can.inbox),
  validate(rules.markRead),
  controller.markRead
);
