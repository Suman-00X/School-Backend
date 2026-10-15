import { conflict, notFound } from "../../../../common/http/errors.js";
import { enqueue } from "../../../../common/jobs/queue.js";
import { notificationService } from "../../notifications/index.js";
import { FANOUT_BATCH } from "../../shared/constants/communication.constants.js";
import { recipients } from "../../shared/services/recipients.service.js";
import { announcementRepository } from "../repositories/announcement.repository.js";

export const FANOUT_JOB = "communication.publishAnnouncement";

const load = async (ctx, announcementId) => {
  const announcement = await announcementRepository.findById(ctx.tenantId, announcementId);
  if (!announcement) throw notFound("Announcement");
  return announcement;
};

const assertEditable = announcement => {
  if (announcement.status === "PUBLISHED") throw conflict("A published announcement cannot be changed");
};

export const announcementService = {
  create: (ctx, data) =>
    announcementRepository.create(ctx.tenantId, { ...data, status: "DRAFT", createdBy: ctx.userId }),

  list: (ctx, { page, limit, status }) =>
    announcementRepository.list(ctx.tenantId, { page, limit, filter: status ? { status } : {} }),

  getById: async (ctx, announcementId) => {
    const announcement = await load(ctx, announcementId);
    if (announcement.status !== "PUBLISHED") return announcement;
    const delivery = await notificationService.deliveryReport(ctx, {
      type: "ANNOUNCEMENT",
      "data.announcementId": announcementId
    });
    return { ...announcement, delivery };
  },

  update: async (ctx, announcementId, data) => {
    assertEditable(await load(ctx, announcementId));
    return announcementRepository.update(ctx.tenantId, announcementId, data);
  },

  remove: async (ctx, announcementId) => {
    assertEditable(await load(ctx, announcementId));
    return announcementRepository.remove(ctx.tenantId, announcementId);
  },

  /* Publish now, or schedule for publishAt */
  publish: async (ctx, announcementId, { publishAt }) => {
    assertEditable(await load(ctx, announcementId));
    const when = publishAt ? new Date(publishAt) : new Date();
    const delayMs = Math.max(when.getTime() - Date.now(), 0);

    const updated = await announcementRepository.update(ctx.tenantId, announcementId, {
      status: "SCHEDULED",
      publishAt: when
    });
    await enqueue(
      FANOUT_JOB,
      { tenantId: ctx.tenantId, announcementId, publishAt: when.toISOString() },
      { delayMs, jobId: `announcement-${announcementId}-${when.getTime()}` }
    );
    return updated;
  },

  /* Job body: resolve the audience and notify everyone in batches (once) */
  fanOut: async ({ tenantId, announcementId, publishAt }) => {
    const ctx = { tenantId, role: "SYSTEM" };
    const announcement = await announcementRepository.findById(tenantId, announcementId);
    /* Stale job: unpublished, already sent, or rescheduled since */
    if (!announcement || announcement.status !== "SCHEDULED") return;
    if (new Date(announcement.publishAt).toISOString() !== publishAt) return;

    const userIds = await recipients.forAudience(ctx, announcement.audience);
    for (let i = 0; i < userIds.length; i += FANOUT_BATCH) {
      await notificationService.notify(ctx, {
        userIds: userIds.slice(i, i + FANOUT_BATCH),
        type: "ANNOUNCEMENT",
        title: announcement.title,
        body: announcement.body,
        data: { announcementId },
        channels: announcement.channels
      });
    }
    await announcementRepository.update(tenantId, announcementId, {
      status: "PUBLISHED",
      publishedAt: new Date(),
      recipientCount: userIds.length
    });
  }
};
