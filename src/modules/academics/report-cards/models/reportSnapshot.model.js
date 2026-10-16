import mongoose from "mongoose";
import { PUBLICATION_KINDS } from "../../shared/constants/academic.constants.js";

/* A student's report card exactly as published: one document per student per
   publication version. Immutable: the only change ever made is marking it withdrawn. */
const reportSnapshotSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true },
    publicationId: { type: String, required: true },
    kind: { type: String, enum: PUBLICATION_KINDS, required: true },
    /* The exam or assessment scheme */
    sourceId: { type: String, required: true },
    sourceName: { type: String, required: true },
    version: { type: Number, required: true },
    academicYearId: { type: String, required: true },
    sectionId: { type: String, required: true },
    classId: { type: String },
    studentId: { type: String, required: true },
    /* Who the card is for, as it was when published */
    student: { type: Object, required: true },
    /* The policy that produced it (settings included) */
    policy: { type: Object, required: true },
    /* The report card body: subjects, totals, grades, GPA, grace, result, rank */
    report: { type: Object, required: true },
    contentHash: { type: String, required: true },
    publishedAt: { type: Date, required: true },
    publishedBy: { type: String },
    withdrawnAt: { type: Date, default: null }
  },
  { collection: "report_snapshots", minimize: false, timestamps: { createdAt: true, updatedAt: false } }
);

reportSnapshotSchema.index({ tenantId: 1, kind: 1, sourceId: 1, studentId: 1, version: 1 }, { unique: true });
reportSnapshotSchema.index({ tenantId: 1, publicationId: 1, studentId: 1 });
reportSnapshotSchema.index({ tenantId: 1, studentId: 1, academicYearId: 1, publishedAt: -1 });

const IMMUTABLE = "Report snapshots are immutable; only withdrawnAt can change";

/* Only { withdrawnAt } may ever be updated */
const onlyWithdrawal = function () {
  const update = this.getUpdate() ?? {};
  const fields = Object.entries(update).flatMap(([key, value]) =>
    key.startsWith("$") ? Object.keys(value ?? {}) : [key]
  );
  if (fields.some(field => field !== "withdrawnAt")) throw new Error(IMMUTABLE);
};

reportSnapshotSchema.pre(["updateOne", "updateMany", "findOneAndUpdate"], onlyWithdrawal);
reportSnapshotSchema.pre(["replaceOne", "findOneAndReplace"], () => {
  throw new Error(IMMUTABLE);
});
reportSnapshotSchema.pre("save", function () {
  if (!this.isNew) throw new Error(IMMUTABLE);
});

export const ReportSnapshot = mongoose.models.ReportSnapshot ?? mongoose.model("ReportSnapshot", reportSnapshotSchema);
