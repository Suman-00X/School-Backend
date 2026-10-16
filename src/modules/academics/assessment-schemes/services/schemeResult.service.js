import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { enrollmentService } from "../../enrollments/index.js";
import { marksService } from "../../marks/index.js";
import { policyView, resultEngine, resultPolicyService } from "../../result-policies/index.js";
import {
  policyContext,
  rankAcrossClasses,
  reportCardPdfService,
  reportCardService,
  resultPreviewService,
  resultPublicationService,
  subjectGroups
} from "../../report-cards/index.js";
import { sectionService } from "../../sections/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { roundTo } from "../../shared/utils/rounding.util.js";
import { assessmentSchemeService } from "./assessmentScheme.service.js";

/* Weighted results of an assessment scheme (Term 1 40% + Term 2 60%).

   Per subject: each exam's percentage, weighted; exams where the paper was excluded
   (exempt, or a medical absence the policy excludes) drop out and the other weights
   are rescaled. An absence counted as zero contributes 0%. Pass marks are weighted
   the same way. The weighted subjects (out of 100) then go through the same policy
   engine: pass criteria, grace, best-of-N, compartment, grades, GPA and ranks.
   CGPA is the credit-weighted mean of every exam's subject grade points. */

const sum = values => values.reduce((total, value) => total + value, 0);
const marks2 = value => Math.round(value * 100) / 100;

/* Per-exam evaluation only needs subject lines: no grace, every subject */
const perExamPolicy = policy => ({ ...policy, graceMaxPerSubject: 0, graceMaxTotal: 0, bestOfSubjects: null });

const isExcluded = line => line.counted === false && (line.status === "EXEMPT" || line.status === "ABSENT");
const rawPercent = line => (line.status === "ABSENT" ? 0 : (line.marksObtained / line.maxMarks) * 100);

/* The scheme's policy: its own, else the class's, the school default or the built-in rules */
const resolvePolicy = async (ctx, scheme, classId) => {
  if (scheme.policyId) {
    const policy = await resultPolicyService.configById(ctx, scheme.policyId);
    if (policy) return { policy, source: "SCHEME" };
  }
  return resultPolicyService.resolve(ctx, { examId: null, classId });
};

/* One weighted subject for one student -> a synthetic paper (out of 100) and the per-exam breakdown */
const weightedSubject = (subject, entries, policy) => {
  const exams = entries.map(({ exam, weight, line }) => ({
    examId: exam.id,
    examName: exam.examName,
    weight,
    status: line.status,
    percentage: line.status === "NOT_RECORDED" || isExcluded(line) ? null : line.percentage,
    grade: line.grade ?? null
  }));
  const paper = { id: `weighted:${subject.id}`, displayCode: subject.subjectCode, gradingType: "MARKS", maxMarks: 100 };

  if (entries.some(({ line }) => line.status === "NOT_RECORDED"))
    return { paper: { ...paper, passMarks: null, mark: null }, exams };
  const included = entries.filter(({ line }) => !isExcluded(line));
  if (!included.length) {
    return {
      paper: {
        ...paper,
        passMarks: null,
        mark: { isAbsent: true, absenceReason: entries[0].line.absenceReason ?? "EXEMPT" }
      },
      exams
    };
  }
  const weights = sum(included.map(e => e.weight));
  const weighted = sum(included.map(e => e.weight * rawPercent(e.line))) / weights;
  const withPass = included.filter(e => e.line.passMarks !== null && e.line.passMarks !== undefined);
  const passMarks =
    policy.usePaperPassMarks && withPass.length
      ? marks2(
          sum(withPass.map(e => (e.weight * e.line.passMarks * 100) / e.line.maxMarks)) /
            sum(withPass.map(e => e.weight))
        )
      : null;
  return { paper: { ...paper, passMarks, mark: { marksObtained: marks2(weighted), isAbsent: false } }, exams };
};

