import { email } from "../../../../common/messaging/email.js";
import { sms } from "../../../../common/messaging/sms.js";
import { notFound } from "../../../../common/http/errors.js";
import { enqueue } from "../../../../common/jobs/queue.js";
import { accountService } from "../../../users/accounts/index.js";
import { notificationRepository } from "../repositories/notification.repository.js";

export const DELIVER_JOB = "communication.deliver";

export const notificationService = {
  /* Send one message to many people. IN_APP is always stored; EMAIL/SMS are queued.
     -> number of notifications created */
  notify: async (ctx, { userIds, type, title, body, sms: smsText, data = {}, channels = ["IN_APP"] }) => {
    const recipients = [...new Set(userIds)].filter(Boolean);
    if (!recipients.length) return 0;

    const outbound = channels.filter(channel => channel !== "IN_APP");
    const deliveries = [
      { channel: "IN_APP", status: "SENT", sentAt: new Date() },
      ...outbound.map(channel => ({ channel, status: "PENDING" }))
    ];
    const ids = await notificationRepository.insertMany(
      ctx.tenantId,
      recipients.map(userId => ({ userId, type, title, body, sms: smsText, data, deliveries }))
    );

    for (const notificationId of ids) {
      for (const channel of outbound) await enqueue(DELIVER_JOB, { tenantId: ctx.tenantId, notificationId, channel });
    }
    return ids.length;
  },

  /* Job body: deliver one notification over one channel */
  deliver: async ({ tenantId, notificationId, channel }) => {
    const notification = await notificationRepository.findById(tenantId, notificationId);
    if (!notification) return;
    const delivery = notification.deliveries.find(d => d.channel === channel);
    if (!delivery || delivery.status === "SENT") return;

    const [account] = await accountService.findManyByIds({ tenantId }, [notification.userId]);
    const address = channel === "EMAIL" ? account?.email : account?.phone;
    if (!address) {
      await notificationRepository.setDelivery(notificationId, channel, {
        status: "SKIPPED",
        error: `No ${channel === "EMAIL" ? "email" : "phone"} on file`
      });
      return;
    }

    try {
      if (channel === "EMAIL") await email.send({ to: address, subject: notification.title, text: notification.body });
      else await sms.send({ to: address, text: notification.sms ?? notification.body });
      await notificationRepository.setDelivery(notificationId, channel, {
        status: "SENT",
        sentAt: new Date(),
        error: null
      });
    } catch (error) {
      await notificationRepository.setDelivery(notificationId, channel, { status: "FAILED", error: error.message });
      throw error;
    }
  },

  /* Inbox of the signed-in person */
  inbox: (ctx, { page, limit, unread, type }) =>
    notificationRepository.list(ctx.tenantId, {
      page,
      limit,
      filter: { userId: ctx.userId, ...(unread && { readAt: null }), ...(type && { type }) },
      projection: { deliveries: 0, sms: 0 }
    }),

  unreadCount: async ctx => ({
    unread: await notificationRepository.count(ctx.tenantId, { userId: ctx.userId, readAt: null })
  }),

  markRead: async (ctx, notificationId, read) => {
    const notification = await notificationRepository.findOne(ctx.tenantId, {
      _id: notificationId,
      userId: ctx.userId
    });
    if (!notification) throw notFound("Notification");
    return notificationRepository.update(ctx.tenantId, notificationId, { readAt: read ? new Date() : null });
  },

  markAllRead: async ctx => {
    const result = await notificationRepository.updateMany(
      ctx.tenantId,
      { userId: ctx.userId, readAt: null },
      { readAt: new Date() }
    );
    return { updated: result.modifiedCount };
  },

  /* Delivery report of everything sent for one source (e.g. an announcement) */
  deliveryReport: async (ctx, filter) => {
    const { rows } = await notificationRepository.list(ctx.tenantId, {
      filter,
      limit: 100_000,
      projection: { deliveries: 1 }
    });
    const report = {};
    for (const { deliveries } of rows) {
      for (const { channel, status } of deliveries) {
        report[channel] ??= { PENDING: 0, SENT: 0, FAILED: 0, SKIPPED: 0 };
        report[channel][status]++;
      }
    }
    return { recipients: rows.length, channels: report };
  }
};
