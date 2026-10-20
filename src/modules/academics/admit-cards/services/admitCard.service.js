import { eq } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { publish } from "../../../../common/events/events.js";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { academicYearService } from "../../academic-years/index.js";
import { examEligibilityService } from "../../exam-eligibility/index.js";
import { examPaperService, examService } from "../../exams/index.js";
import { admitCards } from "../models/admitCard.schema.js";
import { admitCardRepository } from "../repositories/admitCard.repository.js";

/* Admit cards were issued (or issued again after a withdrawal) to these students:
   { tenantId, examId, studentIds } */
export const ADMIT_CARDS_ISSUED = "academics.admitCards.issued";

const NOT_IN_SECTION = "No longer enrolled in the section";

/* The papers a section sits, in the order they are written */
const paperLines = papers =>
  papers
    .map(paper => ({
      subjectName: paper.subject?.subjectName,
      component: paper.component,
      displayCode: paper.displayCode,
      examDate: paper.examDate,
      startTime: paper.startTime,
      endTime: paper.endTime,
      room: paper.room
    }))
    .sort(
      (a, b) =>
        (a.examDate ?? "9999").localeCompare(b.examDate ?? "9999") ||
        (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
        a.displayCode.localeCompare(b.displayCode)
    );

const cardView = card => ({
  id: card.id,
  examId: card.examId,
  studentId: card.studentId,
  sectionId: card.sectionId,
  status: card.status,
  issuedAt: card.issuedAt,
  withdrawnAt: card.withdrawnAt,
  withdrawnReason: card.withdrawnReason,
  ...card.details
});

export const admitCardService = {
  /* Make an exam's admit cards match who is eligible today, for every section sitting it
     (or one): a card for each eligible student (its details refreshed when it exists),
     and cards withdrawn from students no longer eligible or no longer in the section. */
  generate: async (ctx, examId, { sectionId } = {}) => {
    const eligibility = await examEligibilityService.evaluate(ctx, examId, { sectionId });
    await academicYearService.assertWritable(ctx, eligibility.exam.academicYearId);
    if (!eligibility.sections.length) throw unprocessable("Add the exam's papers before generating admit cards");
    const papers = await examPaperService.findForExam(ctx, examId, { sectionId });
    const papersOf = new Map();
    for (const paper of papers) papersOf.set(paper.sectionId, [...(papersOf.get(paper.sectionId) ?? []), paper]);
    const { exam } = eligibility;
    const sectionIds = eligibility.sections.map(s => s.section.id);

    const summary = await transaction(async tx => {
      const existing = await admitCardRepository.findMany(ctx.tenantId, {
        conditions: [eq(admitCards.examId, examId)],
        dbc: tx
      });
      const cardOf = new Map(existing.map(card => [card.studentId, card]));
      const now = new Date();
      const counts = { issued: 0, refreshed: 0, withdrawn: 0, notEligible: 0 };
      const newlyIssued = [];
      const seen = new Set();

      for (const { section, students } of eligibility.sections) {
        const lines = paperLines(papersOf.get(section.id) ?? []);
        for (const student of students) {
          seen.add(student.studentId);
          const card = cardOf.get(student.studentId);
          if (!student.eligible) {
            counts.notEligible++;
            if (card?.status === "ISSUED") {
              await admitCardRepository.update(
                ctx.tenantId,
                card.id,
                { status: "WITHDRAWN", withdrawnAt: now, withdrawnReason: student.reasons.join("; ") },
                { dbc: tx }
              );
              counts.withdrawn++;
            }
            continue;
          }
          const values = {
            sectionId: section.id,
            status: "ISSUED",
            withdrawnAt: null,
            withdrawnReason: null,
            details: {
              student: {
                firstName: student.firstName,
                lastName: student.lastName,
                admissionNumber: student.admissionNumber,
                rollNumber: student.rollNumber,
                section: section.name
              },
              exam: { examName: exam.examName, startDate: exam.startDate, endDate: exam.endDate },
              papers: lines
            }
          };
          if (!card) {
            await admitCardRepository.create(
              ctx.tenantId,
              { ...values, academicYearId: exam.academicYearId, examId, studentId: student.studentId, issuedBy: ctx.userId ?? null },
              { dbc: tx }
            );
            counts.issued++;
            newlyIssued.push(student.studentId);
          } else if (card.status === "WITHDRAWN") {
            await admitCardRepository.update(
              ctx.tenantId,
              card.id,
              { ...values, issuedAt: now, issuedBy: ctx.userId ?? null },
              { dbc: tx }
            );
            counts.issued++;
            newlyIssued.push(student.studentId);
          } else {
            await admitCardRepository.update(ctx.tenantId, card.id, values, { dbc: tx });
            counts.refreshed++;
          }
        }
      }

      /* Cards of students who left one of these sections */
      for (const card of existing) {
        if (card.status !== "ISSUED" || seen.has(card.studentId) || !sectionIds.includes(card.sectionId)) continue;
        await admitCardRepository.update(
          ctx.tenantId,
          card.id,
          { status: "WITHDRAWN", withdrawnAt: now, withdrawnReason: NOT_IN_SECTION },
          { dbc: tx }
        );
        counts.withdrawn++;
      }
      return { ...counts, newlyIssued };
    });

    const { newlyIssued, ...counts } = summary;
    if (newlyIssued.length) await publish(ADMIT_CARDS_ISSUED, { tenantId: ctx.tenantId, examId, studentIds: newlyIssued });
    return { exam: { id: exam.id, examName: exam.examName }, ...counts };
  },

  /* The exam's papers were rescheduled, moved room, added or removed (EXAM_SCHEDULE_CHANGED):
     issued cards show the papers as they are now. Who holds a card changes only on generate. */
  refreshPapers: async (ctx, examId) => {
    const exam = await examService.findById(ctx, examId);
    if (!exam) return;
    const year = await academicYearService.findById(ctx, exam.academicYearId);
    if (year?.archivedAt) return;
    const cards = await admitCardRepository.findMany(ctx.tenantId, {
      conditions: [eq(admitCards.examId, examId), eq(admitCards.status, "ISSUED")]
    });
    if (!cards.length) return;
    const papers = await examPaperService.findForExam(ctx, examId);
    const linesOf = new Map();
    for (const paper of papers) linesOf.set(paper.sectionId, [...(linesOf.get(paper.sectionId) ?? []), paper]);
    for (const [sectionId, sectionPapers] of linesOf) linesOf.set(sectionId, paperLines(sectionPapers));
    /* The exam's own dates follow the papers in a separate job: take them from the papers */
    const dates = papers.map(p => p.examDate).filter(Boolean).sort();
    const examDetails = { examName: exam.examName, startDate: dates[0] ?? exam.startDate, endDate: dates.at(-1) ?? exam.endDate };
    await transaction(async tx => {
      for (const card of cards) {
        const details = { ...card.details, exam: examDetails, papers: linesOf.get(card.sectionId) ?? [] };
        await admitCardRepository.update(ctx.tenantId, card.id, { details }, { dbc: tx });
      }
    });
  },

  /* An exam's cards, issued and withdrawn (one section: sectionId) */
  list: async (ctx, examId, { sectionId } = {}) =>
    (
      await admitCardRepository.findMany(ctx.tenantId, {
        conditions: [eq(admitCards.examId, examId), sectionId && eq(admitCards.sectionId, sectionId)].filter(Boolean)
      })
    ).map(cardView),

  /* One card of an exam (staff) */
  get: async (ctx, examId, admitCardId) => {
    const card = await admitCardRepository.findOne(ctx.tenantId, [
      eq(admitCards.id, admitCardId),
      eq(admitCards.examId, examId)
    ]);
    if (!card) throw notFound("Admit card");
    return cardView(card);
  },

  /* A section's issued cards, by roll number (printing them together) */
  issuedInSection: async (ctx, examId, sectionId) => {
    const cards = (await admitCardService.list(ctx, examId, { sectionId })).filter(card => card.status === "ISSUED");
    if (!cards.length) throw notFound("Issued admit cards for this section");
    return cards.sort((a, b) => String(a.student.rollNumber ?? "").localeCompare(String(b.student.rollNumber ?? ""), undefined, { numeric: true }));
  },

  /* Issued cards of a student in a year (the current one by default), for the portal */
  forStudent: async (ctx, studentId, { academicYearId } = {}) => {
    const year = academicYearId
      ? await academicYearService.findById(ctx, academicYearId)
      : await academicYearService.findCurrent(ctx);
    if (!year) return [];
    return (
      await admitCardRepository.findMany(ctx.tenantId, {
        conditions: [
          eq(admitCards.studentId, studentId),
          eq(admitCards.academicYearId, year.id),
          eq(admitCards.status, "ISSUED")
        ]
      })
    ).map(cardView);
  },

  /* The exam is being removed: its cards go with it */
  releaseExam: (ctx, examId, { dbc }) =>
    admitCardRepository.softDeleteWhere(ctx.tenantId, [eq(admitCards.examId, examId)], { dbc }),

  /* One issued card of a student (portal) */
  issuedToStudent: async (ctx, studentId, admitCardId) => {
    const card = await admitCardRepository.findOne(ctx.tenantId, [
      eq(admitCards.id, admitCardId),
      eq(admitCards.studentId, studentId),
      eq(admitCards.status, "ISSUED")
    ]);
    if (!card) throw notFound("Admit card");
    return cardView(card);
  }
};
