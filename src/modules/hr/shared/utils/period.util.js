import { daysBetween } from "../../../../common/utils/date.util.js";

const pad2 = n => String(n).padStart(2, "0");

/* "2026-09" -> { month, start: "2026-09-01", end: "2026-09-30", days: 30 } */
export const monthBounds = month => {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { month, start: `${month}-01`, end: `${month}-${pad2(days)}`, days };
};

/* "2026-09-14" -> "2026-09" */
export const monthOf = date => date.slice(0, 7);

/* "2026-09" -> "September 2026" */
export const monthLabel = month =>
  new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`)
  );

/* Inclusive number of calendar days in [from, to] */
export const spanDays = (from, to) => daysBetween(from, to) + 1;
