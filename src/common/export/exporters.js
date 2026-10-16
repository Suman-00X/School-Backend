import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { useUnicodeFonts } from "./fonts.js";

/* Tabular exports. `columns` = [{ key, header, width? , value?(row) }] */

const cellValue = (row, column) => {
  const value = column.value ? column.value(row) : row[column.key];
  return value === null || value === undefined ? "" : value;
};

/* RFC 4180 CSV; formula-like cells are prefixed to prevent spreadsheet injection */
export const toCsv = (rows, columns) => {
  const escape = value => {
    let text = String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = [columns.map(c => escape(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map(c => escape(cellValue(row, c))).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
};

export const toXlsx = async (rows, columns, { sheetName = "Sheet1", title } = {}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
  if (title) {
    sheet.addRow([title]).font = { bold: true, size: 14 };
    sheet.addRow([]);
  }
  const header = sheet.addRow(columns.map(c => c.header));
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
  for (const row of rows) sheet.addRow(columns.map(c => cellValue(row, c)));
  columns.forEach((c, index) => {
    sheet.getColumn(index + 1).width = c.width ?? Math.max(12, String(c.header).length + 4);
  });
  sheet.views = [{ state: "frozen", ySplit: title ? 3 : 1 }];
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

/* Build a PDF with pdfkit: renderPdf(doc => { doc.text("Hello") }) -> Buffer.
   Unicode fonts are set up for every document (fonts.js). */
export const renderPdf = (draw, options = {}) =>
  new Promise((resolve, reject) => {
    const doc = useUnicodeFonts(new PDFDocument({ size: "A4", margin: 40, ...options }));
    const chunks = [];
    doc.on("data", chunk => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      draw(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });

export const EXPORT_FORMATS = {
  csv: { contentType: "text/csv; charset=utf-8", extension: "csv" },
  xlsx: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" },
  pdf: { contentType: "application/pdf", extension: "pdf" }
};

/* Send a generated file as a download */
export const sendFile = (res, { buffer, fileName, format }) => {
  const { contentType, extension } = EXPORT_FORMATS[format];
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(`${fileName}.${extension}`)}"`);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(buffer);
};

/* rows + columns + format -> download */
export const sendTable = async (res, { rows, columns, format, fileName, title }) => {
  const buffer =
    format === "xlsx" ? await toXlsx(rows, columns, { sheetName: fileName, title }) : Buffer.from(toCsv(rows, columns));
  return sendFile(res, { buffer, fileName, format: format === "xlsx" ? "xlsx" : "csv" });
};
