import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { getTenant, tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { eachDay, minDate } from "../../../../common/utils/date.util.js";
import { enrollmentService } from "../../../academics/enrollments/index.js";
import { reportCardService } from "../../../academics/report-cards/index.js";
import { sectionService } from "../../../academics/sections/index.js";
import { analyticsQueries } from "../../dashboards/index.js";
import { exportQueries } from "../repositories/export.queries.js";

const MAX_ATTENDANCE_DAYS = 62;
const CODES = { PRESENT: "P", ABSENT: "A", LATE: "L", HALF_DAY: "H", EXCUSED: "E" };

const yearOf = ctx => {
  if (!ctx.academicYear) throw unprocessable("No academic year for this export");
  return ctx.academicYear;
};

/* Each export returns { rows, columns, fileName, title } for sendTable() */
export const exportService = {
  students: async ctx => {
    const year = yearOf(ctx);
    return {
      fileName: `students-${year.yearName}`,
      title: `Students ${year.yearName}`,
      rows: await exportQueries.studentRoster(ctx.tenantId, year.id),
      columns: [
        { key: "className", header: "Class" },
        { key: "sectionName", header: "Section" },
        { key: "rollNumber", header: "Roll no." },
        { key: "studentCode", header: "Student code", width: 18 },
        { key: "admissionNumber", header: "Admission no.", width: 16 },
        { key: "firstName", header: "First name" },
        { key: "lastName", header: "Last name" },
        { key: "gender", header: "Gender" },
        { key: "dob", header: "Date of birth" },
        { key: "email", header: "Email", width: 28 },
        { key: "phone", header: "Phone", width: 16 },
        { key: "status", header: "Status" },
        { key: "parentName", header: "Parent", width: 22 },
        { key: "parentPhone", header: "Parent phone", width: 16 },
        { key: "parentEmail", header: "Parent email", width: 28 }
      ]
    };
  },

  /* Register grid: one row per student, one column per day (P/A/L/H/E) */
  attendance: async (ctx, { sectionId, from, to }) => {
    const section = await sectionService.findById(ctx, sectionId);
    if (!section) throw notFound("Section");
    const end = minDate(to, await tenantToday(ctx.tenantId));
    const days = eachDay(from, end);
    if (days.length > MAX_ATTENDANCE_DAYS) throw unprocessable(`Export at most ${MAX_ATTENDANCE_DAYS} days at a time`);

    const [roster, marks] = await Promise.all([
      enrollmentService.findRoster(ctx, sectionId, { includeLeft: true }),
      exportQueries.attendanceMarks(ctx.tenantId, sectionId, from, end)
    ]);
    const markOf = new Map(marks.map(m => [`${m.studentId}:${m.date}`, CODES[m.status]]));
    const name = `${section.class?.className}-${section.sectionName}`;

    return {
      fileName: `attendance-${name}-${from}-to-${end}`,
      title: `Attendance ${name} (${from} to ${end})`,
      rows: roster.map(e => ({
        rollNumber: e.rollNumber,
        name: `${e.student?.user?.firstName ?? ""} ${e.student?.user?.lastName ?? ""}`.trim(),
        ...Object.fromEntries(days.map(day => [day, markOf.get(`${e.studentId}:${day}`) ?? ""]))
      })),
      columns: [
        { key: "rollNumber", header: "Roll no." },
        { key: "name", header: "Student", width: 24 },
        ...days.map(day => ({ key: day, header: day.slice(5), width: 6 }))
      ]
    };
  },

  feeCollections: async (ctx, { from, to }) => {
    const timezone = (await getTenant(ctx.tenantId))?.timezone ?? "UTC";
    return {
      fileName: `fee-collections-${from}-to-${to}`,
      title: `Fee collections ${from} to ${to}`,
      rows: await exportQueries.feeCollections(ctx.tenantId, from, to, timezone),
      columns: [
        { key: "paidOn", header: "Date" },
        { key: "receiptNumber", header: "Receipt", width: 16 },
        { key: "invoiceNumber", header: "Invoice", width: 16 },
        { key: "admissionNumber", header: "Admission no.", width: 16 },
        { key: "studentName", header: "Student", width: 24 },
        { key: "method", header: "Method" },
        { key: "reference", header: "Reference", width: 18 },
        { key: "amount", header: "Amount" }
      ]
    };
  },

  defaulters: async ctx => {
    const year = yearOf(ctx);
    const today = await tenantToday(ctx.tenantId);
    return {
      fileName: `fee-defaulters-${today}`,
      title: `Overdue fees as of ${today}`,
      rows: await analyticsQueries.defaulters(ctx.tenantId, year.id, today, { limit: 10_000 }),
      columns: [
        { key: "section", header: "Class" },
        { key: "admissionNumber", header: "Admission no.", width: 16 },
        { key: "firstName", header: "First name" },
        { key: "lastName", header: "Last name" },
        { key: "invoices", header: "Invoices" },
        { key: "oldestDueDate", header: "Oldest due date", width: 16 },
        { key: "overdue", header: "Overdue amount", width: 16 }
      ]
    };
  },

  /* Result sheet of a section for an exam under its result policy: one column per subject */
  results: async (ctx, { examId, sectionId }) => {
    const sheet = await reportCardService.forSection(ctx, { sectionId, examId });
    const subjects = new Map();
    for (const paper of sheet.papers) {
      const entry = subjects.get(paper.subject.id) ?? { subject: paper.subject, maxMarks: 0, graded: true };
      entry.maxMarks += paper.maxMarks ?? 0;
      entry.graded &&= paper.gradingType === "GRADE";
      subjects.set(paper.subject.id, entry);
    }
    const cell = line => {
      if (!line) return "";
      if (line.status === "ABSENT") return "AB";
      if (line.status === "EXEMPT") return "EX";
      if (line.category === "CO_SCHOLASTIC") return line.grade ?? "";
      if (!sheet.display.marks) return line.passed === null ? "" : line.passed ? "P" : "F";
      return line.graceMarks ? `${line.marksObtained}+${line.graceMarks}` : (line.marksObtained ?? "");
    };
    const extra = [
      sheet.display.gradePoints && { key: "gpa", header: "GPA" },
      sheet.students.some(s => s.graceTotal > 0) && { key: "graceTotal", header: "Grace" },
      sheet.display.classRank && { key: "classRank", header: "Class rank" }
    ].filter(Boolean);
    return {
      fileName: `results-${sheet.exam.examName}-${sheet.section.name}`,
      title: `${sheet.exam.examName}: ${sheet.section.name} (${sheet.policy.name})`,
      rows: sheet.students.map(s => {
        const lines = new Map([...s.subjects, ...s.coScholastic].map(line => [line.subject.id, line]));
        return {
          rollNumber: s.rollNumber,
          name: `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim(),
          ...Object.fromEntries([...subjects.keys()].map(id => [id, cell(lines.get(id))])),
          total: s.totalObtained,
          percentage: s.percentage,
          grade: s.grade,
          result: s.result,
          rank: s.rank,
          gpa: s.gpa,
          graceTotal: s.graceTotal,
          classRank: s.classRank
        };
      }),
      columns: [
        { key: "rollNumber", header: "Roll no." },
        { key: "name", header: "Student", width: 24 },
        ...[...subjects.entries()].map(([id, { subject, maxMarks, graded }]) => ({
          key: id,
          header: graded ? subject.subjectCode : `${subject.subjectCode} (/${maxMarks})`,
          width: 12
        })),
        { key: "total", header: "Total" },
        { key: "percentage", header: "%" },
        { key: "grade", header: "Grade" },
        { key: "result", header: "Result" },
        { key: "rank", header: "Rank" },
        ...extra
      ]
    };
  }
};
