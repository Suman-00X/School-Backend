import { unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { studentService } from "../../../users/students/index.js";
import { academicYearService } from "../../academic-years/index.js";
import { certificateDataService, shortDate } from "../../certificates/index.js";
import { examService } from "../../exams/index.js";
import { defaultReportCardFormat } from "../templates/defaultReportCard.js";
import { forFamilies, reportCardService } from "./reportCard.service.js";

/* The report card as a school's HTML format (stored with the certificate formats, type
   REPORT_CARD): the values its placeholders are filled with, and what the format editor
   needs. Values are display strings ("-" for a blank cell); a flag is "" when off. */

const COMPONENT_LABEL = {
  THEORY: "Theory",
  PRACTICAL: "Practical",
  INTERNAL: "Internal",
  PROJECT: "Project",
  ORAL: "Oral"
};
const RESULT_LABEL = {
  PASS: "PASS",
  FAIL: "FAIL",
  COMPARTMENT: "COMPARTMENT",
  INCOMPLETE: "INCOMPLETE (marks pending)"
};

const dash = value => (value === null || value === undefined || value === "" ? "-" : String(value));
const shown = (flag, value) => (flag && value !== null && value !== undefined && value !== "" ? String(value) : "");
const fullName = student => `${student?.firstName ?? ""} ${student?.lastName ?? ""}`.trim();

/* Marks cell: "AB", "EX", "33 (+2)" with grace */
const marksCell = line => {
  if (line.status === "ABSENT") return "AB";
  if (line.status === "EXEMPT") return "EX";
  if (line.status === "NOT_RECORDED") return "-";
  return line.graceMarks ? `${dash(line.marksObtained)} (+${line.graceMarks})` : dash(line.marksObtained);
};

const passCell = line =>
  line.status === "EXEMPT"
    ? "Exempt"
    : line.passed === null || line.passed === undefined
      ? "-"
      : line.passed
        ? "Passed"
        : "Failed";

/* One row of the marks table. Every key is set on parts too, so a part's blank never
   shows its subject's value (a loop item's missing key is looked up outside it). */
const cellsOf = line => ({
  maxMarks: dash(line.maxMarks),
  passMarks: dash(line.passMarks),
  marks: marksCell(line),
  percentage: dash(line.percentage),
  grade: dash(line.grade),
  gradePoint: dash(line.gradePoint),
  result: passCell(line)
});

const subjectValues = (report, flags) => line => ({
  name: line.subject.subjectName,
  code: line.subject.subjectCode ?? "",
  ...cellsOf(line),
  remark: line.remark ?? "",
  graceMarks: line.graceMarks ? String(line.graceMarks) : "",
  components: flags.showMarks
    ? (line.components ?? []).map(part => ({
        name: COMPONENT_LABEL[part.component] ?? part.displayCode,
        ...cellsOf(part),
        exams: []
      }))
    : [],
  exams: flags.isScheme
    ? (report.scheme?.exams ?? []).map(exam => ({
        percentage: dash(line.exams?.find(e => e.examId === exam.examId)?.percentage)
      }))
    : []
});

/* report: a report body as families see it (forFamilies); student: { firstName, lastName,
   admissionNumber, rollNumber, section: { name } } */
export const reportCardValues = ({ report, student, academicYear, footnote, issuedOn, school }) => {
  const display = report.display ?? {};
  const isScheme = report.kind === "SCHEME";
  const flags = {
    isScheme,
    showMarks: !isScheme && Boolean(display.marks),
    showResultOnly: !isScheme && !display.marks,
    showGrades: Boolean(display.grades && (isScheme || display.marks)),
    showGradePoints: Boolean(display.gradePoints && (isScheme || display.marks))
  };
  const graced = (report.subjects ?? []).filter(line => line.graceMarks > 0);
  return {
    school,
    student: {
      name: fullName(student),
      firstName: student?.firstName ?? "",
      lastName: student?.lastName ?? "",
      admissionNumber: dash(student?.admissionNumber),
      rollNumber: dash(student?.rollNumber)
    },
    class: { classSection: dash(student?.section?.name), academicYear: academicYear ?? "" },
    report: {
      title: "Report card",
      name: (isScheme ? report.scheme?.name : report.exam?.examName) ?? "",
      policyName: report.policy?.name ?? "",
      ...Object.fromEntries(Object.entries(flags).map(([key, on]) => [key, on ? "yes" : ""])),
      exams: isScheme
        ? (report.scheme?.exams ?? []).map(exam => ({ name: exam.examName, weight: String(exam.weight) }))
        : [],
      subjects: (report.subjects ?? []).map(subjectValues(report, flags)),
      coScholastic: (report.coScholastic ?? []).map(line => ({
        name: line.subject.subjectName,
        grade: dash(line.grade),
        descriptor: line.remark ?? line.teacherRemarks ?? ""
      })),
      total: {
        maxMarks: dash(report.totalMax),
        marks: dash(report.totalObtained),
        percentage: dash(report.percentage),
        grade: dash(report.grade)
      },
      percentage: shown(display.marks, report.percentage),
      grade: shown(display.grades, report.grade),
      gpa: shown(display.gradePoints, report.gpa),
      cgpa: shown(true, report.cgpa),
      result: RESULT_LABEL[report.result] ?? dash(report.result),
      resultCode: String(report.result ?? "").toLowerCase(),
      compartmentIn: (report.compartmentSubjects ?? []).map(s => s.subjectName).join(", "),
      graceTotal: report.graceTotal > 0 ? String(report.graceTotal) : "",
      graceDetails: graced.map(line => `${line.subject.subjectName} +${line.graceMarks}`).join(", "),
      rank: shown(display.rankToStudents, report.rank),
      sectionSize: dash(report.sectionSize),
      classRank: shown(display.rankToStudents, report.classRank),
      classSize: dash(report.classSize),
      sectionAverage: shown(display.marks, report.sectionAverage),
      footnote: footnote ?? "",
      issueDate: shortDate(issuedOn)
    }
  };
};

/* Every value a card needs, with the school's details and the year's name */
export const buildReportCardValues = async (ctx, { report, student, academicYearId, footnote }) => {
  const [school, year, today] = await Promise.all([
    certificateDataService.school(ctx),
    academicYearId ? academicYearService.findById(ctx, academicYearId) : null,
    tenantToday(ctx.tenantId)
  ]);
  return reportCardValues({
    report: forFamilies(report),
    student,
    academicYear: year?.yearName,
    footnote,
    issuedOn: today,
    school
  });
};

/* The format preview's sample card: an exam card with marks, parts, grace and ranks */
const SAMPLE = {
  student: {
    firstName: "Aarav",
    lastName: "Sharma",
    admissionNumber: "ADM21-0042",
    rollNumber: 12,
    section: { name: "Class 5-A" }
  },
  report: {
    kind: "EXAM",
    exam: { examName: "Term 1 examination" },
    policy: { name: "Marks and grades" },
    display: { marks: true, grades: true, gradePoints: false, rankToStudents: true },
    subjects: [
      ["English", "EN", 100, 33, 78, "B1"],
      ["Hindi", "HI", 100, 33, 84, "A2"],
      ["Mathematics", "MA", 100, 33, 31, "D", 2],
      ["Social Science", "SS", 100, 33, 69, "B2"]
    ]
      .map(([subjectName, subjectCode, maxMarks, passMarks, marks, grade, graceMarks = 0]) => ({
        subject: { subjectName, subjectCode },
        maxMarks,
        passMarks,
        marksObtained: marks,
        graceMarks,
        status: "PRESENT",
        percentage: marks + graceMarks,
        grade,
        passed: true,
        components: []
      }))
      .toSpliced(3, 0, {
        subject: { subjectName: "Science", subjectCode: "SC" },
        maxMarks: 100,
        passMarks: 33,
        marksObtained: 81,
        graceMarks: 0,
        status: "PRESENT",
        percentage: 81,
        grade: "A2",
        passed: true,
        components: [
          { component: "THEORY", maxMarks: 80, passMarks: 26, marksObtained: 63, status: "PRESENT", passed: true },
          { component: "PRACTICAL", maxMarks: 20, passMarks: 7, marksObtained: 18, status: "PRESENT", passed: true }
        ]
      }),
    coScholastic: [
      { subject: { subjectName: "Art education" }, grade: "A", remark: "Outstanding" },
      { subject: { subjectName: "Health and physical education" }, grade: "B", remark: "Very good" }
    ],
    totalObtained: 345,
    totalMax: 500,
    graceTotal: 2,
    percentage: 69,
    grade: "B2",
    gpa: null,
    result: "PASS",
    compartmentSubjects: [],
    rank: 4,
    classRank: null,
    sectionSize: 38,
    classSize: null,
    sectionAverage: 64.2
  }
};

const sampleValues = async ctx =>
  reportCardValues({
    ...SAMPLE,
    academicYear: (await academicYearService.findCurrent(ctx))?.yearName ?? "2026-27",
    footnote: "Published 21/10/2026 (version 1)",
    issuedOn: await tenantToday(ctx.tenantId),
    school: await certificateDataService.school(ctx)
  });

/* The placeholders, in groups for the editor. A list's fields are "list[].field" and are
   written {{field}} inside {{#each list}}…{{/each}}. */
const LIST = (key, label) => ({
  key,
  label,
  insert: `{{#each ${key}}}\n\n{{/each}}`
});
const IN_LIST = (list, field, label) => ({ key: `${list}[].${field}`, label, insert: `{{${field}}}` });
const CELL_FIELDS = [
  ["maxMarks", "Max marks"],
  ["passMarks", "Pass marks"],
  ["marks", "Marks (AB absent, EX exempt, +grace)"],
  ["percentage", "Percentage"],
  ["grade", "Grade"],
  ["gradePoint", "Grade point"],
  ["result", "Passed / Failed"]
];

const GROUPS = [
  {
    group: "School",
    fields: [
      ["school.name", "School name"],
      ["school.address", "Address"],
      ["school.phone", "Phone"],
      ["school.email", "Email"],
      ["school.udiseCode", "UDISE code"],
      ["school.logo", "Logo (use as an image src)"]
    ]
  },
  {
    group: "Student",
    fields: [
      ["student.name", "Full name"],
      ["student.firstName", "First name"],
      ["student.lastName", "Last name"],
      ["student.admissionNumber", "Admission number"],
      ["student.rollNumber", "Roll number"],
      ["class.classSection", "Class and section"],
      ["class.academicYear", "Academic year"]
    ]
  },
  {
    group: "Report card",
    fields: [
      ["report.title", "Title (Report card)"],
      ["report.name", "Exam or assessment scheme"],
      ["report.policyName", "Result policy"],
      ["report.isScheme", "Weighted over several exams (for {{#if}})"],
      ["report.showMarks", "Policy shows marks (for {{#if}})"],
      ["report.showResultOnly", "Policy shows pass/fail only (for {{#if}})"],
      ["report.showGrades", "Policy shows grades (for {{#if}})"],
      ["report.showGradePoints", "Policy shows grade points (for {{#if}})"],
      ["report.total.maxMarks", "Total: max marks"],
      ["report.total.marks", "Total: marks"],
      ["report.total.percentage", "Total: percentage"],
      ["report.total.grade", "Total: grade"],
      ["report.percentage", "Percentage (when shown)"],
      ["report.grade", "Overall grade (when shown)"],
      ["report.gpa", "GPA (when shown)"],
      ["report.cgpa", "CGPA"],
      ["report.result", "Result (PASS, FAIL…)"],
      ["report.resultCode", "Result code, lowercase (for a CSS class)"],
      ["report.compartmentIn", "Compartment subjects"],
      ["report.graceTotal", "Grace marks in all"],
      ["report.graceDetails", "Grace marks by subject"],
      ["report.rank", "Rank in section (when shown)"],
      ["report.sectionSize", "Students in the section"],
      ["report.classRank", "Rank in class (when shown)"],
      ["report.classSize", "Students in the class"],
      ["report.sectionAverage", "Section average % (when shown)"],
      ["report.footnote", "Status (provisional, or when published)"],
      ["report.issueDate", "Date printed"]
    ]
  },
  {
    group: "Subjects",
    fields: [
      LIST("report.subjects", "Repeat for each subject"),
      IN_LIST("report.subjects", "name", "Subject"),
      IN_LIST("report.subjects", "code", "Subject code"),
      ...CELL_FIELDS.map(([field, label]) => IN_LIST("report.subjects", field, label)),
      IN_LIST("report.subjects", "remark", "Grade descriptor"),
      IN_LIST("report.subjects", "graceMarks", "Grace marks"),
      LIST("components", "Repeat for each part (theory, practical…)"),
      IN_LIST("report.subjects[].components", "name", "Part"),
      ...CELL_FIELDS.map(([field, label]) => IN_LIST("report.subjects[].components", field, `Part: ${label.toLowerCase()}`)),
      LIST("exams", "Repeat for each exam of a weighted card"),
      IN_LIST("report.subjects[].exams", "percentage", "Exam percentage")
    ]
  },
  {
    group: "Weighted card",
    fields: [
      LIST("report.exams", "Repeat for each exam (column headings)"),
      IN_LIST("report.exams", "name", "Exam"),
      IN_LIST("report.exams", "weight", "Weight %")
    ]
  },
  {
    group: "Co-scholastic",
    fields: [
      LIST("report.coScholastic", "Repeat for each co-scholastic area"),
      IN_LIST("report.coScholastic", "name", "Area"),
      IN_LIST("report.coScholastic", "grade", "Grade"),
      IN_LIST("report.coScholastic", "descriptor", "Descriptor")
    ]
  }
];

/* The key a list field is checked under: report.subjects[].components[].name */
const keyOf = field => (field.key === "components" || field.key === "exams" ? `report.subjects[].${field.key}` : field.key);

/* The sample's value of a placeholder (a list's first item), for the editor */
const sampleOf = (values, key) => {
  let value = values;
  for (const part of key.split(".")) {
    const name = part.replace("[]", "");
    value = value?.[name];
    if (part.endsWith("[]")) value = Array.isArray(value) ? value[0] : undefined;
  }
  return Array.isArray(value) || value === undefined || value === null ? "" : String(value);
};

const placeholderGroups = () => {
  const sample = reportCardValues({ ...SAMPLE, academicYear: "2026-27", issuedOn: "2026-10-21", school: {} });
  return GROUPS.map(({ group, fields }) => ({
    group,
    fields: fields.map(field => {
      const [key, label] = Array.isArray(field) ? field : [keyOf(field), field.label];
      return {
        key,
        label,
        sample: key.startsWith("school.") ? "" : sampleOf(sample, key),
        ...(field.insert && { insert: field.insert })
      };
    })
  }));
};

/* A student's latest report card this year (exams that have started first) */
const studentValues = async (ctx, studentId) => {
  const year = await academicYearService.findCurrent(ctx);
  const today = await tenantToday(ctx.tenantId);
  const exams = year ? await examService.findInYear(ctx, year.id) : [];
  const started = exam => !exam.startDate || String(exam.startDate) <= today;
  exams.sort(
    (a, b) => Number(started(b)) - Number(started(a)) || String(b.startDate ?? "").localeCompare(String(a.startDate ?? ""))
  );
  for (const exam of exams) {
    const card = await reportCardService.forStudent(ctx, studentId, { examId: exam.id }).catch(() => null);
    const report = card?.reports[0];
    if (!report) continue;
    const [person] = await studentService.findManyByIds(ctx, [studentId]);
    return buildReportCardValues(ctx, {
      report,
      student: {
        firstName: person?.user?.firstName,
        lastName: person?.user?.lastName,
        admissionNumber: person?.admissionNumber,
        rollNumber: card.student.rollNumber,
        section: card.student.section
      },
      academicYearId: card.academicYearId,
      footnote: exam.resultsPublishedAt ? "Live results" : "Provisional: these results are not published yet"
    });
  }
  throw unprocessable("This student has no exam results this year to show on a report card");
};

/* For the format store (certificates/services/formatTypes.js) */
export const reportCardFormat = {
  label: "Report card",
  defaultFormat: defaultReportCardFormat,
  placeholderGroups,
  sample: sampleValues,
  forStudent: studentValues
};
