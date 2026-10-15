import mongoose from "mongoose";

/* Append-only trail of every successful write. IDs reference PostgreSQL rows (UUIDs). */
const auditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    userId: { type: String, required: true },
    role: { type: String },

    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE", "BULK", "LOGIN"],
      required: true
    },

    entityType: { type: String },
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
auditLogSchema.index({ tenantId: 1, entityType: 1, entityId: 1, createdAt: -1 });

/* Activity of one user */
auditLogSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });

export default mongoose.model("AuditLog", auditLogSchema);
