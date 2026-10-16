import { sendFile } from "../../../../common/export/exporters.js";
import { created, done, ok, paginated } from "../../../../common/http/responses.js";
import { assessmentSchemeService, weightsLabel } from "../services/assessmentScheme.service.js";
import { schemeResultService } from "../services/schemeResult.service.js";

const integrityMessage = report =>
  report.intact
    ? `Version ${report.version} is intact: all ${report.expected} report card(s) match their seals`
    : `Version ${report.version} FAILED its integrity check: ${report.tampered.length} changed, ${report.missing.length} missing, ${report.unexpected.length} not part of the publication`;

const cards = n => `${n} report card${n === 1 ? "" : "s"}`;

export const assessmentSchemeController = {
  create: async (req, res) => {
    const scheme = await assessmentSchemeService.create(req.context, req.body);
    return created(res, scheme, `Assessment scheme ${scheme.name} created: ${weightsLabel(scheme)}`);
  },

  list: async (req, res) =>
    paginated(
      res,
      await assessmentSchemeService.list(req.context, req.query),
      "Assessment schemes retrieved successfully"
    ),

  getById: async (req, res) =>
    ok(
      res,
      await assessmentSchemeService.getById(req.context, req.params.schemeId),
      "Assessment scheme retrieved successfully"
    ),

  update: async (req, res) => {
    const scheme = await assessmentSchemeService.update(req.context, req.params.schemeId, req.body);
    return ok(res, scheme, `Assessment scheme ${scheme.name} updated: ${weightsLabel(scheme)}`);
  },

  remove: async (req, res) => {
    const scheme = await assessmentSchemeService.remove(req.context, req.params.schemeId);
    return done(res, `Assessment scheme ${scheme.name} removed`);
  },

  results: async (req, res) =>
    ok(
      res,
      await schemeResultService.forSection(req.context, req.params.schemeId, req.query.sectionId),
      "Weighted result sheet retrieved successfully"
    ),

  student: async (req, res) => {
    const { row: _row, ...card } = await schemeResultService.forStudent(
      req.context,
      req.params.schemeId,
      req.params.studentId
    );
    return ok(res, card, "Report card retrieved successfully");
  },

  pdf: async (req, res) => {
    const { buffer, fileName } = await schemeResultService.pdf(req.context, req.params.schemeId, req.params.studentId);
    return sendFile(res, { buffer, fileName, format: "pdf" });
  },

  preview: async (req, res) => {
    const preview = await schemeResultService.preview(req.context, req.params.schemeId, req.body);
    return ok(
      res,
      preview,
      `Preview of ${preview.policy.name} on ${preview.scheme.name}: ${preview.summary.resultChanged} of ${preview.summary.students} results would change (nothing was saved)`
    );
  },

  publish: async (req, res) => {
    const { source, publication } = await schemeResultService.publish(req.context, req.params.schemeId);
    return ok(
      res,
      { ...source, publication },
      `${source.name} results published (version ${publication.version}, ${cards(publication.reportCount)})`
    );
  },

  withdraw: async (req, res) => {
    const { source, publication } = await schemeResultService.withdraw(req.context, req.params.schemeId);
    return ok(
      res,
      { ...source, publication },
      publication
        ? `${source.name} results withdrawn: version ${publication.version} is hidden from students and parents and kept on record`
        : `${source.name} results withdrawn`
    );
  },

  versions: async (req, res) =>
    paginated(
      res,
      await schemeResultService.versions(req.context, req.params.schemeId, req.query),
      "Published versions retrieved successfully"
    ),

  revise: async (req, res) => {
    const { source, publication } = await schemeResultService.revise(req.context, req.params.schemeId);
    return created(
      res,
      publication,
      `${source.name} results re-published as version ${publication.version} (${cards(publication.changedCount ?? 0)} changed)`
    );
  },

  integrity: async (req, res) => {
    const report = await schemeResultService.integrity(req.context, req.params.schemeId, req.params.version);
    return ok(res, report, integrityMessage(report));
  },

  comparison: async (req, res) => {
    const comparison = await schemeResultService.compare(req.context, req.params.schemeId, req.query);
    return ok(
      res,
      comparison,
      `Live results compared with version ${comparison.publication.version}: ${comparison.summary.changed} changed, ${comparison.summary.unchanged} unchanged`
    );
  }
};
