import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { academicYearService } from "../../academic-years/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { examPaperService, examService } from "../../exams/index.js";
import { gradingService } from "../../grading/index.js";
import { marksService } from "../../marks/index.js";
import { policyView, resultEngine, resultPolicyService } from "../../result-policies/index.js";
import { sectionService } from "../../sections/index.js";
import { PAPER_COMPONENTS } from "../../shared/constants/academic.constants.js";
import { teachingScope } from "../../teacher-assignments/index.js";

/* Result sheets and report cards, computed live from marks under the result policy
   that applies (result-policies). Published versions are frozen as report snapshots. */

const sectionLabel = section => `${section.class?.className}-${section.sectionName}`;

const groupBy = (items, keyOf) => {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
};

/* Papers grouped by subject: subjects in display-code order, components THEORY, PRACTICAL… */
export const subjectGroups = papers => {
  const sorted = [...papers].sort(
    (a, b) =>
      a.displayCode.localeCompare(b.displayCode) ||
      PAPER_COMPONENTS.indexOf(a.component) - PAPER_COMPONENTS.indexOf(b.component)
  );
  const groups = groupBy(sorted, paper => paper.subjectId);
  return [...groups.values()]
    .map(papersOf => ({
      subject: papersOf[0].subject,
      papers: papersOf.sort((a, b) => PAPER_COMPONENTS.indexOf(a.component) - PAPER_COMPONENTS.indexOf(b.component))
    }))
    .sort((a, b) => a.papers[0].displayCode.localeCompare(b.papers[0].displayCode));
};

/* Policy + grade scales for one exam in one section's class (or a preview override) */
export const policyContext = async (ctx, { examId, classId, gradeScaleId, override }) => {
  const resolved = override ?? (await resultPolicyService.resolve(ctx, { examId, classId }));
  const scale = await gradingService.resolveScale(ctx, gradeScaleId ?? resolved.policy.gradeScaleId);
  const coScale = resolved.policy.coScholasticScaleId
    ? await gradingService.resolveScale(ctx, resolved.policy.coScholasticScaleId)
    : scale;
  return { ...resolved, scale, coScale };
};

/* What a sheet says about its policy (JSON-safe; snapshots keep it) */
export const policySummary = ({ policy, source, assignmentId }) => ({
  ...policyView(policy),
  source,
  assignmentId: assignmentId ?? null
});

const scaleSummary = scale => (scale ? { id: scale.id, name: scale.name } : null);

const examView = exam => ({
  id: exam.id,
  examName: exam.examName,
  examType: exam.examType,
  startDate: exam.startDate,
  endDate: exam.endDate,
  resultsPublishedAt: exam.resultsPublishedAt
});

/* A section's sheet: every student of the roster (left ones too) under the policy */
const buildSheet = async (ctx, exam, { section, papers }, override) => {
  const context = await policyContext(ctx, {
    examId: exam.id,
    classId: section.classId,
    gradeScaleId: exam.gradeScaleId,
    override
  });
  const { policy, scale, coScale } = context;
  const groups = subjectGroups(papers);
  const [roster, marks] = await Promise.all([
    enrollmentService.findRoster(ctx, section.id, { includeLeft: true }),
    marksService.findForPapers(
      ctx,
      papers.map(p => p.id)
    )
  ]);
  const markOf = new Map(marks.map(m => [`${m.studentId}:${m.examPaperId}`, m]));

  const students = roster.map(enrollment => ({
    studentId: enrollment.studentId,
    rollNumber: enrollment.rollNumber,
    firstName: enrollment.student?.user?.firstName,
    lastName: enrollment.student?.user?.lastName,
    admissionNumber: enrollment.student?.admissionNumber,
    studentCode: enrollment.student?.studentCode,
    enrollmentStatus: enrollment.status,
    ...resultEngine.evaluateStudent({
      policy,
      scale,
      coScale,
      subjects: groups.map(group => ({
        subject: group.subject,
        papers: group.papers.map(paper => ({
          ...paper,
          mark: markOf.get(`${enrollment.studentId}:${paper.id}`) ?? null
        }))
      }))
    }),
    rank: null,
    classRank: null
  }));

  const display = resultEngine.displayOf(policy);
  if (display.sectionRank) resultEngine.assignRanks(policy, students, "rank");

  return {
    exam: examView(exam),
    section: { id: section.id, name: sectionLabel(section), classId: section.classId },
    policy: policySummary(context),
    gradeScale: scaleSummary(scale),
    coScholasticScale: scaleSummary(coScale),
    display,
    papers: papers
      .map(p => ({
        id: p.id,
        displayCode: p.displayCode,
        subject: p.subject,
        component: p.component ?? null,
        gradingType: p.gradingType,
        maxMarks: p.maxMarks,
        passMarks: p.passMarks,
        examDate: p.examDate
      }))
      .sort((a, b) => a.displayCode.localeCompare(b.displayCode)),
    students,
    classSize: null,
    statistics: resultEngine.statisticsOf(policy, students)
  };
};

/* Class ranks across the sections of one class (same exam, same policy) */
export const rankAcrossClasses = sheets => {
  for (const group of groupBy(sheets, sheet => sheet.section.classId).values()) {
    const { policy, display } = group[0];
    if (!display.classRank) continue;
    const rows = group.flatMap(sheet => sheet.students);
    resultEngine.assignRanks(policy, rows, "classRank");
    for (const sheet of group) sheet.classSize = rows.length;
  }
  return sheets;
};

