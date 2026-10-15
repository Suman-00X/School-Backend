import mongoose from "mongoose";

/* Append-only trail of every successful write. IDs reference PostgreSQL rows (UUIDs). */
const auditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    userId: { type: String, required: true },
    role: { type: String },

    /* Permission used, e.g. "academics.classes.create" */
    permission: { type: String },
    entityId: { type: String },

    method: { type: String },
    path: { type: String },
    statusCode: { type: Number },

    payload: { type: Object },
    ipAddress: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/* History of one record */
auditLogSchema.index({ tenantId: 1, entityId: 1, createdAt: -1 });

/* Activity of one user */
auditLogSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });

/* Everything done through one permission */
auditLogSchema.index({ tenantId: 1, permission: 1, createdAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
