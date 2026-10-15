import mongoose from "mongoose";

const sectionSchema = new mongoose.Schema(
  {
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
      index: true
    },

    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true
    },

    sectionName: {
      type: String,
      required: true,
      trim: true
    },

    capacity: { type: Number },

    classTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher"
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

/* Unique: section identity per academic year */
sectionSchema.index(
  { tenantId: 1, academicYearId: 1, classId: 1, sectionName: 1 },
  { unique: true }
);

/* Fetch all sections of a class in a year */
sectionSchema.index(
  { tenantId: 1, academicYearId: 1, classId: 1, isActive: 1 }
);

/* Teacher timetable lookup */
sectionSchema.index(
  { tenantId: 1, classTeacherId: 1, academicYearId: 1, isActive: 1 }
);

export default mongoose.model("Section", sectionSchema);
