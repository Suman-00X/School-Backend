import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
  {
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
      index: true
    },

    examName: {
      type: String,
      required: true,
      trim: true
    },

    examType: {
      type: String,
      enum: ["INTERNAL", "FINAL"]
    },

    startDate: { type: Date },
    endDate: { type: Date },

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

/* Same exam name cannot repeat in same academic year */
examSchema.index(
  { tenantId: 1, academicYearId: 1, examName: 1 },
  { unique: true }
);

/* Fetch exams of year */
examSchema.index(
  { tenantId: 1, academicYearId: 1, isActive: 1 }
);

/* Date range queries (report cards / dashboards) */
examSchema.index(
  { tenantId: 1, academicYearId: 1, startDate: 1 }
);

export default mongoose.model("Exam", examSchema);