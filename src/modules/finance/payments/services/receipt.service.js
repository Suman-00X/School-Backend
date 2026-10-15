import { drawLetterhead, logoBytes } from "../../../../common/export/branding.js";
import { renderPdf } from "../../../../common/export/exporters.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { getTenant } from "../../../../common/tenancy/tenant.service.js";
import { paymentService } from "./payment.service.js";

const formatMoney = (amount, currency) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: currency ?? "INR" }).format(amount);

/* A printable receipt for a successful payment */
export const receiptService = {
  pdf: async (ctx, paymentId) => {
    const payment = await paymentService.getById(ctx, paymentId);
    if (payment.status !== "SUCCEEDED") throw unprocessable("Receipts are available only for successful payments");
    const tenant = await getTenant(ctx.tenantId);
    const student = payment.student;

    const logo = await logoBytes(tenant);

    const buffer = await renderPdf(doc => {
      drawLetterhead(doc, tenant, logo);
      doc.moveDown().fillColor("#000").fontSize(14).text("Fee Receipt", { align: "center" });
      doc.moveDown();

      const row = (label, value) => {
        doc
          .fontSize(10)
          .fillColor("#555")
          .text(label, { continued: true, width: 160 })
          .fillColor("#000")
          .text(`  ${value ?? "-"}`);
      };
      row("Receipt number", payment.receiptNumber);
      row("Date", new Date(payment.paidAt).toISOString().slice(0, 10));
      row("Student", `${student?.user?.firstName ?? ""} ${student?.user?.lastName ?? ""}`.trim());
      row("Admission number", student?.admissionNumber);
      row("Invoice", payment.invoice?.invoiceNumber);
      row("Payment method", payment.method + (payment.reference ? ` (${payment.reference})` : ""));
      doc.moveDown();
      doc.fontSize(13).text(`Amount received: ${formatMoney(payment.amount, tenant?.currency)}`);
      doc
        .fontSize(10)
        .fillColor("#555")
        .text(`Invoice balance after this payment: ${formatMoney(payment.invoice?.balance ?? 0, tenant?.currency)}`);
      doc
        .moveDown(3)
        .fontSize(8)
        .text("This is a computer-generated receipt and needs no signature.", { align: "center" });
    });

    return { buffer, fileName: payment.receiptNumber };
  }
};
