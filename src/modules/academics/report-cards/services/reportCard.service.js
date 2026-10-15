import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { academicYearService } from "../../academic-years/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { examPaperService, examService } from "../../exams/index.js";
import { gradingService } from "../../grading/index.js";
import { marksService } from "../../marks/index.js";
import { sectionService } from "../../sections/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";

const round = (value, places = 2) => (value === null ? null : Math.round(value * 10 ** places) / 10 ** places);
const average = values => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

/* Standard competition ranking ("1, 2, 2, 4") by percentage, highest first */
const assignRanks = rows => {
  const ranked = rows.filter(row => row.percentage !== null).sort((a, b) => b.percentage - a.percentage);
  ranked.forEach((row, index) => {
    row.rank = index > 0 && row.percentage === ranked[index - 1].percentage ? ranked[index - 1].rank : index + 1;
  });
  rows.filter(row => row.percentage === null).forEach(row => (row.rank = null));
};

/* PASS when every paper is passed; FAIL if any is failed or missed; INCOMPLETE while marks are missing */
const resultOf = subjects => {
  if (subjects.some(s => s.status === "NOT_RECORDED")) return "INCOMPLETE";
  return subjects.every(s => s.passed) ? "PASS" : "FAIL";
};

const subjectLine = (paper, mark, scale) => {
  if (!mark) {
    return {
      paperId: paper.id,
      subject: paper.subject,
      maxMarks: paper.maxMarks,
      passMarks: paper.passMarks,
      marksObtained: null,
      percentage: null,
      grade: null,
      status: "NOT_RECORDED",
      passed: false
    };
  }
  if (mark.isAbsent) {
    return {
      paperId: paper.id,
      subject: paper.subject,
      maxMarks: paper.maxMarks,
      passMarks: paper.passMarks,
      marksObtained: null,
      percentage: 0,
      grade: "AB",
      status: "ABSENT",
      passed: false
    };
  }
  const percentage = round((mark.marksObtained / paper.maxMarks) * 100);
  const band = gradingService.gradeFor(scale, percentage);
  const meetsPassMarks = paper.passMarks === null || mark.marksObtained >= paper.passMarks;
  return {
    paperId: paper.id,
    subject: paper.subject,
    maxMarks: paper.maxMarks,
    passMarks: paper.passMarks,
    marksObtained: mark.marksObtained,
    percentage,
    grade: mark.grade ?? band?.grade ?? null,
    gradePoint: band?.gradePoint ?? null,
    status: "PRESENT",
    passed: meetsPassMarks && (band ? band.isPassing : true)
  };
};

/* Results of every student in a section for one exam */
const computeSection = async (ctx, exam, section) => {
  const [papers, roster, scale] = await Promise.all([
    examPaperService.findForExam(ctx, exam.id, { sectionId: section.id }),
    enrollmentService.findRoster(ctx, section.id, { includeLeft: true }),
    gradingService.resolveScale(ctx, exam.gradeScaleId)
  ]);
  papers.sort((a, b) => a.displayCode.localeCompare(b.displayCode));
  const marks = await marksService.findForPapers(
    ctx,
    papers.map(p => p.id)
  );
  const markOf = new Map(marks.map(m => [`${m.studentId}:${m.examPaperId}`, m]));

  const totalMax = papers.reduce((sum, p) => sum + p.maxMarks, 0);
  const students = roster.map(enrollment => {
    const subjects = papers.map(paper => subjectLine(paper, markOf.get(`${enrollment.studentId}:${paper.id}`), scale));
    const recorded = subjects.filter(s => s.status !== "NOT_RECORDED");
    const totalObtained = subjects.reduce((sum, s) => sum + (s.marksObtained ?? 0), 0);
    const percentage = recorded.length && totalMax ? round((totalObtained / totalMax) * 100) : null;
    const overall = gradingService.gradeFor(scale, percentage);
    return {
      studentId: enrollment.studentId,
      rollNumber: enrollment.rollNumber,
      firstName: enrollment.student?.user?.firstName,
      lastName: enrollment.student?.user?.lastName,
      enrollmentStatus: enrollment.status,
      subjects,
      totalObtained: round(totalObtained),
      totalMax,
      percentage,
      grade: overall?.grade ?? null,
      result: papers.length ? resultOf(subjects) : "INCOMPLETE"
    };
  });
  assignRanks(students);

  const decided = students.filter(s => s.result !== "INCOMPLETE");
  const passed = decided.filter(s => s.result === "PASS").length;
  const percentages = students.map(s => s.percentage).filter(p => p !== null);

  return {
    exam: {
      id: exam.id,
      examName: exam.examName,
      examType: exam.examType,
      resultsPublishedAt: exam.resultsPublishedAt
    },
    section: { id: section.id, name: `${section.class?.className}-${section.sectionName}` },
    gradeScale: scale ? { id: scale.id, name: scale.name } : null,
    papers: papers.map(p => ({
      id: p.id,
      displayCode: p.displayCode,
      subject: p.subject,
      maxMarks: p.maxMarks,
      passMarks: p.passMarks,
      examDate: p.examDate
    })),
    students,
    statistics: {
      students: students.length,
      appeared: percentages.length,
      passed,
      failed: decided.length - passed,
      incomplete: students.length - decided.length,
      passPercentage: decided.length ? round((passed / decided.length) * 100, 1) : null,
      averagePercentage: round(average(percentages)),
      highestPercentage: percentages.length ? Math.max(...percentages) : null,
      subjects: papers.map((paper, index) => {
        const scores = students
          .map(s => s.subjects[index])
          .filter(s => s.status === "PRESENT")
          .map(s => s.marksObtained);
        return {
          paperId: paper.id,
          subject: paper.subject,
          average: round(average(scores)),
          highest: scores.length ? Math.max(...scores) : null,
          lowest: scores.length ? Math.min(...scores) : null,
          passed: students.filter(s => s.subjects[index].passed).length
        };
      })
    }
  };
};

