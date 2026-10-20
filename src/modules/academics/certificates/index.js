/* academics/certificates: bonafide, character and transfer certificates issued to
   students, printed to PDF from the school's own HTML + CSS formats (versioned). The
   format store also keeps the report card's format (report-cards fills it). */
export { default as certificateRoutes } from "./routes/certificate.routes.js";
export { default as certificateFormatRoutes } from "./routes/certificateFormat.routes.js";
export { certificateService } from "./services/certificate.service.js";
export { certificateFilters } from "./validators/certificate.validator.js";
export { certificateDataService } from "./services/certificateData.service.js";
export { certificateFormatService } from "./services/certificateFormat.service.js";
export { certificateRenderService } from "./services/certificateRender.service.js";
export { FORMAT_CSS, FORMAT_LETTERHEAD } from "./templates/defaultFormats.js";
export { longDate, shortDate } from "./utils/certificateText.util.js";
