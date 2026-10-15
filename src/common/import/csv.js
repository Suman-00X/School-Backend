import { parse } from "csv-parse/sync";
import { badRequest } from "../http/errors.js";

/* Parse an uploaded CSV into objects keyed by header (trimmed, BOM-safe).
   Header names are normalised to camelCase: "First Name" -> firstName. */
const toKey = header =>
  header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, "");

export const parseCsv = (buffer, { maxRows = 5000 } = {}) => {
  let records;
  try {
    records = parse(buffer, {
      bom: true,
      columns: headers => headers.map(toKey),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    });
  } catch (error) {
    throw badRequest(`The CSV file could not be read: ${error.message}`);
  }
  if (!records.length) throw badRequest("The CSV file has no data rows");
  if (records.length > maxRows) throw badRequest(`The CSV file has ${records.length} rows; the limit is ${maxRows}`);

  /* Empty cells become undefined so optional fields validate cleanly */
  return records.map(record =>
    Object.fromEntries(Object.entries(record).map(([key, value]) => [key, value === "" ? undefined : value]))
  );
};
