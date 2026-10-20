/* Codes of the official formats, so the files can be copied straight into them:
   - UDISE+: Data Capture Format 2025-26 (Ministry of Education), Part B "Student details",
     sections 4.1 (general profile), 4.2 (enrolment) and 4.5 (assessment and attendance)
   - APAAR: the mandatory fields listed by apaar.education.gov.in (FAQ 6) */

/* DCF 1.4: pre-primary grades are PP3 (Nursery), PP2 (LKG) and PP1 (UKG) */
export const UDISE_GRADE = {
  NURSERY: "PP3",
  LKG: "PP2",
  UKG: "PP1",
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`GRADE_${i + 1}`, String(i + 1)]))
};

/* 4.1.2 */
export const UDISE_GENDER = { MALE: 1, FEMALE: 2, OTHER: 3 };
export const APAAR_GENDER = { MALE: "Male", FEMALE: "Female", OTHER: "Transgender" };

/* 4.1.13 Social category (General-1, SC-2, ST-3, OBC-4) from the school's free text.
   State backward-class lists (BC-A, MBC, SEBC …) are OBC centrally; EWS is General (and 4.1.16). */
export const SOCIAL_CATEGORY = [
  { code: 1, match: /^(GEN|GENERAL|OC|OPEN|UR|UNRESERVED|EWS)$/ },
  { code: 2, match: /^SC$/ },
  { code: 3, match: /^ST$/ },
  { code: 4, match: /^(OBC|BC|MBC|EBC|SEBC|BCM)/ }
];

/* 4.1.14 Minority group from the religion: Muslim-1, Christian-2, Sikh-3, Buddhist-4,
   Parsi-5, Jain-6, any other religion Not applicable-7 */
export const MINORITY_GROUP = [
  { code: 1, match: /^(MUSLIM|ISLAM)/ },
  { code: 2, match: /^CHRISTIAN/ },
  { code: 3, match: /^SIKH/ },
  { code: 4, match: /^(NEO)?BUDDH/ },
  { code: 5, match: /^(PARSI|ZOROASTRIAN)/ },
  { code: 6, match: /^JAIN/ }
];
export const MINORITY_NOT_APPLICABLE = 7;

/* 4.1.12 Mother tongue, by the DCF's language codes (1.26) */
export const LANGUAGE_CODES = {
  "01": ["Assamese"],
  "02": ["Bengali", "Bangla"],
  "03": ["Gujarati"],
  "04": ["Hindi"],
  "05": ["Kannada"],
  "06": ["Kashmiri"],
  "07": ["Konkani"],
  "08": ["Malayalam"],
  "09": ["Manipuri", "Meitei", "Meiteilon"],
  10: ["Marathi"],
  11: ["Nepali"],
  12: ["Odia", "Oriya"],
  13: ["Punjabi"],
  14: ["Sanskrit"],
  15: ["Sindhi"],
  16: ["Tamil"],
  17: ["Telugu"],
  18: ["Urdu"],
  19: ["English"],
  20: ["Bodo"],
  22: ["Dogri"],
  23: ["Khasi"],
  24: ["Garo"],
  25: ["Mizo"],
  26: ["Bhutia"],
  27: ["Lepcha"],
  28: ["Limboo", "Limbu"],
  29: ["French"],
  30: ["Hmar"],
  31: ["Bishnupriya Manipuri"],
  32: ["Karbi"],
  39: ["Santhali", "Santali"],
  41: ["Angami"],
  42: ["Ao"],
  43: ["Arabic"],
  44: ["Bhoti"],
  45: ["Bodhi"],
  46: ["German"],
  47: ["Kakbarak", "Kokborok"],
  48: ["Konyak"],
  49: ["Laddakhi", "Ladakhi"],
  50: ["Lotha"],
  51: ["Maithili", "Maithali"],
  52: ["Nicobaree", "Nicobarese"],
  54: ["Persian"],
  55: ["Portuguese"],
  56: ["Rajasthani", "Marwari"],
  57: ["Russian"],
  58: ["Sema"],
  59: ["Spanish"],
  60: ["Tibetan"],
  61: ["Zeliang"],
  62: ["Mundari"],
  63: ["Khadia", "Kharia"],
  64: ["Kuruk", "Kurukh"],
  65: ["Ho"],
  71: ["Balti"],
  72: ["Purgi"]
};

/* 4.2.5 (a) Status in the previous academic year: 1 studied in the same school (the other
   options, another school 2, Anganwadi/ECCE 3 and none 4, the school picks on the portal) */
export const PREVIOUS_YEAR_SAME_SCHOOL = 1;

/* 4.5.1 (a) Result in the current year: Promoted/Passed-1, Detained/Not passed-3
   (compartment and pending results have no code until they are decided) */
export const UDISE_RESULT = { PASS: 1, FAIL: 3 };
