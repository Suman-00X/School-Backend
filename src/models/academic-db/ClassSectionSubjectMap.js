import mongoose from "mongoose";

const classSectionSubjectMapSchema = new mongoose.Schema(
  {
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
      index: true
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

    weeklyNoOfClasses: { type: Number },
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

/* Subject once per section per year */
classSectionSubjectMapSchema.index(
  { tenantId: 1, academicYearId: 1, sectionId: 1, subjectId: 1 },
  { unique: true }
);

/* Display code must be unique in a section (MA10A etc) */
classSectionSubjectMapSchema.index(
  { tenantId: 1, academicYearId: 1, sectionId: 1, displayCode: 1 },
  { unique: true }
);

/* Fetch timetable of a section */
classSectionSubjectMapSchema.index(
  { tenantId: 1, academicYearId: 1, sectionId: 1, isActive: 1 }
);

/* Subject usage lookup (reports) */
classSectionSubjectMapSchema.index(
  { tenantId: 1, subjectId: 1, academicYearId: 1 }
);

export default mongoose.model(
  "ClassSectionSubjectMap",
  classSectionSubjectMapSchema
);