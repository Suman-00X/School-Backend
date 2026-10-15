import mongoose from "mongoose";

const studentParentMapSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true
    },

    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parent",
      required: true
    },

    relation: {
      type: String,
      enum: ["FATHER", "MOTHER", "GUARDIAN"],
      required: true
    },

    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true
    },

    isPrimaryContact: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

studentParentMapSchema.index(
  { tenantId: 1, studentId: 1 }
);

studentParentMapSchema.index(
  { tenantId: 1, studentId: 1, parentId: 1 },
  { unique: true }
);

export default mongoose.model("StudentParentMap", studentParentMapSchema);