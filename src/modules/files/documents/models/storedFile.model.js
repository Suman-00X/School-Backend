import mongoose from "mongoose";
import { tenantModel } from "../../../../common/database/mongo.js";
import { FILE_CATEGORIES, OWNER_TYPES } from "../../shared/constants/file.constants.js";

/* Metadata of an uploaded file; the bytes live in object storage under storageKey */
const storedFileSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    ownerType: { type: String, enum: OWNER_TYPES, required: true },
    ownerId: { type: String, required: true },
    category: { type: String, enum: FILE_CATEGORIES, required: true },
    fileName: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    checksum: { type: String, required: true },
    storageKey: { type: String, required: true },
    uploadedBy: { type: String, required: true },
    description: { type: String }
  },
  { timestamps: true }
);

storedFileSchema.index({ tenantId: 1, ownerType: 1, ownerId: 1, createdAt: -1 });

export const StoredFile = tenantModel("StoredFile", storedFileSchema);
