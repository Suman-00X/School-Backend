import { drawLetterhead, logoBytes } from "../../../../common/export/branding.js";
import { renderPdf } from "../../../../common/export/exporters.js";
import { getTenant } from "../../../../common/tenancy/tenant.service.js";
import { holisticProgressService } from "./holisticProgress.service.js";

const dash = value => (value === null || value === undefined || value === "" ? "-" : String(value));
const GENDER = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };
const RESULT = { PASS: "Pass", FAIL: "Fail", COMPARTMENT: "Compartment", INCOMPLETE: "Marks pending" };

/* Part A (about the student), Part B (subjects × abilities, self and peer), Part C
   (reflections and feedback), then the exam's result and attendance */
const draw = (doc, { tenant, logo, card }) => {
  const left = doc.page.margins.left;
  const bottom = () => doc.page.height - doc.page.margins.bottom - 40;
  const levelLabel = Object.fromEntries(card.stage.levels.map(l => [l.value, l.label]));
  const level = value => (value ? (levelLabel[value] ?? value) : "-");

  drawLetterhead(doc, tenant, logo);
  if (card.school.udiseCode)
    doc.fontSize(9).fillColor("#555").text(`UDISE code: ${card.school.udiseCode}`, { align: "center" }).fillColor("#000");
  doc.moveDown(0.3).fontSize(13).text(`Holistic Progress Card: ${card.stage.label} stage`, { align: "center" });
  doc.fontSize(10).text(card.exam.examName, { align: "center" });
  doc.moveDown();

  const heading = text => {
    if (doc.y > bottom() - 40) doc.addPage();
    doc.moveDown(0.6).font("Helvetica-Bold").fontSize(11).text(text, left).font("Helvetica").fontSize(10);
    doc.moveDown(0.3);
  };

  const s = card.student;
  heading("Part A: About me");
  doc.text(`Name: ${[s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")}`);
  doc.text(`Class: ${dash(s.section?.name)}    Roll no.: ${dash(s.rollNumber)}    Admission no.: ${dash(s.admissionNumber)}`);
  doc.text(`Date of birth: ${dash(s.dob)}    Gender: ${dash(GENDER[s.gender])}    Mother tongue: ${dash(s.motherTongue)}`);
  doc.text(`APAAR id: ${dash(s.apaarId)}    PEN: ${dash(s.pen)}`);
  if (card.attendance)
    doc.text(
      `Attendance (${card.attendance.from} to ${card.attendance.to}): ${card.attendance.attendedDays} of ${card.attendance.workingDays} working days${card.attendance.percentage === null ? "" : ` (${card.attendance.percentage}%)`}`
    );
  if (card.interests) doc.text(`My interests: ${card.interests}`);

  heading("Part B: Learning in each subject");
  const columns = [
    { header: "Subject", width: 155 },
    ...card.abilities.map(a => ({ header: a.label, width: 72 })),
    { header: "Self", width: 72 },
    { header: "Peer", width: 72 }
  ];
  let y = doc.y;
  const row = (values, { bold = false } = {}) => {
    if (y > bottom()) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    let x = left;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
    values.forEach((value, i) => {
      doc.text(dash(value), x + 4, y + 5, { width: columns[i].width - 8, lineBreak: false, ellipsis: true });
      x += columns[i].width;
    });
    y += 20;
    doc.moveTo(left, y).lineTo(x, y).strokeColor("#cccccc").stroke();
  };
  row(
    columns.map(c => c.header),
    { bold: true }
  );
  for (const { subject, entry } of card.subjects) {
    row([
      subject.subjectName,
      ...card.abilities.map(a => level(entry?.[a.key])),
      level(entry?.selfAssessment),
      level(entry?.peerAssessment)
    ]);
    if (entry?.remark) {
      doc.font("Helvetica").fontSize(8).fillColor("#444");
      doc.text(entry.remark, left + 10, y + 3, { width: 495 });
      doc.fillColor("#000");
      y = doc.y + 4;
    }
  }
  doc.font("Helvetica").fontSize(8).fillColor("#555");
  doc.text(`Levels: ${card.stage.levels.map(l => l.label).join(" → ")}`, left, y + 6).fillColor("#000");

  heading("Part C: Reflections and feedback");
  for (const r of card.reflections.filter(r => r.key !== "interests")) {
    doc.font("Helvetica-Bold").text(`${r.label}: `, { continued: true }).font("Helvetica").text(dash(card[r.key]));
  }

  if (card.academic) {
    heading(`Result of ${card.exam.examName}`);
    const parts = [
      card.academic.percentage !== null && card.academic.percentage !== undefined && `Percentage: ${card.academic.percentage}%`,
      card.academic.grade && `Grade: ${card.academic.grade}`,
      card.academic.result && `Result: ${RESULT[card.academic.result] ?? card.academic.result}`
    ].filter(Boolean);
    if (parts.length) doc.text(parts.join("    "));
    const graded = card.academic.subjects.filter(l => l.grade);
    if (graded.length) doc.fontSize(9).text(graded.map(l => `${l.subjectName}: ${l.grade}`).join("   ·   "));
  }

  doc
    .moveDown(3)
    .fontSize(9)
    .fillColor("#555")
    .text("Class teacher", left, doc.y, { continued: true })
    .text("Parent", { align: "center", continued: true })
    .text("Principal", { align: "right" });
};

export const holisticProgressPdfService = {
  render: async (ctx, { examId, studentId }) => {
    const card = await holisticProgressService.forStudent(ctx, { examId, studentId });
    const tenant = await getTenant(ctx.tenantId);
    const logo = await logoBytes(tenant);
    const buffer = await renderPdf(doc => draw(doc, { tenant, logo, card }));
    return { buffer, fileName: `holistic-progress-card-${card.student.admissionNumber ?? studentId}-${card.exam.examName}` };
  }
};
