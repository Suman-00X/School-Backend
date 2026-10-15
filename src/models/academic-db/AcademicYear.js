import mongoose from "mongoose";

const academicYearSchema = new mongoose.Schema(
  {
    yearName: {
      type: String,
      required: true,
      trim: true
    },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },

    isCurrent: { type: Boolean, default: false },
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

academicYearSchema.index(
  { tenantId: 1, yearName: 1 },
  { unique: true }
);

academicYearSchema.index(
  { tenantId: 1, isCurrent: 1 },
  {
    unique: true,
    partialFilterExpression: { isCurrent: true }
  }
);

export default mongoose.model("AcademicYear", academicYearSchema);