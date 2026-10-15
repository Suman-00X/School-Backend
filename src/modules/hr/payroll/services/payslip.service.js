import { desc, eq, inArray } from "drizzle-orm";
import { renderPdf } from "../../../../common/export/exporters.js";
import { notFound } from "../../../../common/http/errors.js";
import { getTenant } from "../../../../common/tenancy/tenant.service.js";
import { monthLabel } from "../../shared/utils/period.util.js";
import { payslips } from "../models/payroll.schema.js";
import { payslipRepository } from "../repositories/payroll.repository.js";

const withRun = { run: { columns: { id: true, month: true, status: true, finalizedAt: true } } };

/* Employees only ever see their own payslips, and only from finalized runs */
const ownFinalized = ctx => [
  eq(payslips.userId, ctx.userId),
  inArray(payslips.runId, payslipRepository.finalizedRunIds(ctx.tenantId))
];

const formatMoney = (amount, currency) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: currency ?? "INR" }).format(amount);

const describeLine = line =>
  line.calculation === "PERCENT_OF_BASIC" ? `${line.name} (${line.value}% of basic)` : line.name;

const drawPayslip = (doc, payslip, tenant) => {
  const currency = tenant?.currency;
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  doc.fontSize(18).text(tenant?.name ?? "School", { align: "center" });
  if (tenant?.address) doc.fontSize(9).fillColor("#555").text(tenant.address, { align: "center" });
  doc
    .moveDown()
    .fillColor("#000")
    .fontSize(14)
    .text(`Payslip for ${monthLabel(payslip.month)}`, { align: "center" });
  if (payslip.run?.status !== "FINALIZED") {
    doc.fontSize(10).fillColor("#b00").text("DRAFT - not final", { align: "center" }).fillColor("#000");
  }
  doc.moveDown();

  const field = (label, value) =>
    doc
      .fontSize(10)
      .fillColor("#555")
      .text(label, { continued: true, width: 160 })
      .fillColor("#000")
      .text(`  ${value ?? "-"}`);
  field("Payslip number", payslip.payslipNumber ?? "Assigned on finalization");
  field("Employee", payslip.employeeName);
  field("Employee code", payslip.employeeCode);
  field("Designation", payslip.designation ?? payslip.role);
  field("Bank account", payslip.bankAccountMasked ? `${payslip.bankAccountMasked} (${payslip.bankIfsc ?? "-"})` : null);
  field("PAN", payslip.panMasked);
  field("Days in month / LOP / paid", `${payslip.daysInMonth} / ${payslip.lopDays} / ${payslip.paidDays}`);
  doc.moveDown();

  const row = (label, amount, { bold = false } = {}) => {
    const y = doc.y;
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10);
    doc.text(label, left, y, { width: width - 140 });
    doc.text(formatMoney(amount, currency), left + width - 140, y, { width: 140, align: "right" });
    doc.font("Helvetica");
  };
  const section = title => doc.moveDown(0.5).font("Helvetica-Bold").fontSize(11).text(title, left).font("Helvetica");

  section("Earnings");
  for (const line of payslip.earnings) row(describeLine(line), line.amount);
  row("Total earnings", payslip.totalEarnings, { bold: true });
  if (payslip.lopAmount > 0) row(`Loss of pay (${payslip.lopDays} day(s))`, -payslip.lopAmount);
  row("Gross pay", payslip.grossPay, { bold: true });

  section("Deductions");
  for (const line of payslip.deductions) row(describeLine(line), line.amount);
  row("Total deductions", payslip.totalDeductions, { bold: true });

  doc.moveDown();
  row("Net pay", payslip.netPay, { bold: true });
  doc
    .moveDown(3)
    .fontSize(8)
    .fillColor("#555")
    .text("This is a computer-generated payslip and needs no signature.", left, doc.y, { width, align: "center" });
};

export const payslipService = {
  getById: async (ctx, payslipId) => {
    const payslip = await payslipRepository.findById(ctx.tenantId, payslipId, { with: withRun });
    if (!payslip) throw notFound("Payslip");
    return payslip;
  },

  mine: (ctx, { page, limit }) =>
    payslipRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withRun,
      conditions: ownFinalized(ctx),
      orderBy: desc(payslips.month)
    }),

  /* Another employee's (or a draft) payslip is reported as not found */
  getMine: async (ctx, payslipId) => {
    const payslip = await payslipRepository.findOne(ctx.tenantId, [eq(payslips.id, payslipId), ...ownFinalized(ctx)], {
      with: withRun
    });
    if (!payslip) throw notFound("Payslip");
    return payslip;
  },

  /* Printable payslip -> { buffer, fileName } */
  pdf: async (ctx, payslip) => {
    const tenant = await getTenant(ctx.tenantId);
    const buffer = await renderPdf(doc => drawPayslip(doc, payslip, tenant));
    const name = payslip.employeeCode ?? payslip.employeeName.replace(/\s+/g, "-");
    return { buffer, fileName: `payslip-${payslip.payslipNumber ?? `${payslip.month}-draft`}-${name}` };
  }
};
