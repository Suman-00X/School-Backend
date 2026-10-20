import mongoose from "mongoose";
import { tenantModel } from "../../../../common/database/mongo.js";

/* Whether a student was last seen under the school's low-attendance threshold in a year.
   Teachers and parents are alerted when it turns on (the student falls below), never again
   while it stays on; it turns off once the student is back at or above the threshold, so a
   later fall alerts again. */
const lowAttendanceFlagSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    studentId: { type: String, required: true },
    academicYearId: { type: String, required: true },
    below: { type: Boolean, required: true },
    percentage: { type: Number, default: null },
    threshold: { type: Number, required: true },
    flaggedAt: { type: Date, default: null },
    clearedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

lowAttendanceFlagSchema.index({ tenantId: 1, academicYearId: 1, studentId: 1 }, { unique: true });
lowAttendanceFlagSchema.index({ tenantId: 1, academicYearId: 1, below: 1 });

export const LowAttendanceFlag = tenantModel("LowAttendanceFlag", lowAttendanceFlagSchema);