/* Co-scholastic subjects carry the latest exam's grade (grades are not averaged) */
const latestCoScholastic = (subject, entries) => {
  const recorded = entries.filter(({ line }) => line.status !== "NOT_RECORDED");
  const latest = recorded.at(-1) ?? entries.at(-1);
  const paper = { id: `latest:${subject.id}`, displayCode: subject.subjectCode, gradingType: "GRADE", maxMarks: null };
  if (!latest || latest.line.status === "NOT_RECORDED") return { ...paper, mark: null };
  if (latest.line.status === "ABSENT" || latest.line.status === "EXEMPT") {
    return { ...paper, mark: { isAbsent: true, absenceReason: latest.line.status === "EXEMPT" ? "EXEMPT" : "ABSENT" } };
  }
  return { ...paper, mark: { grade: latest.line.grade, gradeIsManual: true, remarks: latest.line.teacherRemarks } };
};

const cgpaOf = (policy, perExam) => {
  if (policy.gradingMode !== "GPA") return null;
  const lines = perExam
    .flatMap(result => result.subjects)
    .filter(l => l.counted && l.gradePoint !== null && l.gradePoint !== undefined);
  const credits = sum(lines.map(l => l.credits));
  return credits
    ? roundTo(sum(lines.map(l => l.credits * l.gradePoint)) / credits, policy.gpaDecimals, policy.roundingMode)
    : null;
};

const schemeView = scheme => ({
  id: scheme.id,
  name: scheme.name,
  resultsPublishedAt: scheme.resultsPublishedAt,
  exams: scheme.exams.map(e => ({ examId: e.examId, examName: e.exam.examName, weight: e.weight }))
});

/* One section's weighted sheet */
const buildSheet = async (ctx, scheme, section, perExamPapers, override) => {
  const context = await policyContext(ctx, {
    classId: section.classId,
    gradeScaleId: null,
    override: override ?? (await resolvePolicy(ctx, scheme, section.classId))
  });
  const { policy, scale, coScale } = context;
  const examPolicy = perExamPolicy(policy);
  const exams = perExamPapers.map(entry => ({ ...entry, groups: subjectGroups(entry.papers) }));
  const [roster, marks] = await Promise.all([
    enrollmentService.findRoster(ctx, section.id, { includeLeft: true }),
    marksService.findForPapers(
      ctx,
      exams.flatMap(e => e.papers.map(p => p.id))
    )
  ]);
  const markOf = new Map(marks.map(m => [`${m.studentId}:${m.examPaperId}`, m]));

  const students = roster.map(enrollment => {
    const perExam = exams.map(({ exam, weight, groups }) => ({
      exam,
      weight,
      result: resultEngine.evaluateStudent({
        policy: examPolicy,
        scale,
        coScale,
        subjects: groups.map(group => ({
          subject: group.subject,
          papers: group.papers.map(p => ({ ...p, mark: markOf.get(`${enrollment.studentId}:${p.id}`) ?? null }))
        }))
      })
    }));

    /* Subjects in order of first appearance across the scheme's exams */
    const subjects = new Map();
    for (const { exam, weight, result } of perExam) {
      for (const line of [...result.subjects, ...result.coScholastic]) {
        if (!subjects.has(line.subject.id)) subjects.set(line.subject.id, { subject: line.subject, entries: [] });
        subjects.get(line.subject.id).entries.push({ exam, weight, line });
      }
    }

    const breakdown = new Map();
    const groups = [...subjects.values()].map(({ subject, entries }) => {
      if (entries.every(e => e.line.category === "CO_SCHOLASTIC")) {
        return { subject, papers: [latestCoScholastic(subject, entries)] };
      }
      const { paper, exams: perExamLines } = weightedSubject(subject, entries, policy);
      breakdown.set(subject.id, perExamLines);
      return { subject, papers: [paper] };
    });

    const result = resultEngine.evaluateStudent({ policy, scale, coScale, subjects: groups });
    return {
      studentId: enrollment.studentId,
      rollNumber: enrollment.rollNumber,
      firstName: enrollment.student?.user?.firstName,
      lastName: enrollment.student?.user?.lastName,
      admissionNumber: enrollment.student?.admissionNumber,
      studentCode: enrollment.student?.studentCode,
      enrollmentStatus: enrollment.status,
      ...result,
      subjects: result.subjects.map(({ paperId: _paperId, ...line }) => ({
        ...line,
        exams: breakdown.get(line.subject.id)
      })),
      coScholastic: result.coScholastic.map(({ paperId: _paperId, ...line }) => line),
      cgpa: cgpaOf(
        policy,
        perExam.map(e => e.result)
      ),
      rank: null,
      classRank: null
    };
  });

  const display = resultEngine.displayOf(policy);
  if (display.sectionRank) resultEngine.assignRanks(policy, students, "rank");
  return {
    scheme: schemeView(scheme),
    section: { id: section.id, name: reportCardService.sectionLabel(section), classId: section.classId },
    policy: { ...policyView(policy), source: context.source, assignmentId: context.assignmentId ?? null },
    gradeScale: scale ? { id: scale.id, name: scale.name } : null,
    display,
    students,
    classSize: null,
    statistics: resultEngine.statisticsOf(policy, students)
  };
};

