import { created, ok, paginated } from "../../../../common/http/responses.js";
import { recipients } from "../../shared/services/recipients.service.js";
import { notificationService } from "../services/notification.service.js";

export const notificationController = {
  send: async (req, res) => {
    const { userIds, studentIds, includeParents, title, body, channels } = req.body;
    const resolved = [
      ...userIds,
      ...(await recipients.forStudents(req.context, studentIds, { students: true, parents: includeParents }))
    ];
    const sent = await notificationService.notify(req.context, {
      userIds: resolved,
      type: "MESSAGE",
      title,
      body,
      channels,
      data: { sentBy: req.context.userId }
    });
    return created(res, { recipients: sent }, `Message sent to ${sent} recipient(s)`);
  },

  inbox: async (req, res) =>
    paginated(res, await notificationService.inbox(req.context, req.query), "Notifications retrieved successfully"),

  unreadCount: async (req, res) =>
    ok(res, await notificationService.unreadCount(req.context), "Unread count retrieved successfully"),

  markRead: async (req, res) =>
    ok(
      res,
      await notificationService.markRead(req.context, req.params.notificationId, req.body.read),
      req.body.read ? "Marked as read" : "Marked as unread"
    ),

  markAllRead: async (req, res) => {
    const result = await notificationService.markAllRead(req.context);
    return ok(res, result, `${result.updated} notification(s) marked as read`);
  }
};
