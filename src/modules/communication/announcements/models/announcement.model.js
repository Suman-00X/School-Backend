import mongoose from "mongoose";
import { tenantModel } from "../../../../common/database/mongo.js";
import { ANNOUNCEMENT_STATUSES, AUDIENCE_ROLES, CHANNELS } from "../../shared/constants/communication.constants.js";

/* A circular/announcement to an audience; publishing fans it out as notifications */
const announcementSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    audience: {
      roles: [{ type: String, enum: AUDIENCE_ROLES }],
      classIds: [String],
      sectionIds: [String]
    },
    channels: [{ type: String, enum: CHANNELS }],
    status: { type: String, enum: ANNOUNCEMENT_STATUSES, default: "DRAFT" },
    publishAt: { type: Date },
    publishedAt: { type: Date },
    recipientCount: { type: Number, default: 0 },
    createdBy: { type: String, required: true }
  },
  { timestamps: true }
);

announcementSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

export const Announcement = tenantModel("Announcement", announcementSchema);