/* Every section that sits any of the scheme's exams, with each exam's papers for it */
const schemeSections = async (ctx, scheme) => {
  const exams = await Promise.all(
    scheme.exams.map(async entry => ({
      exam: await reportCardService.loadExam(ctx, entry.examId),
      weight: entry.weight
    }))
  );
  const sections = new Map();
  for (const { exam } of exams) {
    for (const { section, papers } of await reportCardService.examSections(ctx, exam)) {
      if (!sections.has(section.id))
        sections.set(section.id, { section, exams: exams.map(e => ({ ...e, papers: [] })) });
      sections.get(section.id).exams.find(e => e.exam.id === exam.id).papers = papers;
    }
  }
  return [...sections.values()].map(entry => ({ ...entry, exams: entry.exams.filter(e => e.papers.length) }));
};

const allSheets = async (ctx, scheme, override) => {
  const sections = await schemeSections(ctx, scheme);
  const sheets = await Promise.all(
    sections.map(({ section, exams }) => buildSheet(ctx, scheme, section, exams, override))
  );
  return rankAcrossClasses(sheets);
};

/* A student's report body (live, or frozen into a snapshot) */
export const schemeReport = (sheet, row) => ({
  kind: "SCHEME",
  scheme: sheet.scheme,
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
  cgpa: row.cgpa,
  result: row.result,
  failedSubjects: row.failedSubjects,
  compartmentSubjects: row.compartmentSubjects,
  rank: row.rank,
  classRank: row.classRank,
  sectionSize: sheet.statistics.students,
  classSize: sheet.classSize,
  sectionAverage: sheet.statistics.averagePercentage
});

const lockScheme = async (ctx, schemeId, tx) => {
  const row = await assessmentSchemeService.lockForUpdate(ctx, schemeId, { dbc: tx });
  if (!row) throw notFound("Assessment scheme");
  return row;
};

const computeFor = ctx => async row => {
  const scheme = await assessmentSchemeService.getById(ctx, row.id);
  return {
    sheets: await allSheets(ctx, scheme),
    sourceName: scheme.name,
    academicYearId: scheme.academicYearId,
    reportFor: schemeReport
  };
};

