import mongoose from "mongoose";

const examSectionSubjectMapSchema = new mongoose.Schema(
  {
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
      index: true
    },

    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true
    },

    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Section",
      required: true
    },

    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true
    },

    displayCode: {
      type: String,
      required: true
    },

    examDate: { type: Date },

    maxMarks: { type: Number, required: true },
    passMarks: { type: Number },

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

/* Same subject scheduled once in exam for a section */
examSectionSubjectMapSchema.index(
  { tenantId: 1, examId: 1, sectionId: 1, subjectId: 1 },
  { unique: true }
);

/* Display code unique per section per exam */
examSectionSubjectMapSchema.index(
  { tenantId: 1, examId: 1, sectionId: 1, displayCode: 1 },
  { unique: true }
);

/* Fetch exam structure */
examSectionSubjectMapSchema.index(
  { tenantId: 1, examId: 1, isActive: 1 }
);

/* Section exam timetable */
examSectionSubjectMapSchema.index(
  { tenantId: 1, academicYearId: 1, sectionId: 1, examDate: 1 }
);

export default mongoose.model(
  "ExamSectionSubjectMap",
  examSectionSubjectMapSchema
);
