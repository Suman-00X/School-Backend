import mongoose from "mongoose";

const marksSchema = new mongoose.Schema(
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

    examSectionSubjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamSectionSubjectMap",
      required: true
    },

    marksObtained: { type: Number },
    grade: { type: String },
    isAbsent: { type: Boolean, default: false },

    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher"
    },

    evaluatedAt: { type: Date },

    remarks: { type: String },

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

/* One marks entry per student per exam subject */
marksSchema.index(
  { tenantId: 1, studentId: 1, examSectionSubjectId: 1 },
  { unique: true }
);

/* Report card fetch (student yearly results) */
marksSchema.index(
  { tenantId: 1, academicYearId: 1, studentId: 1, isActive: 1 }
);

/* Subject result sheet */
marksSchema.index(
  { tenantId: 1, examSectionSubjectId: 1, isActive: 1 }
);

/* Teacher evaluation history */
marksSchema.index(
  { tenantId: 1, evaluatedBy: 1, academicYearId: 1 }
);

export default mongoose.model("Marks", marksSchema);