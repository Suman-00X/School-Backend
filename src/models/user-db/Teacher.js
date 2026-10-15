import mongoose from "mongoose";

const teacherSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    employeeCode: {
      type: String,
      trim: true
    },

    qualification: { type: String },
    experienceYears: { type: Number },
    joiningDate: { type: Date },

    employmentType: {
      type: String,
      enum: ["FULL_TIME", "PART_TIME"]
    },

    bloodGroup: { type: String },
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

// one teacher profile per user per tenant
teacherSchema.index(
  { tenantId: 1, userId: 1 },
  { unique: true }
);

// employee code must be unique within tenant (if present)
teacherSchema.index(
  { tenantId: 1, employeeCode: 1 },
  { unique: true, sparse: true }
);

export default mongoose.model("Teacher", teacherSchema);
