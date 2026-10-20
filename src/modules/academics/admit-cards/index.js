/* academics/admit-cards: an exam's admit cards, issued to the students the exam
   eligibility rules let sit it, printable, and shown to families in the portal */
export { default as admitCardExamRoutes } from "./routes/admitCard.routes.js";
export { admitCardService, ADMIT_CARDS_ISSUED } from "./services/admitCard.service.js";
export { admitCardPdfService } from "./services/admitCardPdf.service.js";
