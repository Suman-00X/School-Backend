import { eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { ROLE_GROUPS } from "../../../../common/auth/roles.js";
import { publish } from "../../../../common/events/events.js";
import { forbidden, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { maxDate, minDate } from "../../../../common/utils/date.util.js";
import { enrollmentService } from "../../enrollments/index.js";
import { homeworkService } from "../../homework/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { SUBJECT_KINDS } from "../constants/diary.constants.js";
import { diaryEntries, diarySignatures } from "../models/diary.schema.js";
import { diaryEntryRepository, diarySignatureRepository } from "../repositories/diary.repository.js";

export const DIARY_ENTRY_WRITTEN = "academics.diary.entryWritten";
export const DIARY_PARENT_NOTE = "academics.diary.parentNote";

const PERSON = { columns: { id: true, firstName: true, lastName: true, role: true } };
const ENTRY_WITH = {
  subject: { columns: { id: true, subjectName: true, subjectCode: true } },
  student: { columns: { id: true, admissionNumber: true }, with: { user: { columns: { firstName: true, lastName: true } } } },
  writer: PERSON
};
const SIGNATURE_WITH = { signer: PERSON };

const canChange = (ctx, entry) => ROLE_GROUPS.MANAGEMENT.includes(ctx.role) || entry.writtenBy === ctx.userId;

const view = (ctx, entry) => ({ ...entry, canEdit: canChange(ctx, entry) });

/* Online homework set that day, shown in the diary beside the written lines */
const homeworkLine = h => ({ id: h.id, title: h.title, dueDate: h.dueDate, subject: h.subject ?? null });

const assertInYear = (date, year) => {
  if (date < year.startDate || date > year.endDate)
    throw unprocessable(`The date must be within ${year.yearName} (${year.startDate} to ${year.endDate})`);
};

/* The diary is written on the day (or later, to catch up), never ahead */
const assertWritableDate = async (ctx, date) => {
  assertInYear(date, ctx.academicYear);
  if (date > (await tenantToday(ctx.tenantId))) throw unprocessable("The diary can't be written for a day that hasn't come yet");
};

/* from..to, kept inside the year */
const clampToYear = ({ from, to }, year) => ({ from: maxDate(from, year.startDate), to: minDate(to, year.endDate) });

/* Classwork and homework name a subject; only a note can be for one student */
const assertShape = ({ kind, subjectId, studentId }) => {
  if (SUBJECT_KINDS.includes(kind) && !subjectId) throw unprocessable("Classwork and homework need a subject");
  if (studentId && kind !== "NOTE") throw unprocessable("Only a note can be written to one student's family");
};

/* A section of the header's year that the caller may read (teachers: one they teach) */
const readableSection = async (ctx, sectionId) => {
  const section = await sectionService.findById(ctx, sectionId);
  if (!section || section.academicYearId !== ctx.academicYearId) throw notFound("Section");
  await teachingScope.assertSection(ctx, sectionId);
  return section;
};

/* A subject's line: its teacher (the class teacher reaches every subject). A line for the
   whole section without a subject: the class teacher or the deputy. */
const assertCanWrite = async (ctx, section, subjectId) => {
  if (subjectId) {
    await teachingScope.assertSection(ctx, section.id, { subjectId });
    if (!(await sectionSubjectService.isTaught(ctx, section.academicYearId, section.id, subjectId)))
      throw unprocessable("This subject is not taught in the section");
    return;
  }
  await teachingScope.assertSection(ctx, section.id);
  if (!(await teachingScope.leadsSection(ctx, section.id)))
    throw forbidden("Only the class teacher or the deputy can write a line without a subject; pick the subject you teach");
};

const findEntry = (ctx, entryId) => diaryEntryRepository.findById(ctx.tenantId, entryId, { with: ENTRY_WITH });

/* Teachers reach entries of the sections they teach, and the ones they wrote */
const loadVisible = async (ctx, entryId) => {
  const entry = await findEntry(ctx, entryId);
  if (!entry) throw notFound("Diary entry");
  if (entry.writtenBy !== ctx.userId && !(await teachingScope.canAccessSection(ctx, entry.sectionId)))
    throw notFound("Diary entry");
  return entry;
};

const loadForChange = async (ctx, entryId) => {
  const entry = await loadVisible(ctx, entryId);
  if (!canChange(ctx, entry)) throw forbidden("Only the teacher who wrote this line, the principal or an admin can change it");
  if (entry.academicYearId !== ctx.academicYearId)
    throw unprocessable("This line belongs to another academic year; switch to that year to change it");
  return entry;
};

const entriesWhere = (ctx, conditions) =>
  diaryEntryRepository.findMany(ctx.tenantId, { conditions, with: ENTRY_WITH });

/* What one family reads: the section's lines plus the notes to their child */
const familyLines = (sectionId, studentId) => [
  eq(diaryEntries.sectionId, sectionId),
  or(isNull(diaryEntries.studentId), eq(diaryEntries.studentId, studentId))
];

const latest = dates => dates.filter(Boolean).reduce((a, b) => (new Date(a) > new Date(b) ? a : b), null);

/* Signed before the day's lines last changed: the family should read it again */
const isStale = (signature, lastChangedAt) =>
  Boolean(signature && lastChangedAt && new Date(lastChangedAt) > new Date(signature.signedAt));

const byRoll = (a, b) => String(a.rollNumber ?? "").localeCompare(String(b.rollNumber ?? ""), undefined, { numeric: true });

/* The student's enrollment in the header's year; families read their child's section diary */
const enrollmentOf = async (ctx, studentId) => {
  const enrollment = await enrollmentService.findForStudent(ctx, studentId, ctx.academicYearId);
  if (!enrollment) throw unprocessable(`The student is not enrolled in ${ctx.academicYear.yearName}`);
  return enrollment;
};

export const diaryService = {
  /* ---------- Staff ---------- (reads take any date: a day outside the year is just empty) */

  create: async (ctx, { sectionId, entryDate, kind, subjectId, studentId, body }) => {
    const section = await sectionService.findById(ctx, sectionId);
    if (!section || section.academicYearId !== ctx.academicYearId)
      throw unprocessable(`sectionId does not refer to a section of ${ctx.academicYear.yearName}`);
    assertShape({ kind, subjectId, studentId });
    await assertWritableDate(ctx, entryDate);
    await assertCanWrite(ctx, section, subjectId);
    if (
      studentId &&
      !(await enrollmentService.isStudentInSection(ctx, studentId, sectionId, section.academicYearId, { activeOnly: true }))
    )
      throw unprocessable("The student is not in this section");
    const created = await diaryEntryRepository.create(ctx.tenantId, {
      academicYearId: section.academicYearId,
      sectionId,
      entryDate,
      kind,
      subjectId: subjectId ?? null,
      studentId: studentId ?? null,
      body,
      writtenBy: ctx.userId
    });
    await publish(DIARY_ENTRY_WRITTEN, { tenantId: ctx.tenantId, entryId: created.id });
    return view(ctx, await findEntry(ctx, created.id));
  },

  /* Kind, subject and text; the day, section and student stay (remove and rewrite instead) */
  update: async (ctx, entryId, data) => {
    const entry = await loadForChange(ctx, entryId);
    const next = {
      kind: data.kind ?? entry.kind,
      subjectId: data.subjectId !== undefined ? data.subjectId : entry.subjectId,
      studentId: entry.studentId
    };
    assertShape(next);
    if (next.subjectId !== entry.subjectId) await assertCanWrite(ctx, await sectionService.findById(ctx, entry.sectionId), next.subjectId);
    await diaryEntryRepository.update(ctx.tenantId, entryId, { ...data, subjectId: next.subjectId });
    return view(ctx, await findEntry(ctx, entryId));
  },

  remove: async (ctx, entryId) => {
    await loadForChange(ctx, entryId);
    await diaryEntryRepository.softDelete(ctx.tenantId, entryId);
  },

  /* A section's day: the written lines, online homework set that day, and how many families signed */
  day: async (ctx, sectionId, date) => {
    await readableSection(ctx, sectionId);
    const [entries, homework, roster, signatures] = await Promise.all([
      entriesWhere(ctx, [eq(diaryEntries.sectionId, sectionId), eq(diaryEntries.entryDate, date)]),
      homeworkService.assignedOn(ctx, sectionId, date),
      enrollmentService.findRoster(ctx, sectionId),
      diarySignatureRepository.findMany(ctx.tenantId, {
        conditions: [eq(diarySignatures.sectionId, sectionId), eq(diarySignatures.entryDate, date)]
      })
    ]);
    const inRoster = new Set(roster.map(e => e.studentId));
    const signed = signatures.filter(s => inRoster.has(s.studentId));
    return {
      date,
      sectionId,
      entries: entries.map(e => view(ctx, e)),
      homework: homework.map(homeworkLine),
      signatures: { students: roster.length, signed: signed.length, notes: signed.filter(s => s.parentNote).length }
    };
  },

  /* The section's students for a day: who signed, when, and the parents' notes */
  signatures: async (ctx, sectionId, date) => {
    await readableSection(ctx, sectionId);
    const roster = await enrollmentService.findRoster(ctx, sectionId);
    const studentIds = roster.map(e => e.studentId);
    const [signatures, entries] = await Promise.all([
      studentIds.length
        ? diarySignatureRepository.findMany(ctx.tenantId, {
            conditions: [inArray(diarySignatures.studentId, studentIds), eq(diarySignatures.entryDate, date)],
            with: SIGNATURE_WITH
          })
        : [],
      diaryEntryRepository.findMany(ctx.tenantId, {
        conditions: [eq(diaryEntries.sectionId, sectionId), eq(diaryEntries.entryDate, date)]
      })
    ]);
    const bySectionChange = latest(entries.filter(e => !e.studentId).map(e => e.updatedAt));
    const byStudent = new Map(signatures.map(s => [s.studentId, s]));
    return roster
      .map(e => {
        const signature = byStudent.get(e.studentId) ?? null;
        const lastChangedAt = latest([
          bySectionChange,
          ...entries.filter(x => x.studentId === e.studentId).map(x => x.updatedAt)
        ]);
        return {
          studentId: e.studentId,
          rollNumber: e.rollNumber,
          admissionNumber: e.student?.admissionNumber ?? null,
          firstName: e.student?.user?.firstName ?? "",
          lastName: e.student?.user?.lastName ?? "",
          signature,
          changedSinceSigned: isStale(signature, lastChangedAt)
        };
      })
      .sort(byRoll);
  },

  /* Per day in a range (inside the year): lines written and diaries signed, newest first */
  days: async (ctx, sectionId, range) => {
    await readableSection(ctx, sectionId);
    const { from, to } = clampToYear(range, ctx.academicYear);
    if (from > to) return [];
    const inRange = table => [gte(table.entryDate, from), lte(table.entryDate, to)];
    const [written, signed] = await Promise.all([
      diaryEntryRepository.perDay(ctx.tenantId, [eq(diaryEntries.sectionId, sectionId), ...inRange(diaryEntries)]),
      diarySignatureRepository.perDay(ctx.tenantId, [eq(diarySignatures.sectionId, sectionId), ...inRange(diarySignatures)])
    ]);
    const days = new Map(written.map(d => [d.date, { date: d.date, entries: d.entries, signed: 0 }]));
    for (const d of signed) days.set(d.date, { date: d.date, entries: days.get(d.date)?.entries ?? 0, signed: d.signed });
    return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
  },

  /* ---------- Portal (callers check that the student is theirs) ---------- */

  /* Per day: lines the family can read, and whether (and since when) it was signed */
  daysForStudent: async (ctx, studentId, range) => {
    const enrollment = await enrollmentService.findForStudent(ctx, studentId, ctx.academicYearId);
    if (!enrollment) return [];
    const { from, to } = clampToYear(range, ctx.academicYear);
    if (from > to) return [];
    const [written, signatures] = await Promise.all([
      diaryEntryRepository.perDay(ctx.tenantId, [
        ...familyLines(enrollment.sectionId, studentId),
        gte(diaryEntries.entryDate, from),
        lte(diaryEntries.entryDate, to)
      ]),
      diarySignatureRepository.findMany(ctx.tenantId, {
        conditions: [eq(diarySignatures.studentId, studentId), gte(diarySignatures.entryDate, from), lte(diarySignatures.entryDate, to)]
      })
    ]);
    const signatureOn = new Map(signatures.map(s => [s.entryDate, s]));
    const days = written.map(d => {
      const signature = signatureOn.get(d.date) ?? null;
      return {
        date: d.date,
        entries: d.entries,
        signedAt: signature?.signedAt ?? null,
        changedSinceSigned: isStale(signature, d.lastChangedAt)
      };
    });
    /* Days signed with only a note to the teacher */
    for (const s of signatures)
      if (!days.some(d => d.date === s.entryDate))
        days.push({ date: s.entryDate, entries: 0, signedAt: s.signedAt, changedSinceSigned: false });
    return days.sort((a, b) => b.date.localeCompare(a.date));
  },

  /* The child's diary for a day: the section's lines, notes to them, homework set, the signature */
  dayForStudent: async (ctx, studentId, date) => {
    const enrollment = await enrollmentOf(ctx, studentId);
    const [entries, homework, signature] = await Promise.all([
      entriesWhere(ctx, [...familyLines(enrollment.sectionId, studentId), eq(diaryEntries.entryDate, date)]),
      homeworkService.assignedOn(ctx, enrollment.sectionId, date),
      diarySignatureRepository.findOne(
        ctx.tenantId,
        [eq(diarySignatures.studentId, studentId), eq(diarySignatures.entryDate, date)],
        { with: SIGNATURE_WITH }
      )
    ]);
    return {
      date,
      sectionId: enrollment.sectionId,
      entries,
      homework: homework.map(homeworkLine),
      signature,
      changedSinceSigned: isStale(signature, latest(entries.map(e => e.updatedAt)))
    };
  },

  /* A parent signs the day (any day of the year up to today, even with nothing written, to send
     a note). Signing again replaces the signature and the note. */
  sign: async (ctx, studentId, { date, note }) => {
    const enrollment = await enrollmentOf(ctx, studentId);
    await assertWritableDate(ctx, date);
    const existing = await diarySignatureRepository.findOne(ctx.tenantId, [
      eq(diarySignatures.studentId, studentId),
      eq(diarySignatures.entryDate, date)
    ]);
    const values = { signedBy: ctx.userId, signedAt: new Date(), parentNote: note || null };
    const saved = existing
      ? await diarySignatureRepository.update(ctx.tenantId, existing.id, values)
      : await diarySignatureRepository.create(ctx.tenantId, {
          ...values,
          academicYearId: ctx.academicYearId,
          studentId,
          sectionId: enrollment.sectionId,
          entryDate: date
        });
    if (values.parentNote && values.parentNote !== existing?.parentNote)
      await publish(DIARY_PARENT_NOTE, { tenantId: ctx.tenantId, signatureId: saved.id });
    const signature = await diarySignatureRepository.findById(ctx.tenantId, saved.id, { with: SIGNATURE_WITH });
    return { signature, again: Boolean(existing) };
  },

  /* ---------- For the notification subscriber ---------- */

  findEntry: (ctx, entryId) => findEntry(ctx, entryId),

  findSignature: (ctx, signatureId) =>
    diarySignatureRepository.findById(ctx.tenantId, signatureId, {
      with: { ...SIGNATURE_WITH, student: { columns: { id: true }, with: { user: { columns: { firstName: true, lastName: true } } } } }
    }),

  /* Students who read a line: the one it is for, or everyone in the section */
  readersOf: async (ctx, entry) =>
    entry.studentId ? [entry.studentId] : (await enrollmentService.findRoster(ctx, entry.sectionId)).map(e => e.studentId),

  /* Teachers who wrote notes to this student on the day (a parent's note may answer them) */
  noteWritersFor: async (ctx, studentId, date) =>
    (
      await diaryEntryRepository.findMany(ctx.tenantId, {
        conditions: [eq(diaryEntries.studentId, studentId), eq(diaryEntries.entryDate, date)]
      })
    ).map(e => e.writtenBy)
};
