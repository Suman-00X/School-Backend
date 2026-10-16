import mongoose from "mongoose";
import { tenantModel } from "../../../../common/database/mongo.js";

export const IMPORT_TYPES = ["STUDENTS"];
/* MAPPING: uploaded, waiting for the user to confirm which column is which field */
export const IMPORT_STATUSES = ["MAPPING", "QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"];
export const PREVIEW_ROWS = 20;
export const MAX_RECORDED_ERRORS = 1000;

/* A bulk import and its progress. Per-row errors are kept for the report. */
const importJobSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    type: { type: String, enum: IMPORT_TYPES, required: true },
    status: { type: String, enum: IMPORT_STATUSES, default: "MAPPING" },
    fileName: { type: String },
    storageKey: { type: String },
    options: { type: Object, default: {} },
    /* The sheet's header row as written, the confirmed field -> column mapping,
       and the first rows for the mapping preview */
    columns: [String],
    mapping: { type: Object, default: {} },
    sampleRows: { type: [[String]], default: [] },
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

export const ImportJob = tenantModel("ImportJob", importJobSchema);
