import { sendFile } from "../../../../common/export/exporters.js";
import { ok } from "../../../../common/http/responses.js";
import { admitCardPdfService } from "../services/admitCardPdf.service.js";
import { admitCardService } from "../services/admitCard.service.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const generatedText = ({ issued, refreshed, withdrawn, notEligible }) =>
  [
    `${plural(issued, "admit card")} issued`,
    refreshed && `${refreshed} updated`,
    withdrawn && `${withdrawn} withdrawn`,
    notEligible && `${plural(notEligible, "student")} not eligible`
  ]
    .filter(Boolean)
    .join(", ");

export const admitCardController = {
  generate: async (req, res) => {
    const result = await admitCardService.generate(req.context, req.params.examId, req.body);
    return ok(res, result, generatedText(result));
  },

  list: async (req, res) =>
    ok(
      res,
      await admitCardService.list(req.context, req.params.examId, req.query),
      "Admit cards retrieved successfully"
    ),

  pdf: async (req, res) => {
    const card = await admitCardService.get(req.context, req.params.examId, req.params.admitCardId);
    const { buffer, fileName } = await admitCardPdfService.renderOne(req.context, card);
    return sendFile(res, { buffer, fileName, format: "pdf" });
  },

  /* Every issued card of a section, one per page */
  sectionPdf: async (req, res) => {
    const cards = await admitCardService.issuedInSection(req.context, req.params.examId, req.query.sectionId);
    const { buffer, fileName } = await admitCardPdfService.render(req.context, cards, {
      fileName: `admit-cards-${cards[0].student.section}-${cards[0].exam.examName}`
    });
    return sendFile(res, { buffer, fileName, format: "pdf" });
  }
};
