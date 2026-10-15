import mongoose from "mongoose";

const teacherSectionSubjectMapSchema = new mongoose.Schema(
  {
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
      index: true
    },

    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
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

/* Teacher teaches a subject only once in a section per year */
teacherSectionSubjectMapSchema.index(
  { tenantId: 1, academicYearId: 1, teacherId: 1, sectionId: 1, subjectId: 1 },
  { unique: true }
);

/* Prevent multiple teachers teaching same subject in same section (optional but recommended) */
teacherSectionSubjectMapSchema.index(
  { tenantId: 1, academicYearId: 1, sectionId: 1, subjectId: 1 },
  { unique: true }
);

/* Teacher timetable lookup */
teacherSectionSubjectMapSchema.index(
  { tenantId: 1, academicYearId: 1, teacherId: 1, isActive: 1 }
);

/* Section timetable lookup */
teacherSectionSubjectMapSchema.index(
  { tenantId: 1, academicYearId: 1, sectionId: 1, isActive: 1 }
);

export default mongoose.model(
  "TeacherSectionSubjectMap",
  teacherSectionSubjectMapSchema
);