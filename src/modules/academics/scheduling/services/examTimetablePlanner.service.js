import { conflict, unprocessable } from "../../../../common/http/errors.js";
import { academicYearService } from "../../academic-years/index.js";
import { calendarService } from "../../calendar/index.js";
import { examPaperService, examService } from "../../exams/index.js";
import { sectionService } from "../../sections/index.js";
import { solveExamTimetable } from "../solvers/examTimetable.solver.js";
import { fingerprintOf } from "../utils/fingerprint.util.js";
import { newSeed } from "../utils/random.util.js";

/* Exam timetables: reads the exam's papers, the school days in its window (holidays,
   vacations and weekly off days are left out) and other exams' papers in those days,
   turns the request into solver input and words what the solver found. */

const sectionName = section => `${section.class?.className ?? "Class"}-${section.sectionName}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const hhmm = time => (time ? time.slice(0, 5) : time);

const REASON_TEXT = {
  SECTION_BUSY: "a section already sits another paper of this exam",
  OTHER_EXAM: "a section sits another exam then",
  DAILY_LIMIT: "a section has reached its papers a day",
  GAP_RULE: "a section would have no free day between papers",
  TOO_LONG: "the paper is longer than the sitting"
};

/* The most specific duration rule for a paper (subject, component and class each count) */
const durationFor = (rules, paper, classId) => {
  let best = null;
  let bestScore = -1;
  for (const rule of rules) {
    if (rule.subjectId && rule.subjectId !== paper.subjectId) continue;
    if (rule.component && rule.component !== paper.component) continue;
    if (rule.classIds && !rule.classIds.includes(classId)) continue;
    const score = (rule.subjectId ? 4 : 0) + (rule.component ? 2 : 0) + (rule.classIds ? 1 : 0);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return best?.minutes ?? null;
};

const gather = async (ctx, request) => {
  const exam = await examService.findById(ctx, request.examId);
  if (!exam) throw unprocessable("examId does not refer to an existing exam");
  const academicYear = await academicYearService.findById(ctx, exam.academicYearId);
  if (academicYear.archivedAt) throw conflict(`Academic year ${academicYear.yearName} is archived and read-only`);

  const papers = await examPaperService.findForExam(ctx, exam.id);
  if (!papers.length)
    throw unprocessable(`${exam.examName} has no papers yet. Add its papers on the exam's page first.`);

  const startDate = request.startDate ?? exam.startDate;
  const endDate = request.endDate ?? exam.endDate;
  if (!startDate || !endDate) throw unprocessable(`${exam.examName} has no dates yet: send startDate and endDate`);
  if (startDate < academicYear.startDate || endDate > academicYear.endDate) {
    throw unprocessable(
      `The exam's days must fall within the academic year (${academicYear.startDate} to ${academicYear.endDate})`
    );
  }

  const [sections, calendar, nearby] = await Promise.all([
    sectionService.findAllInYear(ctx, academicYear.id),
    calendarService.workingDays(ctx, academicYear, startDate, endDate),
    examPaperService.findScheduledBetween(ctx, academicYear.id, startDate, endDate)
  ]);
  const avoid = new Set(request.avoidDates);
  const dates = calendar.workingDays.filter(day => !avoid.has(day));
  if (!dates.length)
    throw unprocessable(`There are no school days between ${startDate} and ${endDate} to sit the exam`);

  const sectionsById = new Map(sections.map(s => [s.id, s]));
  const otherExams = nearby.filter(p => p.examId !== exam.id && p.startTime && p.endTime);
  return {
    exam,
    academicYear,
    papers,
    sectionsById,
    startDate,
    endDate,
    dates,
    closedDays: calendar.closedDays,
    otherExams
  };
};

const fingerprint = (data, request) =>
  fingerprintOf({
    papers: data.papers.map(p => [
      p.id,
      p.sectionId,
      p.subjectId,
      p.component,
      ...(request.keepScheduled ? [p.examDate, p.startTime, p.endTime] : [])
    ]),
    days: data.dates,
    otherExams: data.otherExams.map(p => [p.id, p.sectionId, p.examDate, p.startTime, p.endTime])
  });

const isScheduled = paper => Boolean(paper.examDate && paper.startTime && paper.endTime);

