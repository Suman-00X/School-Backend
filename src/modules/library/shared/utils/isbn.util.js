/* ISBNs are stored without hyphens or spaces: "0306406152", "9780306406157" */
export const normalizeIsbn = value => String(value).replace(/[\s-]/g, "").toUpperCase();

/* ISBN-10: weights 10..1, sum divisible by 11; the check digit may be X (= 10) */
const isIsbn10 = isbn => {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  const total = [...isbn].reduce((acc, char, i) => acc + (char === "X" ? 10 : Number(char)) * (10 - i), 0);
  return total % 11 === 0;
};

/* ISBN-13 (EAN-13, 978/979 prefix): alternating weights 1 and 3, sum divisible by 10 */
const isIsbn13 = isbn => {
  if (!/^97[89]\d{10}$/.test(isbn)) return false;
  const total = [...isbn].reduce((acc, char, i) => acc + Number(char) * (i % 2 ? 3 : 1), 0);
  return total % 10 === 0;
};

/* Takes a normalized ISBN */
export const isValidIsbn = isbn => isIsbn10(isbn) || isIsbn13(isbn);
