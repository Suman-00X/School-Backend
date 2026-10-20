import { and, eq, inArray, or, sql } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { academicYearService } from "../../academic-years/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { assessments } from "../models/assessment.schema.js";
import { assessmentRepository } from "../repositories/assessment.repository.js";

/* Teachers' own marked work (tests, assignments, projects, homework) in a scheme bucket.

   Per section and subject, a bucket's counted items that have marks are averaged per
   student, each item's percentage counting equally. ABSENT and a missing entry count 0%;
   EXEMPT and MEDICAL drop the item for that student. An item nobody has marks for yet is
   left out, so a new test does not pull everyone to 0. */

const withDetails = {
  section: { columns: { id: true, sectionName: true, classId: true } },
  subject: { columns: { id: true, subjectName: true, subjectCode: true } }
};

const EXCLUDING = new Set(["EXEMPT", "MEDICAL"]);
const sum = values => values.reduce((total, value) => total + value, 0);
const round2 = value => Math.round(value * 100) / 100;

const bucketView = bucket => ({
  id: bucket.id,
  name: bucket.name,
  weight: bucket.weight,
  scheme: { id: bucket.schemeId, name: bucket.schemeName, resultsPublishedAt: bucket.resultsPublishedAt },
  locked: Boolean(bucket.resultsPublishedAt)
});

const assertUnlocked = bucket => {
  if (bucket.resultsPublishedAt) {
    throw conflict(`${bucket.schemeName} results are published. Withdraw them to change its teacher assessments.`);
  }
};

const loadBucket = async (ctx, bucketId, academicYearId) => {
  const bucket = await assessmentRepository.findBucket(ctx.tenantId, bucketId);
  if (!bucket) throw unprocessable("bucketId does not refer to a bucket of an assessment scheme");
  if (bucket.academicYearId !== academicYearId) {
    throw unprocessable(`${bucket.name} (${bucket.schemeName}) belongs to another academic year`);
  }
  return bucket;
};

const load = async (ctx, assessmentId) => {
  const item = await assessmentRepository.findById(ctx.tenantId, assessmentId, { with: withDetails });
  if (!item) throw notFound("Assessment");
  await teachingScope.assertSection(ctx, item.sectionId, { subjectId: item.subjectId });
  return item;
};

/* A section and subject the caller may mark, taught there, in a writable year */
const assertTarget = async (ctx, sectionId, subjectId) => {
  const section = await sectionService.findById(ctx, sectionId);
  if (!section) throw unprocessable("sectionId does not refer to an existing section");
  await teachingScope.assertSection(ctx, sectionId, { subjectId });
  if (!(await sectionSubjectService.isTaught(ctx, section.academicYearId, sectionId, subjectId))) {
    throw unprocessable("This subject is not taught in the section");
  }
  await academicYearService.assertWritable(ctx, section.academicYearId);
  return section;
};

const view = async (ctx, item) => {
  const bucket = await assessmentRepository.findBucket(ctx.tenantId, item.bucketId);
  return { ...item, bucket: bucket ? bucketView(bucket) : null };
};

/* A teacher's items: every subject of a section they lead as class teacher, else the subjects they
   teach there (the same rule as opening one). null: unrestricted. */
const scopeCondition = async ctx => {
  const scope = await teachingScope.of(ctx);
  if (!scope) return null;
  const parts = [
    scope.classTeacherOf.size && inArray(assessments.sectionId, [...scope.classTeacherOf]),
    ...[...scope.subjectsBySection.entries()]
      .filter(([sectionId, subjects]) => !scope.classTeacherOf.has(sectionId) && subjects.size)
      .map(([sectionId, subjects]) => and(eq(assessments.sectionId, sectionId), inArray(assessments.subjectId, [...subjects])))
  ].filter(Boolean);
  return parts.length ? or(...parts) : sql`false`;
};

/* One student's percentage on one item: a number, null (dropped) or undefined (no entry) */
const percentOf = (item, entry, graded) => {
  if (entry && EXCLUDING.has(entry.status)) return null;
  if (entry?.status === "ABSENT") return 0;
  const marks = item.homeworkId ? graded : entry?.marksObtained;
  return marks === null || marks === undefined ? undefined : (marks / item.maxMarks) * 100;
};

