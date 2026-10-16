import { sendFile } from "../../../../common/export/exporters.js";
import { created, ok, paginated } from "../../../../common/http/responses.js";
import { reportCardPdfService } from "../services/reportCardPdf.service.js";
import { reportCardService } from "../services/reportCard.service.js";
import { reportSnapshotService } from "../services/reportSnapshot.service.js";
import { resultPreviewService } from "../services/resultPreview.service.js";
import { resultPublicationService } from "../services/resultPublication.service.js";

const cards = n => `${n} report card${n === 1 ? "" : "s"}`;

export const reportCardController = {
  section: async (req, res) =>
    ok(
      res,
      await reportCardService.forSection(req.context, { sectionId: req.params.sectionId, examId: req.query.examId }),
      "Result sheet retrieved successfully"
    ),

  student: async (req, res) =>
    ok(
      res,
      await reportCardService.forStudent(req.context, req.params.studentId, req.query),
      "Report card retrieved successfully"
    ),

  pdf: async (req, res) => {
    const { buffer, fileName } = await reportCardPdfService.render(req.context, req.params.studentId, {
      examId: req.query.examId
    });
    return sendFile(res, { buffer, fileName, format: "pdf" });
  },

  preview: async (req, res) => {
    const preview = await resultPreviewService.exam(req.context, req.body);
    return ok(
      res,
      preview,
      `Preview of ${preview.policy.name} on ${preview.exam.examName}: ${preview.summary.resultChanged} of ${preview.summary.students} results would change (nothing was saved)`
    );
  },

  snapshots: async (req, res) =>
    paginated(res, await reportSnapshotService.list(req.context, req.query), "Report snapshots retrieved successfully"),

  snapshot: async (req, res) =>
    ok(
      res,
      await reportSnapshotService.getById(req.context, req.params.snapshotId),
      "Report snapshot retrieved successfully"
    ),

  snapshotPdf: async (req, res) => {
    const snapshot = await reportSnapshotService.getById(req.context, req.params.snapshotId);
    const { buffer, fileName } = await reportCardPdfService.renderSnapshot(req.context, snapshot);
    return sendFile(res, { buffer, fileName, format: "pdf" });
  }
};

/* /exams/:examId/result-publication */
export const resultPublicationController = {
  publish: async (req, res) => {
    const { source, publication } = await resultPublicationService.publishExam(req.context, req.params.examId);
    return ok(
      res,
      { ...source, publication },
      `${source.examName} results published (version ${publication.version}, ${cards(publication.reportCount)})`
    );
  },

  withdraw: async (req, res) => {
    const { source, publication } = await resultPublicationService.withdrawExam(req.context, req.params.examId);
    return ok(
      res,
      { ...source, publication },
      publication
        ? `${source.examName} results withdrawn: version ${publication.version} is hidden from students and parents and kept on record`
        : `${source.examName} results withdrawn`
    );
  },

  versions: async (req, res) =>
    paginated(
      res,
      await resultPublicationService.examVersions(req.context, req.params.examId, req.query),
      "Published versions retrieved successfully"
    ),

  revise: async (req, res) => {
    const { source, publication } = await resultPublicationService.reviseExam(req.context, req.params.examId);
    return created(
      res,
      publication,
      `${source.examName} results re-published as version ${publication.version} (${cards(publication.changedCount ?? 0)} changed)`
    );
  },

  comparison: async (req, res) => {
    const comparison = await resultPublicationService.compareExam(req.context, req.params.examId, req.query);
    return ok(
      res,
      comparison,
      `Live results compared with version ${comparison.publication.version}: ${comparison.summary.changed} changed, ${comparison.summary.unchanged} unchanged`
    );
  }
};
