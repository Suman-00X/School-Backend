import { unprocessable } from "../../../../common/http/errors.js";
import { getTenant, tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { minDate } from "../../../../common/utils/date.util.js";
import { examPaperService, examService } from "../../../academics/exams/index.js";
import { reportCardService } from "../../../academics/report-cards/index.js";
import { sectionService } from "../../../academics/sections/index.js";
import { analyticsQueries as q } from "../repositories/analytics.queries.js";

const yearOf = ctx => {
  if (!ctx.academicYear) throw unprocessable("No academic year for this report");
  return ctx.academicYear;
};

/* [from, to] defaulting to academic-year start .. today, clamped to the year */
const rangeOf = async (ctx, { from, to }) => {
  const year = yearOf(ctx);
  const today = await tenantToday(ctx.tenantId);
  return {
    from: from ?? year.startDate,
    to: minDate(to ?? today, year.endDate),
    today
  };
};

export const dashboardService = {
  /* One call for the admin home screen */
  overview: async ctx => {
    const year = yearOf(ctx);
    const tenant = await getTenant(ctx.tenantId);
    const today = await tenantToday(ctx.tenantId);
    const [headcounts, attendance, fees, upcomingPapers] = await Promise.all([
      q.headcounts(ctx.tenantId, year.id),
      q.attendanceOn(ctx.tenantId, year.id, today),
      q.feeSummary(ctx.tenantId, year.id, {
        today,
        monthStart: `${today.slice(0, 7)}-01`,
        timezone: tenant?.timezone ?? "UTC"
      }),
      q.upcomingPapers(ctx.tenantId, today, 14)
    ]);
    return {
      academicYear: { id: year.id, yearName: year.yearName },
      today,
      currency: tenant?.currency ?? "INR",
      headcounts,
      attendanceToday: attendance,
      fees: {
        ...fees,
        collectionRate: fees.billed ? Math.round(((fees.billed - fees.outstanding) / fees.billed) * 1000) / 10 : null
      },
      exams: { papersInNext14Days: upcomingPapers }
    };
  },

  attendance: async (ctx, query) => {
    const year = yearOf(ctx);
    const { from, to } = await rangeOf(ctx, query);
    const [bySection, trend, low] = await Promise.all([
      q.attendanceBySection(ctx.tenantId, year.id, from, to),
      q.attendanceTrend(ctx.tenantId, year.id, from, to),
      q.lowAttendance(ctx.tenantId, year.id, from, to, { threshold: query.threshold, minDays: query.minDays })
    ]);
    return { from, to, threshold: query.threshold, bySection, trend, lowAttendance: low };
  },

  fees: async (ctx, query) => {
    const year = yearOf(ctx);
    const { from, to, today } = await rangeOf(ctx, query);
    const timezone = (await getTenant(ctx.tenantId))?.timezone ?? "UTC";
    const [byMonth, byMethod, byClass, defaulters] = await Promise.all([
      q.collectionsByMonth(ctx.tenantId, from, to, timezone),
      q.collectionsByMethod(ctx.tenantId, from, to, timezone),
      q.feesByClass(ctx.tenantId, year.id),
      q.defaulters(ctx.tenantId, year.id, today, { limit: query.defaulterLimit })
    ]);
    return { from, to, collections: { byMonth, byMethod }, byClass, defaulters };
  },

  /* Result analysis of one exam across every section that sat it */
  academics: async (ctx, { examId }) => {
    const exam = await examService.getById(ctx, examId);
    const sectionIds = [...new Set((await examPaperService.findForExam(ctx, examId)).map(p => p.sectionId))];
    const sheets = [];
    for (const sectionId of sectionIds) sheets.push(await reportCardService.forSection(ctx, { sectionId, examId }));

    const subjects = new Map();
    for (const sheet of sheets) {
      for (const s of sheet.statistics.subjects) {
        const entry = subjects.get(s.subject.id) ?? { subject: s.subject, averages: [] };
        if (s.average !== null) entry.averages.push(s.average);
        subjects.set(s.subject.id, entry);
      }
    }
    const students = sheets.flatMap(sheet => sheet.students.map(st => ({ ...st, section: sheet.section.name })));
    const decided = students.filter(s => s.result !== "INCOMPLETE");

    return {
      exam: { id: exam.id, examName: exam.examName, resultsPublishedAt: exam.resultsPublishedAt },
      overall: {
        students: students.length,
        passed: decided.filter(s => s.result === "PASS").length,
        passPercentage: decided.length
          ? Math.round((decided.filter(s => s.result === "PASS").length / decided.length) * 1000) / 10
          : null
      },
      bySection: sheets.map(sheet => ({ section: sheet.section, ...sheet.statistics, subjects: undefined })),
      bySubject: [...subjects.values()].map(({ subject, averages }) => ({
        subject,
        averageMarks: averages.length
          ? Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 100) / 100
          : null
      })),
      toppers: students
        .filter(s => s.percentage !== null)
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 10)
        .map(s => ({
          studentId: s.studentId,
          firstName: s.firstName,
          lastName: s.lastName,
          section: s.section,
          percentage: s.percentage,
          grade: s.grade
        }))
    };
  },

  /* Sections of the year (used by exports) */
  sections: ctx => sectionService.findAllInYear(ctx, yearOf(ctx).id)
};
