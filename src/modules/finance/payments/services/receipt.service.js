import { drawLetterhead, logoBytes } from "../../../../common/export/branding.js";
import { renderPdf } from "../../../../common/export/exporters.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { toMinor } from "../../../../common/money/money.js";
import { getTenant } from "../../../../common/tenancy/tenant.service.js";
import { concessionSummary, invoiceService } from "../../invoices/index.js";
import { formatAmount } from "../../shared/utils/money.util.js";
import { paymentService } from "./payment.service.js";

/* Fee lines as a small table: head, gross, concession, net */
const drawLines = (doc, lines, format) => {
  const left = doc.page.margins.left;
  const columns = [
    { header: "Fee", x: left, width: 215, align: "left" },
    { header: "Gross", x: left + 215, width: 100, align: "right" },
    { header: "Concession", x: left + 315, width: 100, align: "right" },
    { header: "Net", x: left + 415, width: 100, align: "right" }
  ];
  const row = (values, { bold = false, color = "#000" } = {}) => {
    const y = doc.y;
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(9)
      .fillColor(color);
    columns.forEach((column, index) =>
      doc.text(values[index], column.x, y, { width: column.width, align: column.align, lineBreak: false })
    );
    doc.moveDown(0.6);
    doc.x = left;
  };
  row(
    columns.map(c => c.header),
    { bold: true, color: "#555" }
  );
  for (const line of lines) {
    row([
      line.description,
      format(line.amount),
      toMinor(line.discount) ? `- ${format(line.discount)}` : "-",
      format(line.netAmount)
    ]);
    for (const concession of line.concessions ?? []) {
      row([`    ${concession.name}`, "", `- ${format(concession.amount)}`, ""], { color: "#555" });
    }
  }
  doc.font("Helvetica");
};

/* A printable receipt for a successful payment: what the invoice charged (with the
   concessions applied and any late fee or waiver), and what this payment paid */
export const receiptService = {
  pdf: async (ctx, paymentId) => {
    const payment = await paymentService.getById(ctx, paymentId);
    if (payment.status !== "SUCCEEDED") throw unprocessable("Receipts are available only for successful payments");
    const invoice = await invoiceService.findDetailed(ctx, payment.invoiceId);
    const tenant = await getTenant(ctx.tenantId);
    const format = amount => formatAmount(amount, tenant?.currency ?? "INR");
    const student = payment.student;
    const concessions = concessionSummary(invoice.lines);
    const applied = Number(payment.amount) - Number(payment.excessAmount);

    const logo = await logoBytes(tenant);

    const buffer = await renderPdf(doc => {
      drawLetterhead(doc, tenant, logo);
      doc.moveDown().fillColor("#000").fontSize(14).text("Fee Receipt", { align: "center" });
      doc.moveDown();

      const field = (label, value) => {
        doc
          .fontSize(10)
          .fillColor("#555")
          .text(label, { continued: true, width: 160 })
          .fillColor("#000")
          .text(`  ${value ?? "-"}`);
      };
      field("Receipt number", payment.receiptNumber);
      field("Date", new Date(payment.paidAt).toISOString().slice(0, 10));
      field("Student", `${student?.user?.firstName ?? ""} ${student?.user?.lastName ?? ""}`.trim());
      field("Admission number", student?.admissionNumber);
      field("Invoice", `${invoice.invoiceNumber} (${invoice.installment?.name ?? ""}, due ${invoice.dueDate})`);
      field("Installment plan", invoice.plan?.name);
      field("Payment method", payment.method + (payment.reference ? ` (${payment.reference})` : ""));

      doc.moveDown();
      drawLines(doc, invoice.lines, format);
      doc.moveDown(0.5);

      field("Gross", format(invoice.subtotal));
      if (concessions.length) {
        field("Concessions applied", concessions.map(c => `${c.name} (- ${format(c.amount)})`).join(", "));
      }
      if (toMinor(invoice.lateFee)) field("Late fee", format(invoice.lateFee));
      if (invoice.lateFeeWaivedAt) {
        field("Late fee waived", `${format(invoice.lateFeeWaivedAmount)} (${invoice.lateFeeWaiverReason ?? ""})`);
      }
      field("Invoice total", format(invoice.total));

      doc.moveDown();
      doc
        .fontSize(13)
        .fillColor("#000")
        .text(`Amount received: ${format(payment.amount)}`);
      if (toMinor(payment.excessAmount)) {
        doc.fontSize(10).text(`Applied to this invoice: ${format(applied)}`);
        doc.text(`Kept as credit for later fees: ${format(payment.excessAmount)}`);
      }
      doc
        .fontSize(10)
        .fillColor("#555")
        .text(`Invoice balance after this payment: ${format(payment.balanceAfter ?? invoice.balance)}`);
      /* Refunds have their own receipts; this one says that money went back */
      if (toMinor(payment.refundedAmount)) {
        doc.text(`Refunded from this payment since: ${format(payment.refundedAmount)} (see the refund receipts)`);
      }
      doc
        .moveDown(3)
        .fontSize(8)
        .text("This is a computer-generated receipt and needs no signature.", { align: "center" });
    });

    return { buffer, fileName: payment.receiptNumber };
  }
};
