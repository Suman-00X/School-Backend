import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { attendanceService } from "../../../academics/attendance/index.js";
import { nepPolicyService } from "../../../academics/nep-policy/index.js";
import { reportCardService } from "../../../academics/report-cards/index.js";
import { sectionService } from "../../../academics/sections/index.js";
import { CLASS_LEVELS } from "../../../academics/shared/constants/academic.constants.js";
import {
  APAAR_GENDER,
  LANGUAGE_CODES,
  MINORITY_GROUP,
  MINORITY_NOT_APPLICABLE,
  PREVIOUS_YEAR_SAME_SCHOOL,
  SOCIAL_CATEGORY,
  UDISE_GENDER,
  UDISE_GRADE,
  UDISE_RESULT
} from "../constants/governmentExport.constants.js";
import { governmentExportQueries } from "../repositories/governmentExport.queries.js";

/* Student data for the government portals, for schools whose NEP policy opts in:
   UDISE+ (the student profile, SDMS) and APAAR (One Nation One Student ID). The UDISE+
   file follows the Data Capture Format 2025-26, Part B (4.1 general profile, 4.2 enrolment,
   4.5 assessment and attendance): its field numbers as headers and its codes as values,
   with the fields the school system does not hold left blank for the portal. The APAAR
   file follows the portal's mandatory fields. Aadhaar is never stored, so its columns stay
   blank (D-82). */

const fullName = r => [r.firstName, r.middleName, r.lastName].filter(Boolean).join(" ");

/* DD/MM/YYYY, as both portals take dates */
const dmy = iso => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/* The portals take a 10-digit mobile number: "+91 98800 01229" -> "9880001229" (others as digits) */
const tenDigits = phone => {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.replace(/^0(?=\d{10}$)/, "");
};
/* The family's distinct numbers: the mother's, father's, guardian's, then the student's */
const mobilesOf = r => [
  ...new Set([r.motherPhone, r.fatherPhone, r.guardianPhone, r.studentPhone].map(tenDigits).filter(Boolean))
];
const mobileOf = r => mobilesOf(r)[0] ?? "";

const pincodeOf = r => String(r.address ?? "").match(/\b\d{6}\b(?!.*\b\d{6}\b)/s)?.[0] ?? "";

const letters = text => String(text ?? "").toUpperCase().replace(/[^A-Z]/g, "");
const codeIn = (table, text) => table.find(entry => entry.match.test(letters(text)))?.code ?? null;

const categoryCode = r => (r.category ? codeIn(SOCIAL_CATEGORY, r.category) : null);
const minorityCode = r => (r.religion ? (codeIn(MINORITY_GROUP, r.religion) ?? MINORITY_NOT_APPLICABLE) : null);

const LANGUAGE_BY_NAME = new Map(
  Object.entries(LANGUAGE_CODES).flatMap(([code, names]) => names.map(name => [letters(name), code.padStart(2, "0")]))
);
const motherTongueCode = r => (r.motherTongue ? (LANGUAGE_BY_NAME.get(letters(r.motherTongue)) ?? null) : null);

const gradeOf = (level, className) => UDISE_GRADE[level] ?? className ?? "";
/* The class below a level (a promoted student new to the system studied there last year) */
const levelBelow = level => CLASS_LEVELS[CLASS_LEVELS.findIndex(l => l.level === level) - 1]?.level ?? null;

/* 4.2.5: from last year's enrolment here, else from how the student came into this class */
const previousYear = r => {
  if (r.previousLevel || r.previousClassName) return { status: PREVIOUS_YEAR_SAME_SCHOOL, grade: gradeOf(r.previousLevel, r.previousClassName) };
  if (r.admissionType === "REPEAT") return { status: PREVIOUS_YEAR_SAME_SCHOOL, grade: gradeOf(r.classLevel, r.className) };
  if (r.admissionType === "PROMOTED") return { status: PREVIOUS_YEAR_SAME_SCHOOL, grade: UDISE_GRADE[levelBelow(r.classLevel)] ?? "" };
  return { status: "", grade: "" };
};

