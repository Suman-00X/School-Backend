import mongoose from "mongoose";

const studentSectionMapSchema = new mongoose.Schema(
  {
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
      index: true
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true
    },

    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      required: true
    },

    rollNumber: {
      type: String,
      required: true
    },

    admissionType: {
      type: String,
      enum: ["NEW", "PROMOTED", "REPEAT"]
    },

    status: {
      type: String,
      enum: ["ACTIVE", "LEFT"],
      default: "ACTIVE"
    },

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

/* One admission per academic year */
studentSectionMapSchema.index(
  { tenantId: 1, academicYearId: 1, studentId: 1 },
  { unique: true }
);

/* Roll number unique inside a section per year */
studentSectionMapSchema.index(
  { tenantId: 1, academicYearId: 1, sectionId: 1, rollNumber: 1 },
  { unique: true }
);

/* Fetch students of section (attendance / list) */
studentSectionMapSchema.index(
  { tenantId: 1, academicYearId: 1, sectionId: 1, isActive: 1 }
);

/* Student history lookup */
studentSectionMapSchema.index(
  { tenantId: 1, studentId: 1, isActive: 1 }
);

export default mongoose.model("StudentSectionMap", studentSectionMapSchema);