const loadExam = async (ctx, examId) => {
  const exam = await examService.findById(ctx, examId);
  if (!exam) throw notFound("Exam");
  return exam;
};

export const reportCardService = {
  /* Class result sheet */
  forSection: async (ctx, { sectionId, examId }) => {
    const section = await sectionService.findById(ctx, sectionId);
    if (!section) throw notFound("Section");
    await teachingScope.assertSection(ctx, sectionId);
    const exam = await loadExam(ctx, examId);
    if (exam.academicYearId !== section.academicYearId)
      throw unprocessable("The exam and the section are in different academic years");
    return computeSection(ctx, exam, section);
  },

  /* One student's report card: one exam, or every exam of a year.
     publishedOnly limits it to exams whose results are published (portal). */
  forStudent: async (ctx, studentId, { examId, academicYearId, publishedOnly = false }) => {
    const yearId = examId
      ? (await loadExam(ctx, examId)).academicYearId
      : (academicYearId ?? (await academicYearService.findCurrent(ctx))?.id);
    if (!yearId) throw unprocessable("No academic year found for this request");

    const enrollment = await enrollmentService.findForStudent(ctx, studentId, yearId);
    if (!enrollment) throw notFound("Enrollment for this student in the academic year");
    await teachingScope.assertSection(ctx, enrollment.sectionId);
    const section = await sectionService.findById(ctx, enrollment.sectionId);

    let exams = examId ? [await loadExam(ctx, examId)] : await examService.findInYear(ctx, yearId);
    if (publishedOnly) exams = exams.filter(exam => exam.resultsPublishedAt);
    if (examId && !exams.length) throw notFound("Published results for this exam");
    exams.sort((a, b) => String(a.startDate ?? "").localeCompare(String(b.startDate ?? "")));

    const reports = [];
    for (const exam of exams) {
      const sheet = await computeSection(ctx, exam, section);
      const row = sheet.students.find(s => s.studentId === studentId);
      if (!row) continue;
      reports.push({
        exam: sheet.exam,
        gradeScale: sheet.gradeScale,
        subjects: row.subjects,
        totalObtained: row.totalObtained,
        totalMax: row.totalMax,
        percentage: row.percentage,
        grade: row.grade,
        result: row.result,
        rank: row.rank,
        sectionSize: sheet.statistics.students,
        sectionAverage: sheet.statistics.averagePercentage
      });
    }

    return {
      student: {
        id: studentId,
        rollNumber: enrollment.rollNumber,
        section: { id: section.id, name: `${section.class?.className}-${section.sectionName}` }
      },
      academicYearId: yearId,
      reports
    };
  }
};
