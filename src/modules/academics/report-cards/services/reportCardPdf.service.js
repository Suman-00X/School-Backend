import { renderPdf } from "../../../../common/export/exporters.js";
import { notFound } from "../../../../common/http/errors.js";
import { getTenant } from "../../../../common/tenancy/tenant.service.js";
import { studentService } from "../../../users/students/index.js";
import { reportCardService } from "./reportCard.service.js";

const COLUMNS = [
  { header: "Subject", width: 190 },
  { header: "Max", width: 60 },
  { header: "Pass", width: 60 },
  { header: "Marks", width: 70 },
  { header: "%", width: 60 },
  { header: "Grade", width: 75 }
];

/* A printable report card for one exam */
export const reportCardPdfService = {
  render: async (ctx, studentId, { examId, publishedOnly = false }) => {
    const card = await reportCardService.forStudent(ctx, studentId, { examId, publishedOnly });
    const report = card.reports[0];
    if (!report) throw notFound("Report card");
    const [tenant, student] = await Promise.all([
      getTenant(ctx.tenantId),
      studentService.findManyByIds(ctx, [studentId])
    ]);
    const person = student[0];

    const buffer = await renderPdf(doc => {
      doc.fontSize(18).text(tenant?.name ?? "School", { align: "center" });
      doc.moveDown(0.3).fontSize(13).text(`Report Card: ${report.exam.examName}`, { align: "center" });
      doc.moveDown();

      doc.fontSize(10);
      doc.text(`Student: ${person?.user?.firstName ?? ""} ${person?.user?.lastName ?? ""}`);
      doc.text(
        `Admission no.: ${person?.admissionNumber ?? "-"}    Class: ${card.student.section.name}    Roll no.: ${card.student.rollNumber}`
      );
      doc.moveDown();

      const left = doc.page.margins.left;
      let y = doc.y;
      const drawRow = (cells, { bold = false } = {}) => {
        let x = left;
        doc.font(bold ? "Helvetica-Bold" : "Helvetica");
        cells.forEach((cell, i) => {
          doc.text(String(cell ?? "-"), x + 4, y + 4, { width: COLUMNS[i].width - 8 });
          x += COLUMNS[i].width;
        });
        y += 20;
        doc.moveTo(left, y).lineTo(x, y).strokeColor("#cccccc").stroke();
      };

      drawRow(
        COLUMNS.map(c => c.header),
        { bold: true }
      );
      for (const s of report.subjects) {
        drawRow([
          s.subject.subjectName,
          s.maxMarks,
          s.passMarks ?? "-",
          s.status === "ABSENT" ? "AB" : (s.marksObtained ?? "-"),
          s.percentage ?? "-",
          s.grade ?? "-"
        ]);
      }
      drawRow(["Total", report.totalMax, "", report.totalObtained, report.percentage ?? "-", report.grade ?? "-"], {
        bold: true
      });

      doc
        .font("Helvetica")
        .fontSize(11)
        .text(`Result: ${report.result}`, left, y + 16);
      if (report.rank) doc.text(`Rank in class: ${report.rank} of ${report.sectionSize}`);
      if (report.sectionAverage !== null) doc.text(`Class average: ${report.sectionAverage}%`);
      doc
        .moveDown(4)
        .fontSize(9)
        .fillColor("#555")
        .text("Class teacher", left, doc.y, { continued: true })
        .text("Principal", { align: "right" });
    });

    return { buffer, fileName: `report-card-${person?.admissionNumber ?? studentId}-${report.exam.examName}` };
  }
};
