import { createRouter } from "../../../../common/http/router.js";
import { authorize } from "../../../../common/auth/authorize.middleware.js";
import { validate } from "../../../../common/validation/validate.middleware.js";
import {
  reportCardController as controller,
  resultPublicationController as publication
} from "../controllers/reportCard.controller.js";
import {
  REPORT_CARD_PERMISSIONS as can,
  RESULT_PUBLICATION_PERMISSIONS as canPublish
} from "../permissions/reportCard.permissions.js";
import { reportCardValidators as rules } from "../validators/reportCard.validator.js";

/* /api/v1/academics/report-cards: computed live from marks under the result policy;
   published versions are frozen as snapshots */
export const reportCardRoutes = createRouter();

reportCardRoutes.get("/sections/:sectionId", authorize(can.read), validate(rules.section), controller.section);
reportCardRoutes.get("/students/:studentId", authorize(can.read), validate(rules.student), controller.student);
reportCardRoutes.get("/students/:studentId/pdf", authorize(can.read), validate(rules.pdf), controller.pdf);

/* Run a policy on an exam's real marks; nothing is saved */
reportCardRoutes.post("/previews", authorize(can.preview), validate(rules.preview), controller.preview);

/* Published report cards, every version */
reportCardRoutes.get("/snapshots", authorize(can.read), validate(rules.snapshots), controller.snapshots);
reportCardRoutes.get("/snapshots/:snapshotId", authorize(can.read), validate(rules.snapshot), controller.snapshot);
reportCardRoutes.get(
  "/snapshots/:snapshotId/pdf",
  authorize(can.read),
  validate(rules.snapshot),
  controller.snapshotPdf
);

/* Mounted at /api/v1/academics/exams: publishing an exam's results is a sub-resource:
   create it to publish, delete it to withdraw; each publication is a version */
export const examPublicationRoutes = createRouter();

examPublicationRoutes.post(
  "/:examId/result-publication",
  authorize(canPublish.publish),
  validate(rules.publication),
  publication.publish
);
examPublicationRoutes.delete(
  "/:examId/result-publication",
  authorize(canPublish.publish),
  validate(rules.publication),
  publication.withdraw
);
examPublicationRoutes.get(
  "/:examId/result-publication/versions",
  authorize(canPublish.read),
  validate(rules.versions),
  publication.versions
);
examPublicationRoutes.post(
  "/:examId/result-publication/versions",
  authorize(canPublish.publish),
  validate(rules.publication),
  publication.revise
);
examPublicationRoutes.get(
  "/:examId/result-publication/comparison",
  authorize(canPublish.read),
  validate(rules.comparison),
  publication.comparison
);
