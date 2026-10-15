import mongoose from "mongoose";
import { CHANNELS, DELIVERY_STATUSES, NOTIFICATION_TYPES } from "../../shared/constants/communication.constants.js";

/* One message to one person, with its delivery state per channel */
const notificationSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    userId: { type: String, required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    /* Short text for SMS (falls back to body) */
    sms: { type: String },
    /* Links for the app: { studentId, invoiceId, examId, announcementId… } */
    data: { type: Object, default: {} },
    deliveries: [
      {
        _id: false,
        channel: { type: String, enum: CHANNELS },
        status: { type: String, enum: DELIVERY_STATUSES, default: "PENDING" },
        error: String,
        sentAt: Date
      }
    ],
    readAt: { type: Date, default: null }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/* Inbox (newest first) and unread count */
notificationSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, userId: 1, readAt: 1 });

export const Notification = mongoose.model("Notification", notificationSchema);
