import { drawLetterhead, logoBytes } from "../../../../common/export/branding.js";
import { renderPdf } from "../../../../common/export/exporters.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { toMinor } from "../../../../common/money/money.js";
import { getTenant } from "../../../../common/tenancy/tenant.service.js";
import { EXECUTED_REFUND_STATUSES } from "../../shared/constants/finance.constants.js";
import { dateIn } from "../../shared/utils/date.util.js";
import { formatAmount } from "../../shared/utils/money.util.js";
import { refundService } from "./refund.service.js";

const nameOf = person => `${person?.firstName ?? ""} ${person?.lastName ?? ""}`.trim() || null;

const METHODS = {
  ORIGINAL: "Back to the card, UPI or bank account that paid (payment gateway)",
  CASH: "Cash",
  CHEQUE: "Cheque",
  UPI: "UPI",
  BANK_TRANSFER: "Bank transfer"
};

/* A printable receipt for money paid back: what was refunded from which payment and invoice,
   how the amount was split (taken off the invoice / from the student's credit), how it was
   paid back, and who requested and approved it. A refund still pending at the gateway says
   so in its title. Requests, rejected and failed refunds have no receipt. */
export const refundReceiptService = {
  pdf: async (ctx, refundId) => {
    const refund = await refundService.getById(ctx, refundId);
    if (!EXECUTED_REFUND_STATUSES.includes(refund.status)) {
      throw unprocessable(
        refund.status === "REQUESTED"
          ? `Refund ${refund.refundNumber} is waiting for approval; its receipt is available once it is processed`
          : `Refund ${refund.refundNumber} was ${refund.status === "REJECTED" ? "rejected" : "reversed after the gateway failed to pay it"}; it has no receipt`
      );
    }
    const tenant = await getTenant(ctx.tenantId);
    const timezone = tenant?.timezone ?? "UTC";
    const format = amount => formatAmount(amount, tenant?.currency ?? "INR");
    const pending = refund.status === "PENDING";
    const fromGateway = refund.source === "GATEWAY";
    const logo = await logoBytes(tenant);

    const buffer = await renderPdf(doc => {
      drawLetterhead(doc, tenant, logo);
      doc
        .moveDown()
        .fillColor("#000")
        .fontSize(14)
        .text(pending ? "Refund Receipt (pending at the payment gateway)" : "Refund Receipt", { align: "center" });
      doc.moveDown();

      /* Label and value side by side; a long value wraps in its own column */
      const left = doc.page.margins.left;
      const valueWidth = doc.page.width - doc.page.margins.right - left - 170;
      const field = (label, value) => {
        const y = doc.y;
        doc.fontSize(10).fillColor("#555").text(label, left, y, { width: 160 });
        const labelBottom = doc.y;
        doc.fillColor("#000").text(String(value ?? "-"), left + 170, y, { width: valueWidth });
        doc.x = left;
        doc.y = Math.max(doc.y, labelBottom);
      };
      field("Refund number", refund.refundNumber);
      field("Date", dateIn(timezone, refund.processedAt ?? refund.approvedAt ?? refund.createdAt));
      field("Status", pending ? "PENDING - the payment gateway is completing it" : "PROCESSED");
      field("Student", nameOf(refund.student?.user));
      field("Admission number", refund.student?.admissionNumber);
      field(
        "Original payment",
        `Receipt ${refund.payment?.receiptNumber} of ${format(refund.payment?.amount)}, paid ${dateIn(timezone, refund.payment?.paidAt)}`
      );
      field("Invoice", refund.invoice?.invoiceNumber);
      if (refund.reason) field("Reason", refund.reason);

      doc.moveDown();
      doc
        .fontSize(13)
        .fillColor("#000")
        .text(`Amount refunded: ${format(refund.amount)}`);
      doc.fontSize(10);
      field("Taken off the invoice", format(refund.fromInvoice));
      field("From the student's credit", format(refund.fromCredit));
      if (toMinor(refund.unallocated)) field("Not attributed (under review)", format(refund.unallocated));

      doc.moveDown();
      field("Paid back by", METHODS[refund.method] ?? refund.method);
      if (refund.reference) field("Reference", refund.reference);
      if (refund.gatewayRefundId) field("Gateway refund id", refund.gatewayRefundId);
      field("Requested by", fromGateway ? "The payment gateway's dashboard" : nameOf(refund.requester));
      field("Approved by", fromGateway ? "Not needed (made in the gateway's dashboard)" : nameOf(refund.approver));
      if (pending) {
        doc
          .moveDown()
          .fontSize(10)
          .fillColor("#a15c00")
          .text(
            "The payment gateway has accepted this refund and is still completing it. Banks usually take 5-7 working days."
          );
      }
      doc
        .moveDown(3)
        .fontSize(8)
        .fillColor("#555")
        .text("This is a computer-generated receipt and needs no signature.", { align: "center" });
    });

    return { buffer, fileName: refund.refundNumber };
  }
};
