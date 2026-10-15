import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    role: { type: String },

    action: {
      type: String,
      enum: ["CREATE", "UPDATE", "DELETE", "BULK", "LOGIN"],
      required: true
    },

    entityType: { type: String },
    entityId: { type: mongoose.Schema.Types.ObjectId },

    method: { type: String },
    path: { type: String },

    payload: { type: Object },

    ipAddress: { type: String },

    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

auditLogSchema.index({
  tenantId: 1,
  entityType: 1,
  entityId: 1,
  createdAt: -1
});

export default mongoose.model("AuditLog", auditLogSchema);