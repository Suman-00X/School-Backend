import { eq } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { classService } from "../../classes/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { subjectCodeService } from "../../subject-codes/index.js";
import { subjectService } from "../../subjects/index.js";
import { classSubjects } from "../models/classSubject.schema.js";
import { classSubjectRepository } from "../repositories/classSubject.repository.js";

const withSubject = { subject: { columns: { id: true, subjectName: true, subjectCode: true, subjectType: true } } };

/* The class's sections in a year, by name */
const sectionsOf = async (ctx, academicYearId, classId) =>
  (await sectionService.findAllInYear(ctx, academicYearId))
    .filter(section => section.classId === classId)
    .sort((a, b) => a.sectionName.localeCompare(b.sectionName));

const sectionIdsOf = async (ctx, academicYearId, classId) =>
  (await sectionsOf(ctx, academicYearId, classId)).map(section => section.id);

const inClass = (academicYearId, classId, subjectId) =>
  [
    eq(classSubjects.academicYearId, academicYearId),
    eq(classSubjects.classId, classId),
    subjectId && eq(classSubjects.subjectId, subjectId)
  ].filter(Boolean);

/* What a section subject copies from its class subject (its code, MA221-A, starts with the class subject's) */
const copied = row => ({
  classSubjectCode: row.code,
  weeklyNoOfClasses: row.weeklyNoOfClasses ?? undefined,
  description: row.description ?? undefined
});

const findOrThrow = async (ctx, classSubjectId) => {
  const row = await classSubjectRepository.findById(ctx.tenantId, classSubjectId, {
    with: { ...withSubject, class: { columns: { className: true } } }
  });
  if (!row) throw notFound("Class subject");
  return row;
};

export const classSubjectService = {
  /* Year-scoped: a class's subjects, each with the class's sections and whether each is taught it */
  list: async (ctx, { page, limit, classId }) => {
    const result = await classSubjectRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: inClass(ctx.academicYearId, classId),
      with: withSubject
    });
    const sections = await sectionsOf(ctx, ctx.academicYearId, classId);
    const taught = await sectionSubjectService.findForSections(
      ctx,
      sections.map(section => section.id)
    );
    return {
      ...result,
      rows: result.rows.map(row => ({
        ...row,
        sections: sections.map(section => {
          const sectionSubject = taught.find(t => t.sectionId === section.id && t.subjectId === row.subjectId);
          return { id: section.id, sectionName: section.sectionName, sectionSubjectId: sectionSubject?.id ?? null };
        })
      }))
    };
  },

  /* An existing subject (subjectId) or a new one (subject) for the class. A required one is
     added to every section of the class; an optional one to none (they are given it one by one). */
  create: async (ctx, { classId, subjectId, subject: newSubject, isOptional = false, weeklyNoOfClasses, description }) => {
    const schoolClass = await classService.findById(ctx, classId);
    if (!schoolClass) throw unprocessable("classId does not refer to an existing class");
    const academicYearId = ctx.academicYearId;

    let existing = null;
    if (subjectId) {
      existing = await subjectService.findById(ctx, subjectId);
      if (!existing) throw unprocessable("subjectId does not refer to an existing subject");
      if (await classSubjectRepository.exists(ctx.tenantId, inClass(academicYearId, classId, subjectId))) {
        throw conflict(`${existing.subjectName} is already a subject of ${schoolClass.className}`);
      }
    }

    const sectionIds = isOptional ? [] : await sectionIdsOf(ctx, academicYearId, classId);
    const code = await subjectCodeService.codeFor(ctx, {
      classId,
      subjectCode: (existing ?? newSubject).subjectCode,
      isOptional
    });
    return transaction(async dbc => {
      const subject = existing ?? (await subjectService.create(ctx, { ...newSubject, isOptional }, { dbc }));
      const row = await classSubjectRepository.create(
        ctx.tenantId,
        { academicYearId, classId, subjectId: subject.id, isOptional, code, weeklyNoOfClasses, description },
        { dbc }
      );
      const added = await sectionSubjectService.addToSections(ctx, academicYearId, sectionIds, subject, copied(row), { dbc });
      return { ...row, subject, className: schoolClass.className, sectionsAdded: added.length };
    });
  },

  /* Made required: added to the sections that lack it. Classes a week and the note follow
     to the sections that have it. Made optional: the sections keep it. Either way the code's last
     digit changes (MA221 <-> MA220), so it may change only while no exam paper or assessment uses it. */
  update: async (ctx, classSubjectId, { isOptional, weeklyNoOfClasses, description }) => {
    const before = await findOrThrow(ctx, classSubjectId);
    const sectionIds = await sectionIdsOf(ctx, before.academicYearId, before.classId);
    return transaction(async dbc => {
      if (isOptional !== undefined && isOptional !== before.isOptional) {
        await subjectCodeService.changeOptional(
          ctx,
          { id: classSubjectId, subjectName: before.subject.subjectName, className: before.class.className },
          isOptional,
          { dbc }
        );
      }
      const row = await classSubjectRepository.update(
        ctx.tenantId,
        classSubjectId,
        { isOptional, weeklyNoOfClasses, description },
        { dbc }
      );
      const values = Object.fromEntries(
        Object.entries({ weeklyNoOfClasses, description }).filter(([, value]) => value !== undefined)
      );
      await sectionSubjectService.updateInSections(ctx, sectionIds, row.subjectId, values, { dbc });
      const added =
        before.isOptional && isOptional === false
          ? await sectionSubjectService.addToSections(ctx, row.academicYearId, sectionIds, before.subject, copied(row), { dbc })
          : [];
      return { ...row, subject: before.subject, className: before.class.className, sectionsAdded: added.length };
    });
  },

  /* Takes the subject off the class and off every section of it */
  remove: async (ctx, classSubjectId) => {
    const row = await findOrThrow(ctx, classSubjectId);
    const sectionIds = await sectionIdsOf(ctx, row.academicYearId, row.classId);
    return transaction(async dbc => {
      await classSubjectRepository.softDelete(ctx.tenantId, classSubjectId, { dbc });
      const removed = await sectionSubjectService.removeFromSections(ctx, sectionIds, row.subjectId, { dbc });
      return { ...row, sectionsRemoved: removed.length };
    });
  },

  /* For section subjects: a subject given to a section straight away becomes an optional
     subject of its class when the class does not have it yet -> the class subject */
  ensureForClass: async (ctx, academicYearId, classId, subject) => {
    const existing = await classSubjectRepository.findOne(ctx.tenantId, inClass(academicYearId, classId, subject.id));
    if (existing) return existing;
    const code = await subjectCodeService.codeFor(ctx, { classId, subjectCode: subject.subjectCode, isOptional: true });
    return classSubjectRepository.create(ctx.tenantId, { academicYearId, classId, subjectId: subject.id, isOptional: true, code });
  },

  /* For sections: a newly created section gets its class's required subjects */
  applyToSections: async (ctx, academicYearId, newSections) => {
    for (const section of newSections) {
      const rows = await classSubjectRepository.findMany(ctx.tenantId, {
        conditions: [...inClass(academicYearId, section.classId), eq(classSubjects.isOptional, false)],
        with: withSubject
      });
      for (const row of rows) {
        await sectionSubjectService.addToSections(ctx, academicYearId, [section.id], row.subject, copied(row));
      }
    }
  }
};
