import mongoose from "mongoose";

export const IMPORT_TYPES = ["STUDENTS"];
export const IMPORT_STATUSES = ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"];
export const MAX_RECORDED_ERRORS = 1000;

/* A bulk import and its progress. Per-row errors are kept for the report. */
const importJobSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    type: { type: String, enum: IMPORT_TYPES, required: true },
    status: { type: String, enum: IMPORT_STATUSES, default: "QUEUED" },
    fileName: { type: String },
    storageKey: { type: String },
    options: { type: Object, default: {} },
    totalRows: { type: Number, default: 0 },
    processedRows: { type: Number, default: 0 },
    succeeded: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    rowErrors: [{ _id: false, row: Number, message: String }],
    failureReason: { type: String },
    createdBy: { type: String, required: true },
    startedAt: { type: Date },
    finishedAt: { type: Date }
  },
  { timestamps: true }
);

importJobSchema.index({ tenantId: 1, createdAt: -1 });

export const ImportJob = mongoose.model("ImportJob", importJobSchema);
