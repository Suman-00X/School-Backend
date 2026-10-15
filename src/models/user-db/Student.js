import mongoose from "mongoose";

const studentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    studentCode: { 
      type: String, 
      required: true 
    },

    admissionNumber: {
      type: String,
      required: true,
      trim: true
    },

    admissionDate: { type: Date },

    bloodGroup: { type: String },
    category: { type: String },
    religion: { type: String },

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

studentSchema.index(
  { tenantId: 1, userId: 1 },
  { unique: true }
);

studentSchema.index(
  { tenantId: 1, admissionNumber: 1 },
  { unique: true }
);

export default mongoose.model("Student", studentSchema);
