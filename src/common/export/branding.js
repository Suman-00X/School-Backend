import { storage } from "../storage/storage.js";

const isPng = buffer => buffer.subarray(0, 4).toString("hex") === "89504e47";
const isJpeg = buffer => buffer.subarray(0, 2).toString("hex") === "ffd8";

/* The school logo as bytes PDFKit can embed (PNG/JPEG), or null */
export const logoBytes = async tenant => {
  if (!tenant?.logoKey) return null;
  try {
    const chunks = [];
    for await (const chunk of await storage.getStream(tenant.logoKey)) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    return isPng(buffer) || isJpeg(buffer) ? buffer : null;
  } catch {
    return null;
  }
};

/* Logo (if any) + school name + address, centred, at the top of a PDF page */
export const drawLetterhead = (doc, tenant, logo) => {
  if (logo) {
    doc.image(logo, (doc.page.width - 56) / 2, doc.y, { fit: [56, 56] });
    doc.moveDown(4.2);
  }
  doc
    .fontSize(18)
    .fillColor("#000")
    .text(tenant?.name ?? "School", { align: "center" });
  if (tenant?.address) doc.fontSize(9).fillColor("#555").text(tenant.address, { align: "center" });
  doc.fillColor("#000");
};
