import { drawLetterhead, logoBytes } from "../../../../common/export/branding.js";
import { renderPdf } from "../../../../common/export/exporters.js";
import { notFound } from "../../../../common/http/errors.js";
import { getTenant } from "../../../../common/tenancy/tenant.service.js";
import { studentService } from "../../../users/students/index.js";
import { forFamilies, reportCardService } from "./reportCard.service.js";

const COMPONENT_LABEL = {
  THEORY: "Theory",
  PRACTICAL: "Practical",
  INTERNAL: "Internal",
  PROJECT: "Project",
  ORAL: "Oral"
};
const RESULT_LABEL = {
  PASS: "PASS",
  FAIL: "FAIL",
  COMPARTMENT: "COMPARTMENT",
  INCOMPLETE: "INCOMPLETE (marks pending)"
};
const WIDTH = 515;

const dash = value => (value === null || value === undefined || value === "" ? "-" : String(value));
const fullName = student => `${student?.firstName ?? ""} ${student?.lastName ?? ""}`.trim();

/* Marks cell: "AB", "EX", "33 (+2)" with grace */
const marksCell = line => {
  if (line.status === "ABSENT") return "AB";
  if (line.status === "EXEMPT") return "EX";
  if (line.status === "NOT_RECORDED") return "-";
  return line.graceMarks ? `${dash(line.marksObtained)} (+${line.graceMarks})` : dash(line.marksObtained);
};

const passCell = line =>
  line.status === "EXEMPT"
    ? "Exempt"
    : line.passed === null || line.passed === undefined
      ? "-"
      : line.passed
        ? "Passed"
        : "Failed";

/* Columns for the subjects table, by what the policy shows */
const scholasticColumns = report => {
  const { display } = report;
  if (report.kind === "SCHEME") {
    const exams = report.scheme?.exams ?? [];
    const each = Math.max(50, Math.floor((WIDTH - 160 - 70 - 60 - 50) / Math.max(exams.length, 1)));
    return [
      { header: "Subject", width: 160, value: line => line.subject.subjectName },
      ...exams.map(exam => ({
        header: `${exam.examName} (${exam.weight}%)`,
        width: each,
        value: line => dash(line.exams?.find(e => e.examId === exam.examId)?.percentage)
      })),
      { header: "Weighted %", width: 70, value: line => dash(line.percentage) },
      ...(display.grades ? [{ header: "Grade", width: 60, value: line => dash(line.grade) }] : []),
      ...(display.gradePoints ? [{ header: "GP", width: 50, value: line => dash(line.gradePoint) }] : [])
    ];
  }
  if (!display.marks) {
    return [
      { header: "Subject", width: 315, value: line => line.subject.subjectName },
      { header: "Result", width: 200, value: passCell }
    ];
  }
  return [
    { header: "Subject", width: 165, value: line => line.subject.subjectName },
    { header: "Max", width: 50, value: line => dash(line.maxMarks) },
    { header: "Pass", width: 50, value: line => dash(line.passMarks) },
    { header: "Marks", width: 75, value: marksCell },
    { header: "%", width: 55, value: line => dash(line.percentage) },
    ...(display.grades ? [{ header: "Grade", width: 60, value: line => dash(line.grade) }] : []),
    ...(display.gradePoints ? [{ header: "GP", width: 60, value: line => dash(line.gradePoint) }] : [])
  ];
};

