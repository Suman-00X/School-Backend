import mongoose from "mongoose";

const subjectSchema = new mongoose.Schema(
  {
    subjectName: {
      type: String,
      required: true,
      trim: true
    },

    subjectCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },

    subjectType: {
      type: String,
      enum: ["THEORY", "PRACTICAL"]
    },

    isOptional: { type: Boolean, default: false },
    description: { type: String },

    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true
    },

    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

subjectSchema.index(
  { tenantId: 1, subjectCode: 1 },
  { unique: true }
);

subjectSchema.index(
  { tenantId: 1, subjectName: 1 },
  { unique: true }
);

export default mongoose.model("Subject", subjectSchema);