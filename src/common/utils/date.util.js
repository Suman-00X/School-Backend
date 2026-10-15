/* "2026-06-01" or a Date -> "26" */
export const toYearYY = value => {
  const year = typeof value === "string" ? value.slice(0, 4) : String(new Date(value).getUTCFullYear());
  return year.slice(-2);
};
