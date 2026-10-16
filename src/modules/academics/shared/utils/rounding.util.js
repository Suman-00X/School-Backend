/* Decimal rounding for percentages and GPA, by a result policy's mode:
   HALF_UP 2.345 -> 2.35, HALF_EVEN 2.345 -> 2.34, UP 2.341 -> 2.35, DOWN 2.349 -> 2.34.
   The value is scaled and cleaned to 9 places first, so 1.005 * 100 is 100.5, not 100.4999. */
export const roundTo = (value, decimals = 2, mode = "HALF_UP") => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const factor = 10 ** decimals;
  const scaled = Number((value * factor).toFixed(9));
  const sign = scaled < 0 ? -1 : 1;
  const magnitude = Math.abs(scaled);
  const floor = Math.floor(magnitude);
  const fraction = Number((magnitude - floor).toFixed(9));

  let rounded;
  switch (mode) {
    case "UP":
      rounded = fraction > 0 ? floor + 1 : floor;
      break;
    case "DOWN":
      rounded = floor;
      break;
    case "HALF_EVEN":
      rounded = fraction > 0.5 || (fraction === 0.5 && floor % 2 === 1) ? floor + 1 : floor;
      break;
    default:
      rounded = fraction >= 0.5 ? floor + 1 : floor;
  }
  return (sign * rounded) / factor;
};
