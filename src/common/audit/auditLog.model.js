import mongoose from "mongoose";
import { findPermission } from "../auth/catalogue.js";
import { tenantModel } from "../database/mongo.js";

/* "hostel.allocations.manage" -> "hostel"; without a permission, "/api/v1/hostel/…" -> "hostel" */
export const auditModuleOf = (permission, path) =>
  permission?.split(".")[0] || /^\/api\/v1\/([^/?#]+)/.exec(path ?? "")?.[1];

/* Append-only trail of every successful write. IDs reference PostgreSQL rows (UUIDs). */
const auditLogSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    userId: { type: String, required: true },
    role: { type: String },
    /* Who did it, as they were at the time (the log reads the same after a rename or role change) */
    actor: {
      type: new mongoose.Schema({ name: { type: String }, role: { type: String } }, { _id: false }),
      default: undefined
    },

    /* Permission used, e.g. "academics.classes.create" */
    permission: { type: String },
    /* Its module ("academics"), and its catalogue label ("Create classes") */
    module: { type: String },
    action: { type: String },
    /* The response's message, written for people: "Book issued to Asha Rao. Due 2026-11-02" */
    summary: { type: String },
    entityId: { type: String },

    method: { type: String },
    path: { type: String },
    statusCode: { type: Number },

    payload: { type: Object },
    ipAddress: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/* Module and action follow from the permission, whoever writes the entry */
auditLogSchema.pre("validate", function deriveFromPermission() {
  this.module ??= auditModuleOf(this.permission, this.path);
  this.action ??= this.permission ? findPermission(this.permission)?.label : undefined;
});

/* History of one record */
auditLogSchema.index({ tenantId: 1, entityId: 1, createdAt: -1 });

/* Activity of one user */
auditLogSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });

/* Everything done through one permission */
auditLogSchema.index({ tenantId: 1, permission: 1, createdAt: -1 });

/* A module's activity log */
auditLogSchema.index({ tenantId: 1, module: 1, createdAt: -1 });

export default tenantModel("AuditLog", auditLogSchema);
