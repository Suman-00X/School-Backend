/* Money arithmetic in integer minor units (paise/cents) to avoid float errors.
   The database stores numeric(12,2); the API sends amounts as numbers with 2 decimals. */

export const toMinor = amount => Math.round(Number(amount ?? 0) * 100);

export const fromMinor = minor => Math.round(minor) / 100;

/* sum([10.1, 20.2]) -> 30.3 exactly */
export const sum = amounts => fromMinor(amounts.reduce((total, amount) => total + toMinor(amount), 0));

export const subtract = (a, b) => fromMinor(toMinor(a) - toMinor(b));

/* percentOf(1999.99, 12.5) -> 250 (rounded half-up to 2 decimals) */
export const percentOf = (amount, percent) => fromMinor(Math.round((toMinor(amount) * percent) / 100));

export const max = (a, b) => (toMinor(a) >= toMinor(b) ? a : b);

export const isPositive = amount => toMinor(amount) > 0;