/* Draw a report card (a report body as built by report cards or assessment schemes) */
const draw = (doc, { tenant, logo, report, student, title, footnote }) => {
  drawLetterhead(doc, tenant, logo);
  doc.moveDown(0.3).fontSize(13).text(title, { align: "center" });
  doc.moveDown();

  doc.fontSize(10);
  doc.text(`Student: ${fullName(student)}`);
  doc.text(
    `Admission no.: ${dash(student?.admissionNumber)}    Class: ${dash(student?.section?.name)}    Roll no.: ${dash(student?.rollNumber)}`
  );
  if (report.policy?.name) doc.fillColor("#555").text(`Assessed under: ${report.policy.name}`).fillColor("#000");
  doc.moveDown();

  const left = doc.page.margins.left;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 40;
  let y = doc.y;
  const table = (columns, rows, { bold = false } = {}) => {
    for (const cells of rows) {
      if (y > bottom()) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      let x = left;
      doc.font(bold || cells.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      cells.values.forEach((cell, i) => {
        doc.text(dash(cell), x + 4, y + 5, { width: columns[i].width - 8, lineBreak: false, ellipsis: true });
        x += columns[i].width;
      });
      y += 20;
      doc.moveTo(left, y).lineTo(x, y).strokeColor("#cccccc").stroke();
    }
  };

  const columns = scholasticColumns(report);
  table(columns, [{ values: columns.map(c => c.header), bold: true }]);
  for (const line of report.subjects) {
    table(columns, [{ values: columns.map(c => c.value(line)) }]);
    if (report.display.marks && report.kind !== "SCHEME") {
      for (const part of line.components ?? []) {
        table(columns, [
          {
            values: columns.map((c, i) =>
              i === 0
                ? `   ${COMPONENT_LABEL[part.component] ?? part.displayCode}`
                : c.value({ ...part, subject: line.subject })
            )
          }
        ]);
      }
    }
  }
  if (report.display.marks && report.kind !== "SCHEME") {
    const totals = {
      subject: { subjectName: "Total" },
      maxMarks: report.totalMax,
      marksObtained: report.totalObtained,
      percentage: report.percentage,
      grade: report.grade,
      status: "PRESENT"
    };
    table(
      columns,
      [
        {
          values: columns.map((c, i) =>
            i === 0 ? "Total" : c.header === "Pass" || c.header === "GP" ? "" : c.value(totals)
          )
        }
      ],
      {
        bold: true
      }
    );
  }

  if (report.coScholastic?.length) {
    y += 14;
    const co = [
      { header: "Co-scholastic", width: 215 },
      { header: "Grade", width: 80 },
      { header: "Descriptor", width: 220 }
    ];
    table(co, [{ values: co.map(c => c.header), bold: true }]);
    for (const line of report.coScholastic) {
      table(co, [{ values: [line.subject.subjectName, line.grade, line.remark ?? line.teacherRemarks] }]);
    }
  }

  doc.font("Helvetica").fontSize(11);
  doc.text(" ", left, y + 12);
  const summary = [];
  if (report.display.marks && report.percentage !== null) summary.push(`Percentage: ${report.percentage}%`);
  if (report.display.grades && report.grade) summary.push(`Grade: ${report.grade}`);
  if (report.display.gradePoints && report.gpa !== null) summary.push(`GPA: ${report.gpa}`);
  if (report.cgpa !== null && report.cgpa !== undefined) summary.push(`CGPA: ${report.cgpa}`);
  if (summary.length) doc.text(summary.join("    "));
  if (report.graceTotal > 0) {
    const graced = report.subjects
      .filter(line => line.graceMarks > 0)
      .map(line => `${line.subject.subjectName} +${line.graceMarks}`);
    doc.text(`Grace marks: ${report.graceTotal} (${graced.join(", ")})`);
  }
  const compartment = report.compartmentSubjects?.length
    ? ` in ${report.compartmentSubjects.map(s => s.subjectName).join(", ")}`
    : "";
  doc
    .font("Helvetica-Bold")
    .text(`Result: ${RESULT_LABEL[report.result] ?? report.result}${compartment}`)
    .font("Helvetica");
  if (report.display.rankToStudents) {
    if (report.rank) doc.text(`Rank in section: ${report.rank} of ${report.sectionSize}`);
    if (report.classRank) doc.text(`Rank in class: ${report.classRank} of ${report.classSize}`);
  }
  if (report.display.marks && report.sectionAverage !== null && report.sectionAverage !== undefined) {
    doc.text(`Section average: ${report.sectionAverage}%`);
  }
  if (footnote) doc.moveDown(0.5).fontSize(8).fillColor("#555").text(footnote).fillColor("#000");
  doc
    .moveDown(3)
    .fontSize(9)
    .fillColor("#555")
    .text("Class teacher", left, doc.y, { continued: true })
    .text("Principal", { align: "right" });
};

const titleOf = report => `Report Card: ${report.kind === "SCHEME" ? report.scheme?.name : report.exam?.examName}`;

/* A printable report card. Shows what the policy shows students and parents (ranks hidden when it says so). */
export const reportCardPdfService = {
  /* report: a report body; student: { firstName, lastName, admissionNumber, rollNumber, section } */
  renderReport: async (ctx, { report, student, footnote }) => {
    const tenant = await getTenant(ctx.tenantId);
    const logo = await logoBytes(tenant);
    const visible = forFamilies(report);
    const buffer = await renderPdf(doc =>
      draw(doc, { tenant, logo, report: visible, student, title: titleOf(visible), footnote })
    );
    const name = report.kind === "SCHEME" ? report.scheme?.name : report.exam?.examName;
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
      footnote: report.exam.resultsPublishedAt ? "Live results" : "Provisional: these results are not published yet"
    });
  },

  /* A published snapshot, exactly as it was published */
  renderSnapshot: (ctx, snapshot) =>
    reportCardPdfService.renderReport(ctx, {
      report: snapshot.report,
      student: snapshot.student,
      footnote: `Published ${new Date(snapshot.publishedAt).toISOString().slice(0, 10)} (version ${snapshot.version})`
    })
};
