import { notFound } from "../../../../common/http/errors.js";
import { studentService } from "../../../users/students/index.js";
import { certificateFormatService, certificateRenderService } from "../../certificates/index.js";
import { reportCardService } from "./reportCard.service.js";
import { buildReportCardValues } from "./reportCardFormat.service.js";

/* Report cards print from the school's REPORT_CARD format (HTML + CSS, edited with the
   certificate formats) through headless Chrome, like certificates. A published card
   prints with the format version that was in use when it was published. */

const nameOf = report => (report.kind === "SCHEME" ? report.scheme?.name : report.exam?.examName);

/* A printable report card. Shows what the policy shows students and parents (ranks hidden when it says so). */
export const reportCardPdfService = {
  /* report: a report body; student: { firstName, lastName, admissionNumber, rollNumber, section };
     publishedAt: a published card's moment (picks the format version of then) */
  renderReport: async (ctx, { report, student, academicYearId, footnote, publishedAt }) => {
    const [format, values] = await Promise.all([
      publishedAt
        ? certificateFormatService.inUseAt(ctx, "REPORT_CARD", publishedAt)
        : certificateFormatService.current(ctx, "REPORT_CARD"),
      buildReportCardValues(ctx, { report, student, academicYearId, footnote })
    ]);
    const name = nameOf(report);
    const buffer = await certificateRenderService.pdf(ctx, format, values, { title: `Report card: ${name}` });
    return { buffer, fileName: `report-card-${student?.admissionNumber ?? student?.id}-${name}` };
  },

  /* Live report card of one exam (staff): marked provisional when not yet published */
  render: async (ctx, studentId, { examId }) => {
    const card = await reportCardService.forStudent(ctx, studentId, { examId });
    const report = card.reports[0];
    if (!report) throw notFound("Report card");
    const [person] = await studentService.findManyByIds(ctx, [studentId]);
    return reportCardPdfService.renderReport(ctx, {
      report,
      student: {
        id: studentId,
        firstName: person?.user?.firstName,
        lastName: person?.user?.lastName,
        admissionNumber: person?.admissionNumber,
        rollNumber: card.student.rollNumber,
        section: card.student.section
      },
      academicYearId: card.academicYearId,
      footnote: report.exam.resultsPublishedAt ? "Live results" : "Provisional: these results are not published yet"
    });
  },

  /* A published snapshot, exactly as it was published */
  renderSnapshot: (ctx, snapshot) =>
    reportCardPdfService.renderReport(ctx, {
      report: snapshot.report,
      student: snapshot.student,
      academicYearId: snapshot.academicYearId,
      publishedAt: snapshot.publishedAt,
      footnote: `Published ${new Date(snapshot.publishedAt).toISOString().slice(0, 10)} (version ${snapshot.version})`
    })
};
