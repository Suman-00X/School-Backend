/* How certificates write dates, numbers and the student's pronouns */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen"
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const ORDINAL_ONES = [
  "",
  "First",
  "Second",
  "Third",
  "Fourth",
  "Fifth",
  "Sixth",
  "Seventh",
  "Eighth",
  "Ninth",
  "Tenth",
  "Eleventh",
  "Twelfth",
  "Thirteenth",
  "Fourteenth",
  "Fifteenth",
  "Sixteenth",
  "Seventeenth",
  "Eighteenth",
  "Nineteenth"
];
const ORDINAL_TENS = { 2: "Twentieth", 3: "Thirtieth" };

const parts = iso => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? match.slice(1).map(Number) : null;
};

/* 0..9999 in words: 2015 -> "Two Thousand Fifteen" */
const inWords = n => {
  if (n < 20) return ONES[n];
  if (n < 100) return [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(" ");
  if (n < 1000) return [`${ONES[Math.floor(n / 100)]} Hundred`, inWords(n % 100)].filter(Boolean).join(" ");
  return [`${inWords(Math.floor(n / 1000))} Thousand`, inWords(n % 1000)].filter(Boolean).join(" ");
};

/* 1..31: 21 -> "Twenty First" */
const dayInWords = day => {
  if (day < 20) return ORDINAL_ONES[day];
  if (day % 10 === 0) return ORDINAL_TENS[day / 10];
  return `${TENS[Math.floor(day / 10)]} ${ORDINAL_ONES[day % 10]}`;
};

/* "2015-08-14" -> "14/08/2015" */
export const shortDate = iso => {
  const p = parts(iso);
  return p ? `${String(p[2]).padStart(2, "0")}/${String(p[1]).padStart(2, "0")}/${p[0]}` : "";
};

/* "2015-08-14" -> "14 August 2015" */
export const longDate = iso => {
  const p = parts(iso);
  return p ? `${p[2]} ${MONTHS[p[1] - 1]} ${p[0]}` : "";
};

/* "2015-08-14" -> "Fourteenth August Two Thousand Fifteen" */
export const dateInWords = iso => {
  const p = parts(iso);
  return p ? `${dayInWords(p[2])} ${MONTHS[p[1] - 1]} ${inWords(p[0])}` : "";
};

const PRONOUNS = {
  MALE: { gender: "Male", heShe: "He", hisHer: "his", himHer: "him", sonDaughter: "son" },
  FEMALE: { gender: "Female", heShe: "She", hisHer: "her", himHer: "her", sonDaughter: "daughter" },
  OTHER: { gender: "Other", heShe: "He/She", hisHer: "his/her", himHer: "him/her", sonDaughter: "ward" }
};
const UNKNOWN = { gender: "", heShe: "He/She", hisHer: "his/her", himHer: "him/her", sonDaughter: "son/daughter" };

export const pronounsOf = gender => PRONOUNS[gender] ?? UNKNOWN;