export const schemeResultService = {
  /* A section's weighted result sheet */
  forSection: async (ctx, schemeId, sectionId) => {
    const scheme = await assessmentSchemeService.getById(ctx, schemeId);
    const section = await sectionService.findById(ctx, sectionId);
    if (!section) throw notFound("Section");
    await teachingScope.assertSection(ctx, sectionId);
    if (section.academicYearId !== scheme.academicYearId) {
      throw unprocessable("The scheme and the section are in different academic years");
    }
    const sheets = await allSheets(ctx, scheme);
    const sheet = sheets.find(s => s.section.id === sectionId);
    if (!sheet) throw unprocessable(`The section sits none of the exams in ${scheme.name}`);
    return sheet;
  },

  /* One student's live weighted report card */
  forStudent: async (ctx, schemeId, studentId) => {
    const scheme = await assessmentSchemeService.getById(ctx, schemeId);
    const enrollment = await enrollmentService.findForStudent(ctx, studentId, scheme.academicYearId);
    if (!enrollment) throw notFound("Enrollment for this student in the academic year");
    await teachingScope.assertSection(ctx, enrollment.sectionId);
    const sheet = (await allSheets(ctx, scheme)).find(s => s.section.id === enrollment.sectionId);
    const row = sheet?.students.find(s => s.studentId === studentId);
    if (!row) throw notFound(`${scheme.name} results for this student`);
    return {
      student: {
        id: studentId,
        rollNumber: enrollment.rollNumber,
        section: { id: sheet.section.id, name: sheet.section.name }
      },
      academicYearId: scheme.academicYearId,
      report: schemeReport(sheet, row),
      row
    };
  },

  pdf: async (ctx, schemeId, studentId) => {
    const { student, report, row } = await schemeResultService.forStudent(ctx, schemeId, studentId);
    return reportCardPdfService.renderReport(ctx, {
      report,
      student: { ...student, firstName: row.firstName, lastName: row.lastName, admissionNumber: row.admissionNumber },
      footnote: report.scheme.resultsPublishedAt ? "Live results" : "Provisional: these results are not published yet"
    });
  },

  /* A policy on the scheme's real marks; nothing is saved */
  preview: async (ctx, schemeId, { sectionId, policyId, policy }) => {
    const scheme = await assessmentSchemeService.getById(ctx, schemeId);
    const config = await resultPreviewService.policyFrom(ctx, { policyId, policy });
    const [previewSheets, currentSheets] = await Promise.all([
      allSheets(ctx, scheme, { policy: config, source: "PREVIEW" }),
      allSheets(ctx, scheme)
    ]);
    return {
      scheme: { id: scheme.id, name: scheme.name },
      policy: policyView(config),
      ...resultPreviewService.compare(previewSheets, currentSheets, sectionId)
    };
  },

  publish: async (ctx, schemeId) =>
    resultPublicationService.publishVersion(ctx, {
      kind: "SCHEME",
      sourceId: schemeId,
      lock: async tx => {
        const row = await lockScheme(ctx, schemeId, tx);
        if (row.resultsPublishedAt) {
          throw conflict(`Results for ${row.name} are already published. To publish changes, add a new version.`);
        }
        return row;
      },
      compute: computeFor(ctx),
      after: (tx, row, publishedAt) =>
        assessmentSchemeService.setResultsPublishedAt(ctx, row.id, publishedAt, { dbc: tx })
    }),

  revise: (ctx, schemeId) =>
    resultPublicationService.publishVersion(ctx, {
      kind: "SCHEME",
      sourceId: schemeId,
      lock: async tx => {
        const row = await lockScheme(ctx, schemeId, tx);
        if (!row.resultsPublishedAt) throw conflict(`Results for ${row.name} are not published. Publish them first.`);
        return row;
      },
      compute: computeFor(ctx),
      after: async (tx, row) => row
    }),

  withdraw: (ctx, schemeId) =>
    resultPublicationService.withdrawVersion(ctx, {
      kind: "SCHEME",
      sourceId: schemeId,
      lock: async tx => {
        const row = await lockScheme(ctx, schemeId, tx);
        if (!row.resultsPublishedAt) throw notFound("Result publication");
        return row;
      },
      after: (tx, row) => assessmentSchemeService.setResultsPublishedAt(ctx, row.id, null, { dbc: tx })
    }),

  versions: async (ctx, schemeId, query) => {
    await assessmentSchemeService.getById(ctx, schemeId);
    return resultPublicationService.versions(ctx, "SCHEME", schemeId, query);
  },

  compare: async (ctx, schemeId, { sectionId, version }) => {
    const scheme = await assessmentSchemeService.getById(ctx, schemeId);
    if (sectionId) await teachingScope.assertSection(ctx, sectionId);
    return resultPublicationService.compareWith(ctx, {
      kind: "SCHEME",
      sourceId: schemeId,
      sourceName: scheme.name,
      version,
      sectionId,
      liveSheets: await allSheets(ctx, scheme),
      reportFor: schemeReport
    });
  }
};