export const examTimetablePlanner = {
  /* Solve: -> { academicYear, examId, request, result, report, fingerprint, summary, seed } */
  plan: async (ctx, request) => {
    const data = await gather(ctx, request);
    const { exam, papers, sectionsById, dates } = data;
    const classOf = paper => sectionsById.get(paper.sectionId)?.classId ?? paper.sectionId;
    const nameOf = paper =>
      sectionsById.has(paper.sectionId) ? sectionName(sectionsById.get(paper.sectionId)) : paper.section.sectionName;

    const kept = request.keepScheduled ? papers.filter(isScheduled) : [];
    const keptIds = new Set(kept.map(p => p.id));
    const toPlan = papers.filter(p => !keptIds.has(p.id));
    const seed = request.seed ?? newSeed();

    const solved = solveExamTimetable({
      dates,
      sessions: request.sessions,
      papers: toPlan.map(p => ({
        id: p.id,
        sectionId: p.sectionId,
        classId: classOf(p),
        subjectId: p.subjectId,
        component: p.component,
        durationMinutes: durationFor(request.durations, p, classOf(p))
      })),
      busy: [
        ...data.otherExams.map(p => ({
          sectionId: p.sectionId,
          date: p.examDate,
          startTime: hhmm(p.startTime),
          endTime: hhmm(p.endTime)
        })),
        ...kept.map(p => ({
          sectionId: p.sectionId,
          date: p.examDate,
          startTime: hhmm(p.startTime),
          endTime: hhmm(p.endTime)
        }))
      ],
      rules: {
        maxPapersPerDay: request.maxPapersPerDay,
        minGapDays: request.minGapDays,
        align: request.align,
        spread: request.spread,
        restDayBefore: request.restDayBefore
      },
      seed,
      attempts: request.attempts
    });

    const paperById = new Map(papers.map(p => [p.id, p]));
    const label = paper =>
      `${paper.subject.subjectName}${paper.component ? ` (${paper.component.toLowerCase()})` : ""}`;
    const issues = solved.issues.map(found => {
      if (found.code === "WINDOW_TOO_SHORT") {
        const section = sectionsById.get(found.sectionId);
        return {
          ...found,
          message: `${section ? sectionName(section) : "A section"} has ${plural(found.needed, "paper")} but the ${plural(found.schoolDays, "school day")} allow only ${found.available} with these rules. Widen the window, allow more papers a day or add a sitting.`
        };
      }
      if (found.code === "PAPER_TOO_LONG") {
        return {
          ...found,
          message: `${label(paperById.get(found.paperIds[0]))} lasts ${found.needed} minutes, longer than any sitting (${found.available} minutes)`
        };
      }
      return { ...found, message: found.code };
    });
    const unplaced = solved.unplaced.map(entry => {
      const first = paperById.get(entry.paperIds[0]);
      const reasons = Object.entries(entry.reasons)
        .sort((a, b) => b[1] - a[1])
        .map(([code, sittings]) => ({ code, sittings, text: REASON_TEXT[code] ?? code }));
      const sectionNames = entry.sectionIds.map(id =>
        nameOf(paperById.get(entry.paperIds[entry.sectionIds.indexOf(id)]))
      );
      return {
        ...entry,
        subjectName: first.subject.subjectName,
        sectionNames,
        reasons,
        message: `${label(first)} for ${sectionNames.join(", ")}: no sitting left${reasons[0] ? `; in most ${reasons[0].text}` : ""}`
      };
    });

    const rows = [
      ...kept.map(p => ({
        paperId: p.id,
        examDate: p.examDate,
        startTime: hhmm(p.startTime),
        endTime: hhmm(p.endTime),
        kept: true
      })),
      ...solved.rows
    ].sort((a, b) => a.examDate.localeCompare(b.examDate) || a.startTime.localeCompare(b.startTime));
    const placed = solved.score.placedPapers + kept.length;
    const complete = placed === papers.length;
    const firstDate = rows[0]?.examDate ?? null;
    const lastDate = rows.at(-1)?.examDate ?? null;

    return {
      academicYear: data.academicYear,
      examId: exam.id,
      seed,
      request,
      result: { rows },
      report: {
        issues,
        unplaced,
        score: { ...solved.score, requiredPapers: papers.length, placedPapers: placed, complete, firstDate, lastDate },
        stats: solved.stats,
        window: {
          startDate: data.startDate,
          endDate: data.endDate,
          schoolDays: dates.length,
          closedDays: data.closedDays.length
        },
        changes: { schedule: solved.rows.length, keep: kept.length }
      },
      fingerprint: fingerprint(data, request),
      summary: `${exam.examName} · ${placed} of ${papers.length} papers placed${firstDate ? ` · ${firstDate} to ${lastDate}` : ""}${complete ? "" : ` · ${papers.length - placed} left`}`
    };
  },

  currentFingerprint: async (ctx, request) => fingerprint(await gather(ctx, request), request),

  /* The papers with names, for previews */
  papersOf: (ctx, examId) => examPaperService.findForExam(ctx, examId)
};
