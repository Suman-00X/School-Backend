import { and, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import { conflict } from "../../../../common/http/errors.js";
import { OVERLAP_CONSTRAINTS } from "../constants/hostel.constants.js";

/* Bookings (bed allocations, resource assignments) are inclusive date ranges [fromDate, toDate];
   toDate null means open-ended. Dates are "YYYY-MM-DD" strings, so they compare as text. */

/* SQL: the row's range shares at least one day with [from, to] (to null = open-ended).
   Same expression as the exclusion constraints, so the GiST index can serve it. */
export const overlapsRange = (table, from, to) =>
  sql`daterange(${table.fromDate}, ${table.toDate}, '[]') && daterange(${from}::date, ${to ?? null}::date, '[]')`;

/* SQL: the row is ACTIVE on this day */
export const coversDay = (table, day) =>
  and(lte(table.fromDate, day), or(isNull(table.toDate), sql`${table.toDate} >= ${day}`));

/* SQL for a derived phase */
export const phaseCondition = (table, phase, today) => {
  if (phase === "CANCELLED") return eq(table.status, "CANCELLED");
  const active = eq(table.status, "ACTIVE");
  if (phase === "UPCOMING") return and(active, gt(table.fromDate, today));
  if (phase === "ENDED") return and(active, lt(table.toDate, today));
  return and(active, coversDay(table, today));
};

/* SQL: still holds something today or later (current or upcoming) */
export const notEnded = (table, today) =>
  and(eq(table.status, "ACTIVE"), or(isNull(table.toDate), sql`${table.toDate} >= ${today}`));

export const phaseOf = (row, today) => {
  if (row.status === "CANCELLED") return "CANCELLED";
  if (row.fromDate > today) return "UPCOMING";
  if (row.toDate && row.toDate < today) return "ENDED";
  return "CURRENT";
};

/* Do two ranges share a day? (null end = open-ended) */
export const rangesOverlap = (a, b) => (!a.toDate || b.fromDate <= a.toDate) && (!b.toDate || a.fromDate <= b.toDate);

/* The later end of two (null = open-ended wins) */
export const laterEnd = (a, b) => (a === null || b === null ? null : a > b ? a : b);
/* The earlier end of two (null = open-ended loses) */
export const earlierEnd = (a, b) => (a === null ? b : b === null ? a : a < b ? a : b);

/* "from 2027-06-01 to 2028-03-31", "from 2027-06-01 (no end date)" */
export const describeRange = ({ fromDate, toDate }) =>
  toDate ? `from ${fromDate} to ${toDate}` : `from ${fromDate} (no end date)`;

/* The most holders on any one day of [from, to] among `rows` (each a range).
   Usage only rises when a range starts, so checking `from` and every later start is enough. */
export const peakUsage = (rows, from, to) => {
  const inRange = rows.filter(row => rangesOverlap(row, { fromDate: from, toDate: to }));
  const days = [from, ...inRange.map(row => row.fromDate).filter(day => day > from && (!to || day <= to))];
  let peak = 0;
  let peakDay = from;
  for (const day of days) {
    const holders = inRange.filter(row => row.fromDate <= day && (!row.toDate || row.toDate >= day)).length;
    if (holders > peak) [peak, peakDay] = [holders, day];
  }
  return { peak, day: peakDay };
};

const OVERLAP_MESSAGES = {
  [OVERLAP_CONSTRAINTS.BED]: "This bed was just booked for overlapping dates by another request; choose another bed",
  [OVERLAP_CONSTRAINTS.STUDENT]: "This student was just given a bed for overlapping dates by another request",
  [OVERLAP_CONSTRAINTS.RESOURCE_STUDENT]:
    "This student was just given this resource for overlapping dates by another request",
  [OVERLAP_CONSTRAINTS.PLAN]:
    "This student was just put on another plan of this kind for overlapping dates by another request"
};

/* Run a write that the exclusion constraints guard; an overlap they detect becomes a readable 409.
   Services check first under row locks, so this only fires when a request bypassed or raced them. */
export const guardOverlaps = async write => {
  try {
    return await write();
  } catch (error) {
    const pg = error?.cause?.code ? error.cause : error;
    if (pg?.code === "23P01" && OVERLAP_MESSAGES[pg.constraint]) throw conflict(OVERLAP_MESSAGES[pg.constraint]);
    throw error;
  }
};
