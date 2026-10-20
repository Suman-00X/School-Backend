/* Calendar-date helpers for "YYYY-MM-DD" strings (no time zones involved) */

/* "2026-06-01" or a Date -> "26" */
export const toYearYY = value => {
  const year = typeof value === "string" ? value.slice(0, 4) : String(new Date(value).getUTCFullYear());
  return year.slice(-2);
};

const parse = dateString => new Date(`${dateString}T00:00:00Z`);
const format = date => date.toISOString().slice(0, 10);

/* Today's date in a time zone, e.g. todayIn("Asia/Kolkata") -> "2026-10-16" */
export const todayIn = (timeZone = "UTC") =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/* The hour (0–23) it is now in a time zone */
export const hourIn = (timeZone = "UTC") =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date()));

/* The time it is now in a time zone, e.g. "09:05:00" (comparable with Postgres time columns) */
export const timeIn = (timeZone = "UTC") =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).format(new Date());

/* 0 = Sunday … 6 = Saturday */
export const dayOfWeek = dateString => parse(dateString).getUTCDay();

/* ISO weekday: 1 = Monday … 7 = Sunday */
export const isoWeekday = dateString => dayOfWeek(dateString) || 7;

export const addDays = (dateString, days) => {
  const date = parse(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return format(date);
};

/* Every date from `from` to `to`, inclusive */
export const eachDay = (from, to) => {
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
};

/* The same day `months` later, clamped to the month's end: addMonths("2026-01-31", 1) -> "2026-02-28" */
export const addMonths = (dateString, months) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return format(target);
};

export const daysBetween = (from, to) => Math.round((parse(to) - parse(from)) / 86_400_000);

export const maxDate = (a, b) => (a > b ? a : b);
export const minDate = (a, b) => (a < b ? a : b);