/* Every section that sits an exam, with its papers */
const examSections = async (ctx, exam) => {
  const papers = await examPaperService.findForExam(ctx, exam.id);
  const bySection = groupBy(papers, paper => paper.sectionId);
  const sections = await Promise.all([...bySection.keys()].map(id => sectionService.findById(ctx, id)));
  return sections
    .filter(Boolean)
    .map(section => ({ section, papers: bySection.get(section.id) }))
    .sort((a, b) => sectionLabel(a.section).localeCompare(sectionLabel(b.section)));
};

/* One section's sheet; sibling sections are computed too when ranks are class-wide */
const sheetFor = async (ctx, exam, section, override) => {
  const all = await examSections(ctx, exam);
  const target = all.find(entry => entry.section.id === section.id) ?? { section, papers: [] };
  const sheet = await buildSheet(ctx, exam, target, override);
  if (!sheet.display.classRank) return sheet;
  const siblings = all.filter(entry => entry.section.id !== section.id && entry.section.classId === section.classId);
  const others = await Promise.all(siblings.map(entry => buildSheet(ctx, exam, entry, override)));
  rankAcrossClasses([sheet, ...others]);
  return sheet;
};

const loadExam = async (ctx, examId) => {
  const exam = await examService.findById(ctx, examId);
  if (!exam) throw notFound("Exam");
  return exam;
};

/* One student's report card body (live, or frozen into a snapshot) */
export const studentReport = (sheet, row) => ({
  kind: "EXAM",
  exam: sheet.exam,
  policy: sheet.policy,
  gradeScale: sheet.gradeScale,
  display: sheet.display,
  subjects: row.subjects,
  coScholastic: row.coScholastic,
  totalObtained: row.totalObtained,
  totalMax: row.totalMax,
  graceTotal: row.graceTotal,
  percentage: row.percentage,
  grade: row.grade,
  gpa: row.gpa,
  result: row.result,
  failedSubjects: row.failedSubjects,
  compartmentSubjects: row.compartmentSubjects,
  rank: row.rank,
  classRank: row.classRank,
  sectionSize: sheet.statistics.students,
  classSize: sheet.classSize,
  sectionAverage: sheet.statistics.averagePercentage
});

/* Strip what students and parents are not shown under the policy (ranks, marks for pass/fail) */
export const forFamilies = report => {
  const copy = structuredClone(report);
  const display = copy.display ?? {};
  if (!display.rankToStudents) {
    copy.rank = null;
    copy.classRank = null;
  }
  if (display.marks === false) {
    const hide = line => {
      for (const key of [
        "maxMarks",
        "passMarks",
        "marksObtained",
        "marksAwarded",
        "graceMarks",
        "percentage",
        "components"
      ]) {
        delete line[key];
      }
      return line;
    };
    copy.subjects = copy.subjects.map(hide);
    copy.coScholastic = (copy.coScholastic ?? []).map(hide);
    for (const key of ["totalObtained", "totalMax", "percentage", "sectionAverage", "graceTotal"]) copy[key] = null;
  }
  copy.policy = copy.policy && { id: copy.policy.id, name: copy.policy.name, gradingMode: copy.policy.gradingMode };
  return copy;
};

export const reportCardService = {
  /* Class result sheet */
  forSection: async (ctx, { sectionId, examId }) => {
    const section = await sectionService.findById(ctx, sectionId);
    if (!section) throw notFound("Section");
    await teachingScope.assertReportCards(ctx, sectionId);
    const exam = await loadExam(ctx, examId);
    if (exam.academicYearId !== section.academicYearId)
      throw unprocessable("The exam and the section are in different academic years");
    return sheetFor(ctx, exam, section);
  },

  /* Every section of an exam (dashboards, publication, previews).
     override = { policy, source } computes under another policy without saving anything. */
  forExam: async (ctx, examOrId, { override } = {}) => {
    const exam = typeof examOrId === "string" ? await loadExam(ctx, examOrId) : examOrId;
    const sheets = await Promise.all(
      (await examSections(ctx, exam)).map(entry => buildSheet(ctx, exam, entry, override))
    );
    return rankAcrossClasses(sheets);
  },

  /* One student's live report card: one exam, or every exam of a year */
  forStudent: async (ctx, studentId, { examId, academicYearId }) => {
    const yearId = examId
      ? (await loadExam(ctx, examId)).academicYearId
      : (academicYearId ?? (await academicYearService.findCurrent(ctx))?.id);
    if (!yearId) throw unprocessable("No academic year found for this request");

    const enrollment = await enrollmentService.findForStudent(ctx, studentId, yearId);
    if (!enrollment) throw notFound("Enrollment for this student in the academic year");
    await teachingScope.assertReportCards(ctx, enrollment.sectionId);
    const section = await sectionService.findById(ctx, enrollment.sectionId);

    const exams = examId ? [await loadExam(ctx, examId)] : await examService.findInYear(ctx, yearId);
    exams.sort((a, b) => String(a.startDate ?? "").localeCompare(String(b.startDate ?? "")));

    const reports = [];
    for (const exam of exams) {
      const sheet = await sheetFor(ctx, exam, section);
      const row = sheet.students.find(s => s.studentId === studentId);
      if (row) reports.push(studentReport(sheet, row));
    }

    return {
      student: {
        id: studentId,
        rollNumber: enrollment.rollNumber,
        section: { id: section.id, name: sectionLabel(section) }
      },
      academicYearId: yearId,
      reports
    };
  },

  /* For other submodules (assessment schemes) */
  loadExam,
  examSections,
  sectionLabel
};