export const assessmentService = {
  /* Buckets teachers can fill in the year (pickers) */
  buckets: async ctx => (await assessmentRepository.bucketsInYear(ctx.tenantId, ctx.academicYearId)).map(bucketView),

  /* Year-scoped. Teachers see what they teach. */
  list: async (ctx, { page, limit, sectionId, subjectId, bucketId }) => {
    if (sectionId) await teachingScope.assertSection(ctx, sectionId, subjectId ? { subjectId } : {});
    const mine = await scopeCondition(ctx);
    const result = await assessmentRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withDetails,
      conditions: [
        eq(assessments.academicYearId, ctx.academicYearId),
        sectionId && eq(assessments.sectionId, sectionId),
        mine,
        subjectId && eq(assessments.subjectId, subjectId),
        bucketId && eq(assessments.bucketId, bucketId)
      ].filter(Boolean)
    });
    const [buckets, entries] = await Promise.all([
      assessmentRepository.bucketsInYear(ctx.tenantId, ctx.academicYearId),
      assessmentRepository.markedCounts(
        ctx.tenantId,
        result.rows.map(r => r.id)
      )
    ]);
    const bucketOf = new Map(buckets.map(b => [b.id, bucketView(b)]));
    return {
      ...result,
      rows: result.rows.map(r => ({ ...r, bucket: bucketOf.get(r.bucketId) ?? null, entries: entries.get(r.id) ?? 0 }))
    };
  },

  getById: async (ctx, assessmentId) => view(ctx, await load(ctx, assessmentId)),

  create: async (ctx, { bucketId, sectionId, subjectId, assessmentType, title, assessedOn, maxMarks, counts, description }) => {
    if (assessmentType === "HOMEWORK") {
      throw unprocessable("Homework counts through the homework itself: set its bucket when you give it");
    }
    const section = await assertTarget(ctx, sectionId, subjectId);
    assertUnlocked(await loadBucket(ctx, bucketId, section.academicYearId));
    const item = await assessmentRepository.create(ctx.tenantId, {
      academicYearId: section.academicYearId,
      bucketId,
      sectionId,
      subjectId,
      assessmentType,
      title,
      assessedOn,
      maxMarks,
      counts,
      description,
      createdBy: ctx.userId
    });
    return assessmentService.getById(ctx, item.id);
  },

  /* A homework item takes its title, date and max marks from the homework */
  update: async (ctx, assessmentId, data) => {
    const item = await load(ctx, assessmentId);
    await academicYearService.assertWritable(ctx, item.academicYearId);
    assertUnlocked(await loadBucket(ctx, item.bucketId, item.academicYearId));
    if (data.bucketId && data.bucketId !== item.bucketId) {
      assertUnlocked(await loadBucket(ctx, data.bucketId, item.academicYearId));
    }
    if (item.homeworkId && ["title", "assessedOn", "maxMarks", "description"].some(key => data[key] !== undefined)) {
      throw unprocessable("This item is homework: change its title, dates and marks on the homework");
    }
    if (data.maxMarks !== undefined) {
      const highest = await assessmentRepository.highestMark(ctx.tenantId, assessmentId);
      if (highest !== null && highest > data.maxMarks) {
        throw unprocessable(`maxMarks cannot be below the highest recorded mark (${highest})`);
      }
    }
    await assessmentRepository.update(ctx.tenantId, assessmentId, data);
    return assessmentService.getById(ctx, assessmentId);
  },

  remove: async (ctx, assessmentId) => {
    const item = await load(ctx, assessmentId);
    if (item.homeworkId) throw conflict("This item is homework: take the homework out of the bucket instead");
    await academicYearService.assertWritable(ctx, item.academicYearId);
    assertUnlocked(await loadBucket(ctx, item.bucketId, item.academicYearId));
    await transaction(async tx => {
      await assessmentRepository.removeMarks(ctx.tenantId, assessmentId, { dbc: tx });
      await assessmentRepository.softDelete(ctx.tenantId, assessmentId, { dbc: tx });
    });
    return item;
  },

  /* Every student of the section with their entry (homework: the graded marks) */
  marks: async (ctx, assessmentId) => {
    const item = await load(ctx, assessmentId);
    const [roster, entries, graded] = await Promise.all([
      enrollmentService.findRoster(ctx, item.sectionId, { includeLeft: true }),
      assessmentRepository.marksFor(ctx.tenantId, [item.id]),
      item.homeworkId ? assessmentRepository.gradedSubmissions(ctx.tenantId, [item.homeworkId]) : []
    ]);
    const entryOf = new Map(entries.map(e => [e.studentId, e]));
    const gradedOf = new Map(graded.map(g => [g.studentId, g.marksAwarded]));
    return {
      assessment: await view(ctx, item),
      students: roster.map(enrollment => {
        const entry = entryOf.get(enrollment.studentId) ?? null;
        const percent = percentOf(item, entry, gradedOf.get(enrollment.studentId));
        return {
          studentId: enrollment.studentId,
          rollNumber: enrollment.rollNumber,
          firstName: enrollment.student?.user?.firstName,
          lastName: enrollment.student?.user?.lastName,
          enrollmentStatus: enrollment.status,
          status: entry?.status ?? null,
          marksObtained: item.homeworkId ? (gradedOf.get(enrollment.studentId) ?? null) : (entry?.marksObtained ?? null),
          remarks: entry?.remarks ?? null,
          percentage: percent === null || percent === undefined ? null : round2(percent)
        };
      })
    };
  },

  /* Saves entries for students of the section. `clear: true` removes an entry.
     Homework items keep only a status (ABSENT, EXEMPT, MEDICAL); their marks are the grading. */
  recordMarks: async (ctx, assessmentId, entries) => {
    const item = await load(ctx, assessmentId);
    await academicYearService.assertWritable(ctx, item.academicYearId);
    assertUnlocked(await loadBucket(ctx, item.bucketId, item.academicYearId));
    const roster = await enrollmentService.findRoster(ctx, item.sectionId, { includeLeft: true });
    const enrolled = new Set(roster.map(e => e.studentId));
    const stranger = entries.find(e => !enrolled.has(e.studentId));
    if (stranger) throw unprocessable("One or more students are not in this section");

    const rows = [];
    for (const entry of entries.filter(e => !e.clear)) {
      if (item.homeworkId && entry.status === "MARKED") {
        throw unprocessable("Homework marks come from grading the submission; record only ABSENT, EXEMPT or MEDICAL");
      }
      if (entry.status === "MARKED" && entry.marksObtained > item.maxMarks) {
        throw unprocessable(`marksObtained cannot exceed ${item.maxMarks}`);
      }
      rows.push({
        assessmentId,
        studentId: entry.studentId,
        status: entry.status,
        marksObtained: entry.status === "MARKED" ? entry.marksObtained : null,
        remarks: entry.remarks ?? null,
        recordedBy: ctx.userId
      });
    }
    const cleared = entries.filter(e => e.clear).map(e => e.studentId);
    const saved = await transaction(async tx => {
      await assessmentRepository.clearMarks(ctx.tenantId, assessmentId, cleared, { dbc: tx });
      return rows.length ? assessmentRepository.upsertMarks(ctx.tenantId, rows, { dbc: tx }) : [];
    });
    return {
      created: saved.filter(r => r.created).length,
      updated: saved.filter(r => !r.created).length,
      cleared: cleared.length
    };
  },

  /* For assessment schemes */

  countByBucket: (ctx, bucketIds) => assessmentRepository.countByBucket(ctx.tenantId, bucketIds),

  /* A section's bucket averages -> scoreOf(bucketId, subjectId, studentId):
     undefined = the bucket has no marked items for the subject (it drops out),
     null = every item dropped for the student (exempt), else the average percentage */
  sectionScores: async (ctx, sectionId, bucketIds) => {
    if (!bucketIds.length) return () => undefined;
    const items = await assessmentRepository.findMany(ctx.tenantId, {
      conditions: [
        inArray(assessments.bucketId, bucketIds),
        eq(assessments.sectionId, sectionId),
        eq(assessments.counts, true)
      ]
    });
    const [entries, graded] = await Promise.all([
      assessmentRepository.marksFor(
        ctx.tenantId,
        items.map(i => i.id)
      ),
      assessmentRepository.gradedSubmissions(
        ctx.tenantId,
        items.filter(i => i.homeworkId).map(i => i.homeworkId)
      )
    ]);
    const entryOf = new Map(entries.map(e => [`${e.assessmentId}:${e.studentId}`, e]));
    const gradedOf = new Map(graded.map(g => [`${g.homeworkId}:${g.studentId}`, g.marksAwarded]));
    /* Started: someone has marks (or is marked absent) */
    const started = items.filter(
      item =>
        entries.some(e => e.assessmentId === item.id && (e.status === "MARKED" || e.status === "ABSENT")) ||
        (item.homeworkId && graded.some(g => g.homeworkId === item.homeworkId))
    );
    const groups = new Map();
    for (const item of started) {
      const key = `${item.bucketId}:${item.subjectId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return (bucketId, subjectId, studentId) => {
      const group = groups.get(`${bucketId}:${subjectId}`);
      if (!group) return undefined;
      const percents = group
        .map(item =>
          percentOf(
            item,
            entryOf.get(`${item.id}:${studentId}`),
            item.homeworkId ? gradedOf.get(`${item.homeworkId}:${studentId}`) : undefined
          )
        )
        .filter(p => p !== null)
        .map(p => p ?? 0);
      return percents.length ? round2(sum(percents) / percents.length) : null;
    };
  },

  /* For homework */

  /* Before homework is given: the bucket can take it */
  assertHomeworkBucket: async (ctx, bucketId, { academicYearId, maxMarks }) => {
    if (maxMarks === null || maxMarks === undefined) {
      throw unprocessable("Only homework marked out of maxMarks can count toward a bucket");
    }
    assertUnlocked(await loadBucket(ctx, bucketId, academicYearId));
  },

  forHomework: async (ctx, homeworkId) => {
    const [item] = await assessmentRepository.findMany(ctx.tenantId, { conditions: [eq(assessments.homeworkId, homeworkId)] });
    return item ? view(ctx, item) : null;
  },

  /* Puts homework in a bucket (bucketId), moves it, or takes it out (null).
     Without bucketId it only refreshes the item's title, date and max marks. */
  linkHomework: async (ctx, homework, bucketId) => {
    const [item] = await assessmentRepository.findMany(ctx.tenantId, {
      conditions: [eq(assessments.homeworkId, homework.id)]
    });
    if (bucketId === undefined && !item) return null;
    if (bucketId === null) {
      if (!item) return null;
      assertUnlocked(await loadBucket(ctx, item.bucketId, item.academicYearId));
      await transaction(async tx => {
        await assessmentRepository.removeMarks(ctx.tenantId, item.id, { dbc: tx });
        await assessmentRepository.softDelete(ctx.tenantId, item.id, { dbc: tx });
      });
      return null;
    }
    if (homework.maxMarks === null || homework.maxMarks === undefined) {
      throw unprocessable("Only homework marked out of maxMarks can count toward a bucket");
    }
    const target = bucketId ?? item.bucketId;
    assertUnlocked(await loadBucket(ctx, target, homework.academicYearId));
    if (item && item.bucketId !== target) assertUnlocked(await loadBucket(ctx, item.bucketId, item.academicYearId));
    const values = { bucketId: target, title: homework.title, assessedOn: homework.dueDate, maxMarks: homework.maxMarks };
    const saved = item
      ? await assessmentRepository.update(ctx.tenantId, item.id, values)
      : await assessmentRepository.create(ctx.tenantId, {
          ...values,
          academicYearId: homework.academicYearId,
          sectionId: homework.sectionId,
          subjectId: homework.subjectId,
          assessmentType: "HOMEWORK",
          homeworkId: homework.id,
          createdBy: ctx.userId
        });
    return view(ctx, saved);
  }
};