/* What each file needs from a student, and how to tell it is missing */
const CHECKS = {
  dob: { label: "Date of birth", missing: r => !r.dob },
  gender: { label: "Gender", missing: r => !r.gender },
  motherName: { label: "Mother's name", missing: r => !r.motherName },
  fatherName: { label: "Father's name", missing: r => !r.fatherName && !r.guardianName },
  mobile: { label: "Mobile number", missing: r => !mobileOf(r) },
  pen: { label: "PEN", missing: r => !r.pen },
  apaarConsent: { label: "APAAR consent", missing: r => !r.apaarId && !r.apaarConsentOn },
  apaarId: { label: "APAAR id", missing: r => !r.apaarId }
};
/* APAAR: PEN is mandatory, as the id is generated against it */
const NEEDS = {
  udise: ["dob", "gender", "motherName", "fatherName", "mobile"],
  apaar: ["pen", "dob", "gender", "motherName", "fatherName", "mobile", "apaarConsent"]
};

const apaarStatus = r =>
  r.apaarId ? "APAAR id generated" : r.apaarConsentOn ? "Consent given, id pending" : "Consent pending";

const missingOf = (r, kind) => NEEDS[kind].filter(key => CHECKS[key].missing(r)).map(key => CHECKS[key].label);

/* Values the school holds that have no code in the format, to pick on the portal */
const uncoded = r => [
  r.category && !categoryCode(r) && `Social category "${r.category}" has no UDISE+ code`,
  r.motherTongue && !motherTongueCode(r) && `Mother tongue "${r.motherTongue}" has no UDISE+ code`
].filter(Boolean);

const yearOf = ctx => {
  if (!ctx.academicYear) throw unprocessable("No academic year for this export");
  return ctx.academicYear;
};

const studentsOf = async (ctx, { sectionId }) => {
  if (sectionId && !(await sectionService.findById(ctx, sectionId))) throw notFound("Section");
  return governmentExportQueries.students(ctx.tenantId, yearOf(ctx).id, { sectionId });
};

const scopeName = rows => (rows[0] && rows.every(r => r.sectionId === rows[0].sectionId) ? `${rows[0].className}-${rows[0].sectionName}` : null);

/* A column of the format the school system has no data for */
const blank = header => ({ key: header, header, value: () => "" });

/* Days attended this year (4.5.2), whole days, per student of the sections in the file */
const daysAttended = async (ctx, rows) => {
  const days = new Map();
  for (const sectionId of new Set(rows.map(r => r.sectionId))) {
    for (const s of (await attendanceService.sectionSummary(ctx, { sectionId })).students)
      if (s.marked) days.set(s.studentId, Math.floor(s.attendedDays));
  }
  return days;
};

