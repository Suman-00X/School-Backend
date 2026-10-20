import { drawLetterhead, logoBytes } from "../../../../common/export/branding.js";
import { renderPdf } from "../../../../common/export/exporters.js";
import { getTenant } from "../../../../common/tenancy/tenant.service.js";

const COMPONENT_LABEL = {
  THEORY: "Theory",
  PRACTICAL: "Practical",
  INTERNAL: "Internal",
  PROJECT: "Project",
  ORAL: "Oral"
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const dash = value => (value === null || value === undefined || value === "" ? "-" : String(value));
const fullName = student => `${student?.firstName ?? ""} ${student?.lastName ?? ""}`.trim();
const hhmm = time => (time ? time.slice(0, 5) : "");

/* "2026-11-12" -> "Thu, 12 Nov 2026" */
const longDate = iso => {
  if (!iso) return "To be announced";
  const [y, m, d] = iso.split("-").map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${d} ${MONTHS[m - 1]} ${y}`;
};

const COLUMNS = [
  { header: "Date", width: 130, value: p => longDate(p.examDate) },
  { header: "Time", width: 90, value: p => (p.startTime ? `${hhmm(p.startTime)}–${hhmm(p.endTime)}` : "-") },
  {
    header: "Subject",
    width: 205,
    value: p => (p.component ? `${p.subjectName} (${COMPONENT_LABEL[p.component] ?? p.component})` : p.subjectName)
  },
  { header: "Room", width: 90, value: p => dash(p.room) }
];

/* One card on its own page */
const draw = (doc, { tenant, logo, card }) => {
  const left = doc.page.margins.left;
  const width = COLUMNS.reduce((sum, c) => sum + c.width, 0);
  drawLetterhead(doc, tenant, logo);
  doc.moveDown(0.4).font("Helvetica-Bold").fontSize(14).text("ADMIT CARD", { align: "center" });
  doc.font("Helvetica").fontSize(11).text(card.exam.examName, { align: "center" });
  doc.moveDown();

  const top = doc.y;
  const fields = [
    ["Student", fullName(card.student)],
    ["Admission no.", dash(card.student.admissionNumber)],
    ["Class", dash(card.student.section)],
    ["Roll no.", dash(card.student.rollNumber)]
  ];
  fields.forEach(([label, value], i) => {
    const x = left + (i % 2) * (width / 2) + 8;
    const y = top + 8 + Math.floor(i / 2) * 20;
    doc.font("Helvetica").fontSize(9).fillColor("#555").text(label, x, y, { width: 80 });
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#000").text(value, x + 82, y, { width: width / 2 - 100, lineBreak: false, ellipsis: true });
  });
  const boxHeight = 8 + Math.ceil(fields.length / 2) * 20 + 4;
  doc.rect(left, top, width, boxHeight).strokeColor("#999").stroke();

  let y = top + boxHeight + 18;
  const row = (values, bold) => {
    let x = left;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor("#000");
    values.forEach((value, i) => {
      doc.text(dash(value), x + 4, y + 5, { width: COLUMNS[i].width - 8, lineBreak: false, ellipsis: true });
      x += COLUMNS[i].width;
    });
    y += 20;
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor("#cccccc").stroke();
  };
  row(COLUMNS.map(c => c.header), true);
  for (const paper of card.papers) row(COLUMNS.map(c => c.value(paper)));

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#555")
    .text(
      "Bring this card to every paper. Students without it may not be allowed into the examination hall.",
      left,
      y + 14,
      { width }
    );
  doc
    .moveDown(4)
    .fontSize(9)
    .text("Class teacher", left, doc.y, { continued: true })
    .text("Principal", { align: "right" });
  doc
    .moveDown(1.5)
    .fontSize(7)
    .text(`Issued ${new Date(card.issuedAt).toISOString().slice(0, 10)}`, left, doc.y, { width, align: "center" })
    .fillColor("#000");
};

export const admitCardPdfService = {
  /* cards: one or more card views (admitCardService) -> { buffer, fileName } */
  render: async (ctx, cards, { fileName }) => {
    const tenant = await getTenant(ctx.tenantId);
    const logo = await logoBytes(tenant);
    const buffer = await renderPdf(doc =>
      cards.forEach((card, i) => {
        if (i) doc.addPage();
        draw(doc, { tenant, logo, card });
      })
    );
    return { buffer, fileName };
  },

  renderOne: (ctx, card) =>
    admitCardPdfService.render(ctx, [card], {
      fileName: `admit-card-${card.student.admissionNumber ?? card.studentId}-${card.exam.examName}`
    })
};
