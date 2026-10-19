import { addDays, addMonths } from "../../../../common/utils/date.util.js";

/* The longest a school year may run: start + 13 months − 1 day (2026-06-01 → 2027-06-30) */
export const MAX_YEAR_MONTHS = 13;

/* The name of a year, from its dates: "2026-27" when it runs into the next calendar year,
   "2026" when it starts and ends in the same one */
export const yearNameFor = (startDate, endDate) => {
  const start = startDate.slice(0, 4);
  const end = endDate.slice(0, 4);
  return start === end ? start : `${start}-${end.slice(2)}`;
};

/* Why the dates cannot make a school year, or null */
export const yearDatesProblem = (startDate, endDate) => {
  if (endDate <= startDate) return "endDate must be after startDate";
  if (Number(endDate.slice(0, 4)) > Number(startDate.slice(0, 4)) + 1) {
    return `An academic year spans at most two calendar years: ${startDate} to ${endDate} spans more`;
  }
  const latestEnd = addDays(addMonths(startDate, MAX_YEAR_MONTHS), -1);
  if (endDate > latestEnd) {
    return `An academic year lasts at most ${MAX_YEAR_MONTHS} months: starting ${startDate}, it must end by ${latestEnd}`;
  }
  return null;
};
