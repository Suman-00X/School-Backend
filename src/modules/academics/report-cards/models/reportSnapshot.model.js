import mongoose from "mongoose";
import { tenantModel } from "../../../../common/database/mongo.js";
import { PUBLICATION_KINDS } from "../../shared/constants/academic.constants.js";

/* A student's report card exactly as published: one document per student per
   publication version. Write-once: never updated or deleted (whether a version is visible,
   superseded or withdrawn lives in PostgreSQL, result_publications).
   `seal` is an HMAC of the document's content with a key only the application holds, and
   the publication row lists every student's seal, so an edit, a forged document or a
   deleted one is detected on read (see resultPublication.service sealed()). */
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
    publishedAt: { type: String, required: true },
    publishedBy: { type: String },
    seal: { type: String, required: true }
  },
  { collection: "report_snapshots", minimize: false, timestamps: { createdAt: true, updatedAt: false } }
);

/* One per student per publication; a publication that never committed leaves documents
   under its own id, which nothing reads and which never block the next attempt */
reportSnapshotSchema.index({ tenantId: 1, publicationId: 1, studentId: 1 }, { unique: true });
reportSnapshotSchema.index({ tenantId: 1, kind: 1, sourceId: 1, version: 1 });
reportSnapshotSchema.index({ tenantId: 1, studentId: 1, academicYearId: 1, publishedAt: -1 });

const IMMUTABLE = "Report snapshots are write-once: they cannot be changed or deleted";
const refuse = () => {
  throw new Error(IMMUTABLE);
};

/* In the application nothing may change or remove a snapshot. (In the database, the
   least-privilege role from scripts/mongo-app-role.js enforces the same; the seal detects
   anything done around both.) */
reportSnapshotSchema.pre(
  [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "replaceOne",
    "findOneAndReplace",
    "deleteOne",
    "deleteMany",
    "findOneAndDelete"
  ],
  refuse
);
reportSnapshotSchema.pre("save", function () {
  if (!this.isNew) refuse();
});

export const ReportSnapshot = tenantModel("ReportSnapshot", reportSnapshotSchema);
