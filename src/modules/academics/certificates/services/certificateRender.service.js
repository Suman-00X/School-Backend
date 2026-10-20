import { htmlToPdf } from "../../../../common/export/htmlPdf.js";
import { htmlDocument, renderTemplate } from "../../../../common/export/htmlTemplate.js";
import { certificateDataService } from "./certificateData.service.js";

/* A format filled with a certificate's values: the HTML document, or its PDF */
export const certificateRenderService = {
  document: async (ctx, format, values, { title = format.name } = {}) => {
    const logo = await certificateDataService.logo(ctx);
    return htmlDocument({
      title,
      css: format.css,
      body: renderTemplate(format.html, { ...values, school: { ...values.school, logo } })
    });
  },

  pdf: async (ctx, format, values, options) =>
    htmlToPdf(await certificateRenderService.document(ctx, format, values, options))
};