export const governmentExportService = {
  /* How many students each file is ready for, and what is missing (one section or all) */
  readiness: async (ctx, { sectionId }) => {
    const policy = await nepPolicyService.find(ctx);
    const rows = await studentsOf(ctx, { sectionId });
    const missing = Object.fromEntries(
      Object.entries(CHECKS).map(([key, check]) => [key, rows.filter(check.missing).length])
    );
    const ready = kind => rows.filter(r => !missingOf(r, kind).length).length;
    return {
      academicYear: { id: ctx.academicYear.id, yearName: ctx.academicYear.yearName },
      udiseCode: policy.udiseCode ?? null,
      udiseExport: policy.udiseExport,
      apaarExport: policy.apaarExport,
      students: rows.length,
      ready: { udise: ready("udise"), apaar: ready("apaar") },
      apaar: {
        generated: rows.filter(r => r.apaarId).length,
        consentGiven: rows.filter(r => !r.apaarId && r.apaarConsentOn).length,
        consentPending: rows.filter(r => !r.apaarId && !r.apaarConsentOn).length
      },
      missing: Object.entries(missing).map(([key, count]) => ({ key, label: CHECKS[key].label, count })),
      /* The first students with gaps, to fix on their profiles */
      gaps: rows
        .map(r => ({
          studentId: r.studentId,
          name: fullName(r),
          section: `${r.className}-${r.sectionName}`,
          rollNumber: r.rollNumber,
          missing: [...new Set([...missingOf(r, "udise"), ...missingOf(r, "apaar")])]
        }))
        .filter(r => r.missing.length)
        .slice(0, 100)
    };
  },

  /* The UDISE+ student profile (DCF 4.1 and 4.2); with an exam, its result and the days
     attended so far (4.5), for the year-end progression */
  udise: async (ctx, { sectionId, examId }) => {
    const policy = await nepPolicyService.assertExport(ctx, "udise");
    const rows = await studentsOf(ctx, { sectionId });
    const year = yearOf(ctx);

    let exam = null;
    const resultOf = new Map();
    let attended = new Map();
    if (examId) {
      exam = await reportCardService.loadExam(ctx, examId);
      if (exam.academicYearId !== year.id) throw unprocessable("The exam is in another academic year");
      for (const sheet of await reportCardService.forExam(ctx, exam)) {
        if (sectionId && sheet.section.id !== sectionId) continue;
        for (const s of sheet.students)
          resultOf.set(s.studentId, { result: s.result, percentage: sheet.display.marks ? s.percentage : null });
      }
      attended = await daysAttended(ctx, rows);
    }
    const resultPending = r => exam && resultOf.has(r.studentId) && !UDISE_RESULT[resultOf.get(r.studentId).result];

    const scope = scopeName(rows);
    return {
      fileName: `udise-plus-students-${policy.udiseCode}-${scope ?? year.yearName}`,
      title: `UDISE+ student profile (DCF 2025-26, Part B): UDISE code ${policy.udiseCode}, ${scope ? `${scope}, ` : ""}${year.yearName}${exam ? `, result of ${exam.examName}` : ""}`,
      rows,
      columns: [
        { key: "academicYear", header: "Academic Year", value: () => year.yearName },
        { key: "udiseCode", header: "UDISE Code of School", width: 14, value: () => policy.udiseCode },
        { key: "grade", header: "Grade/Class", value: r => gradeOf(r.classLevel, r.className) },
        { key: "sectionName", header: "Section" },
        { key: "rollNumber", header: "Section Roll No." },
        { key: "pen", header: "Student National Code (PEN)", width: 16 },
        /* 4.1 General profile */
        { key: "name", header: "4.1.1 Name of the Student (in Capital Letters)", width: 28, value: r => fullName(r).toUpperCase() },
        { key: "gender", header: "4.1.2 Gender (1-Male, 2-Female, 3-Transgender)", value: r => UDISE_GENDER[r.gender] ?? "" },
        { key: "dob", header: "4.1.3 Date of Birth (DD/MM/YYYY)", width: 14, value: r => dmy(r.dob) },
        { key: "motherName", header: "4.1.4 Mother's Name", width: 22 },
        { key: "fatherName", header: "4.1.5 Father's Name", width: 22 },
        { key: "guardianName", header: "4.1.6 Guardian's Name", width: 22 },
        blank("4.1.7 Aadhaar Number of Student"),
        blank("4.1.8 Name of Student as per Aadhaar Card"),
        { key: "address", header: "4.1.9 (a) Address", width: 30 },
        { key: "pincode", header: "4.1.9 (b) Pincode", value: pincodeOf },
        { key: "mobile", header: "4.1.10 (a) Mobile Number (of Student/Parent/Guardian)", width: 16, value: mobileOf },
        { key: "alternateMobile", header: "4.1.10 (b) Alternate Mobile Number", width: 16, value: r => mobilesOf(r)[1] ?? "" },
        { key: "email", header: "4.1.11 Contact email-id (of Student/Parent/Guardian)", width: 26 },
        { key: "motherTongue", header: "4.1.12 Mother Tongue of the Student (language code)", value: r => motherTongueCode(r) ?? "" },
        { key: "category", header: "4.1.13 Social Category (1-General, 2-SC, 3-ST, 4-OBC)", value: r => categoryCode(r) ?? "" },
        {
          key: "minority",
          header: "4.1.14 Minority Group (1-Muslim, 2-Christian, 3-Sikh, 4-Buddhist, 5-Parsi, 6-Jain, 7-Not Applicable)",
          value: r => minorityCode(r) ?? ""
        },
        blank("4.1.15 Whether BPL beneficiary? (1-Yes, 2-No)"),
        blank("4.1.15 (a) Whether AAY beneficiary? (1-Yes, 2-No)"),
        { key: "ews", header: "4.1.16 Whether belongs to EWS / Disadvantaged Group? (1-Yes, 2-No)", value: r => (letters(r.category) === "EWS" ? 1 : "") },
        blank("4.1.17 Whether CWSN? (1-Yes, 2-No)"),
        blank("4.1.17 (a) Type of impairment (code)"),
        blank("4.1.17 (b) Whether having Disability Certificate (1-Yes, 2-No)"),
        blank("4.1.17 (b) Disability Percentage (in %)"),
        blank("4.1.18 Whether the Student is Indian National? (1-Yes, 2-No)"),
        blank("4.1.19 Identified as Out-of-School-Child? (1-Yes, 2-No)"),
        blank("4.1.19 (a) When mainstreamed? (1-Current year, 2-Earlier year)"),
        { key: "bloodGroup", header: "4.1.20 Blood Group" },
        /* 4.2 Enrolment in the present school */
        { key: "admissionNumber", header: "4.2.1 Admission Number in Present School", width: 16 },
        { key: "admissionDate", header: "4.2.2 Admission Date (DD/MM/YYYY) in Present School", width: 14, value: r => dmy(r.admissionDate) },
        blank("4.2.3 (a) Medium of Instruction of the Student"),
        blank("4.2.3 (b) Language Group Studied by the Student"),
        blank("4.2.4 Academic Stream (1-Arts, 2-Science, 3-Commerce, 4-Vocational, 5-Other)"),
        {
          key: "previousStatus",
          header: "4.2.5 (a) Status in Previous Academic Year (1-Same School, 2-Other School, 3-Anganwadi/ECCE, 4-None)",
          value: r => previousYear(r).status
        },
        { key: "previousGrade", header: "4.2.5 (b) Grade/Class Studied in the Previous Academic Year", value: r => previousYear(r).grade },
        blank("4.2.6 (a) Whether Admitted under Section 12C of RTE Act? (1-Yes, 2-No)"),
        blank("4.2.6 (b) Amount Claimed from Government for RTE entitlement"),
        /* 4.5 Assessment and attendance, current year (with an exam) */
        {
          key: "result",
          header: "4.5.1 (a) Result (1-Promoted/Passed, 3-Detained/Not Passed, 4-Promoted without Exam, 5-Dropout, 6-Repeater by Choice)",
          width: 18,
          value: r => UDISE_RESULT[resultOf.get(r.studentId)?.result] ?? ""
        },
        { key: "percentage", header: "4.5.1 (b) % of Overall Marks Obtained", value: r => resultOf.get(r.studentId)?.percentage ?? "" },
        { key: "daysAttended", header: "4.5.2 No. of Days Child Attended School", value: r => attended.get(r.studentId) ?? "" },
        {
          key: "check",
          header: "To check before upload (not part of the format)",
          width: 40,
          value: r =>
            [
              ...missingOf(r, "udise").map(label => `${label} missing`),
              ...uncoded(r),
              ...(resultPending(r) ? ["Result not decided yet"] : [])
            ].join("; ")
        }
      ]
    };
  },

  /* Students for APAAR generation and verification (pending: only those without an id yet),
     with the portal's mandatory fields in its order */
  apaar: async (ctx, { sectionId, pending }) => {
    const policy = await nepPolicyService.assertExport(ctx, "apaar");
    const all = await studentsOf(ctx, { sectionId });
    const rows = pending ? all.filter(r => !r.apaarId) : all;
    const scope = scopeName(all);
    const year = yearOf(ctx);
    return {
      fileName: `apaar-${pending ? "pending-" : ""}${scope ?? year.yearName}`,
      title: `APAAR ${pending ? "pending " : ""}students: ${scope ? `${scope}, ` : ""}${year.yearName}`,
      rows,
      columns: [
        ...(policy.udiseCode ? [{ key: "udiseCode", header: "UDISE Code of School", width: 14, value: () => policy.udiseCode }] : []),
        { key: "grade", header: "Grade/Class", value: r => gradeOf(r.classLevel, r.className) },
        { key: "sectionName", header: "Section" },
        { key: "rollNumber", header: "Roll No." },
        { key: "admissionNumber", header: "Admission No.", width: 16 },
        { key: "pen", header: "PEN (UDISE+ Student ID)", width: 16 },
        { key: "name", header: "Student Name (as in UDISE+)", width: 28, value: r => fullName(r).toUpperCase() },
        { key: "dob", header: "Date of Birth (DD/MM/YYYY)", width: 14, value: r => dmy(r.dob) },
        { key: "gender", header: "Gender", value: r => APAAR_GENDER[r.gender] ?? "" },
        { key: "mobile", header: "Mobile Number", width: 16, value: mobileOf },
        { key: "motherName", header: "Mother's Name", width: 22 },
        { key: "fatherName", header: "Father's Name", width: 22 },
        blank("Name as per Aadhaar"),
        blank("Aadhaar Number"),
        { key: "consent", header: "Parental Consent", width: 16, value: r => (r.apaarId || r.apaarConsentOn ? "Consent given" : "Consent pending") },
        { key: "apaarConsentOn", header: "Consent Given On (DD/MM/YYYY)", width: 16, value: r => dmy(r.apaarConsentOn) },
        { key: "apaarId", header: "APAAR ID", width: 16 },
        { key: "apaarStatus", header: "APAAR Status", width: 24, value: apaarStatus },
        {
          key: "check",
          header: "To check before generating (not part of the format)",
          width: 40,
          value: r => missingOf(r, "apaar").map(label => `${label} missing`).join("; ")
        }
      ]
    };
  }
};
