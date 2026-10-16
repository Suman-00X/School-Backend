import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { publish } from "../../../../common/events/events.js";
import { conflict, notFound } from "../../../../common/http/errors.js";
import { EXAM_RESULTS_PUBLISHED, examService } from "../../exams/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { resultPublications } from "../models/resultPublication.schema.js";
import { reportSnapshotRepository } from "../repositories/reportSnapshot.repository.js";
import { resultPublicationRepository } from "../repositories/resultPublication.repository.js";
import { reportCardService, studentReport } from "./reportCard.service.js";

/* Publishing results freezes every student's report card as an immutable snapshot
   (MongoDB report_snapshots), one set per version (result_publications).

   publish:  lock the exam/scheme row -> compute every sheet -> version N+1 -> snapshots -> visible
   revise:   the same while already published; version N is superseded
   withdraw: hides the current version from the portal; snapshots are kept
   The snapshots are written inside the PostgreSQL transaction and removed again if it fails. */

const hashOf = report => createHash("sha256").update(JSON.stringify(report)).digest("hex");

const statusOf = publication =>
  publication.withdrawnAt ? "WITHDRAWN" : publication.supersededAt ? "SUPERSEDED" : "CURRENT";

export const publicationView = publication => publication && { ...publication, status: statusOf(publication) };

const sourceKey = kind => (kind === "EXAM" ? "examId" : "schemeId");

/* Snapshot documents for every student of every sheet */
const snapshotDocs = (sheets, { kind, sourceId, sourceName, academicYearId, reportFor }) =>
  sheets.flatMap(sheet =>
    sheet.students.map(row => {
      const { resultsPublishedAt: _published, ...source } = (kind === "EXAM" ? sheet.exam : sheet.scheme) ?? {};
      const report = { ...reportFor(sheet, row), [kind === "EXAM" ? "exam" : "scheme"]: source };
      return {
        kind,
        sourceId,
        sourceName,
        academicYearId,
        sectionId: sheet.section.id,
        classId: sheet.section.classId,
        studentId: row.studentId,
        student: {
          id: row.studentId,
          firstName: row.firstName,
          lastName: row.lastName,
          admissionNumber: row.admissionNumber ?? null,
          studentCode: row.studentCode ?? null,
          rollNumber: row.rollNumber,
          enrollmentStatus: row.enrollmentStatus,
          section: { id: sheet.section.id, name: sheet.section.name }
        },
        policy: sheet.policy,
        report,
        contentHash: hashOf(report)
      };
    })
  );

/* Generic publish/revise of an exam or scheme.
   lock(tx) -> locked source row (throws 404/409); compute(source) -> { sheets, sourceName, academicYearId, reportFor };
   after(tx, source, publishedAt) -> updated source row. */
const publishVersion = async (ctx, { kind, sourceId, lock, compute, after }) => {
  let insertedFor = null;
  try {
    return await transaction(async tx => {
      const source = await lock(tx);
      const { sheets, sourceName, academicYearId, reportFor } = await compute(source);
      const docs = snapshotDocs(sheets, { kind, sourceId, sourceName, academicYearId, reportFor });

      const version = (await resultPublicationRepository.latestVersion(ctx.tenantId, kind, sourceId, { dbc: tx })) + 1;
      const previous =
        version > 1 &&
        (await resultPublicationRepository.findOne(
          ctx.tenantId,
          [resultPublicationRepository.sourceCondition(kind, sourceId), eq(resultPublications.version, version - 1)],
          { dbc: tx }
        ));
      const previousHashes = previous ? await reportSnapshotRepository.hashesOf(ctx.tenantId, previous.id) : null;
      const changedCount = previousHashes
        ? docs.filter(doc => previousHashes.get(doc.studentId) !== doc.contentHash).length +
          [...previousHashes.keys()].filter(id => !docs.some(doc => doc.studentId === id)).length
        : null;

      const publishedAt = new Date();
      const current = await resultPublicationRepository.findCurrent(ctx.tenantId, kind, sourceId, { dbc: tx });
      if (current) {
        await resultPublicationRepository.update(ctx.tenantId, current.id, { supersededAt: publishedAt }, { dbc: tx });
      }
      const publication = await resultPublicationRepository.create(
        ctx.tenantId,
        {
          kind,
          [sourceKey(kind)]: sourceId,
          academicYearId,
          version,
          publishedAt,
          publishedBy: ctx.userId ?? null,
          reportCount: docs.length,
          changedCount
        },
        { dbc: tx }
      );

      insertedFor = publication.id;
      /* version N+1 is not committed anywhere, so any snapshot carrying it is a leftover */
      await reportSnapshotRepository.removeUncommittedVersion(ctx.tenantId, kind, sourceId, version);
      await reportSnapshotRepository.insertMany(
        ctx.tenantId,
        docs.map(doc => ({
          ...doc,
          publicationId: publication.id,
          version,
          publishedAt,
          publishedBy: ctx.userId ?? null
        }))
      );
      const updated = await after(tx, source, publishedAt);
      return { source: updated, publication: publicationView(publication) };
    });
  } catch (error) {
    if (insertedFor) await reportSnapshotRepository.removePublication(ctx.tenantId, insertedFor);
    throw error;
  }
};

/* Generic withdrawal: hide the current version; keep it and its snapshots */
const withdrawVersion = async (ctx, { kind, sourceId, lock, after }) => {
  let withdrawnFor = null;
  try {
    return await transaction(async tx => {
      const source = await lock(tx);
      const withdrawnAt = new Date();
      const current = await resultPublicationRepository.findCurrent(ctx.tenantId, kind, sourceId, { dbc: tx });
      if (current) {
        await resultPublicationRepository.update(
          ctx.tenantId,
          current.id,
          { withdrawnAt, withdrawnBy: ctx.userId ?? null },
          { dbc: tx }
        );
        withdrawnFor = current.id;
        await reportSnapshotRepository.setWithdrawn(ctx.tenantId, current.id, withdrawnAt);
      }
      const updated = await after(tx, source);
      return { source: updated, publication: current ? publicationView({ ...current, withdrawnAt }) : null };
    });
  } catch (error) {
    if (withdrawnFor) await reportSnapshotRepository.setWithdrawn(ctx.tenantId, withdrawnFor, null);
    throw error;
  }
};

const FIELDS = ["result", "percentage", "grade", "gpa", "cgpa", "totalObtained", "graceTotal", "rank", "classRank"];
const LINE_FIELDS = ["status", "marksObtained", "graceMarks", "percentage", "grade", "gradePoint", "passed", "counted"];
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/* What changed between a published report card and the live one */
export const diffReports = (published, live) => {
  const changes = [];
  for (const field of FIELDS) {
    if (!same(published?.[field], live?.[field]))
      changes.push({ field, published: published?.[field] ?? null, live: live?.[field] ?? null });
  }
  const linesOf = report => [...(report?.subjects ?? []), ...(report?.coScholastic ?? [])];
  const before = new Map(linesOf(published).map(line => [line.subject.id, line]));
  const after = new Map(linesOf(live).map(line => [line.subject.id, line]));
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(id);
    const b = after.get(id);
    const code = (a ?? b).subject.subjectCode;
    for (const field of LINE_FIELDS) {
      if (!same(a?.[field], b?.[field])) {
        changes.push({ field: `${code}.${field}`, published: a?.[field] ?? null, live: b?.[field] ?? null });
      }
    }
  }
  return changes;
};

const versionOrCurrent = async (ctx, kind, sourceId, version, sourceName) => {
  const publication = version
    ? await resultPublicationRepository.findOne(ctx.tenantId, [
        resultPublicationRepository.sourceCondition(kind, sourceId),
        eq(resultPublications.version, version)
      ])
    : ((await resultPublicationRepository.findCurrent(ctx.tenantId, kind, sourceId)) ??
      (
        await resultPublicationRepository.list(ctx.tenantId, {
          limit: 1,
          conditions: [resultPublicationRepository.sourceCondition(kind, sourceId)]
        })
      ).rows[0]);
  if (!publication)
    throw notFound(version ? `Version ${version} of ${sourceName}'s results` : `Published results of ${sourceName}`);
  return publication;
};

/* Live results vs a published version, student by student. liveSheets are this source's sheets now. */
const compareWith = async (ctx, { kind, sourceId, sourceName, version, sectionId, liveSheets, reportFor }) => {
  const publication = await versionOrCurrent(ctx, kind, sourceId, version, sourceName);
  const visible = await teachingScope.sectionIds(ctx);
  const inScope = id => (!sectionId || id === sectionId) && (!visible || visible.includes(id));

  const snapshots = (await reportSnapshotRepository.findMany(ctx.tenantId, { publicationId: publication.id })).filter(
    snapshot => inScope(snapshot.sectionId)
  );
  const published = new Map(snapshots.map(snapshot => [snapshot.studentId, snapshot]));
  const live = new Map(
    liveSheets
      .filter(sheet => inScope(sheet.section.id))
      .flatMap(sheet => sheet.students.map(row => [row.studentId, { sheet, row, report: reportFor(sheet, row) }]))
  );

  const students = [];
  for (const studentId of new Set([...published.keys(), ...live.keys()])) {
    const snapshot = published.get(studentId);
    const now = live.get(studentId);
    const changes = snapshot && now ? diffReports(snapshot.report, now.report) : [];
    students.push({
      studentId,
      firstName: now?.row.firstName ?? snapshot?.student.firstName,
      lastName: now?.row.lastName ?? snapshot?.student.lastName,
      section: now?.sheet.section.name ?? snapshot?.student.section.name,
      status: !snapshot ? "NOT_PUBLISHED" : !now ? "NO_LONGER_LISTED" : changes.length ? "CHANGED" : "UNCHANGED",
      changes
    });
  }
  students.sort((a, b) => `${a.section}${a.lastName}`.localeCompare(`${b.section}${b.lastName}`));
  const count = status => students.filter(s => s.status === status).length;
  return {
    publication: publicationView(publication),
    summary: {
      students: students.length,
      unchanged: count("UNCHANGED"),
      changed: count("CHANGED"),
      notPublished: count("NOT_PUBLISHED"),
      noLongerListed: count("NO_LONGER_LISTED")
    },
    students
  };
};

const lockExam = (ctx, examId, tx) =>
  examService.lockForUpdate(ctx, examId, { dbc: tx }).then(exam => {
    if (!exam) throw notFound("Exam");
    return exam;
  });

const computeExam = ctx => async exam => ({
  sheets: await reportCardService.forExam(ctx, exam),
  sourceName: exam.examName,
  academicYearId: exam.academicYearId,
  reportFor: studentReport
});

export const resultPublicationService = {
  /* Exams: POST /exams/:examId/result-publication */
  publishExam: async (ctx, examId) => {
    const result = await publishVersion(ctx, {
      kind: "EXAM",
      sourceId: examId,
      lock: async tx => {
        const exam = await lockExam(ctx, examId, tx);
        if (exam.resultsPublishedAt) {
          throw conflict(`Results for ${exam.examName} are already published. To publish changes, add a new version.`);
        }
        return exam;
      },
      compute: computeExam(ctx),
      after: (tx, exam, publishedAt) => examService.setResultsPublishedAt(ctx, exam.id, publishedAt, { dbc: tx })
    });
    await publish(EXAM_RESULTS_PUBLISHED, {
      tenantId: ctx.tenantId,
      examId,
      academicYearId: result.source.academicYearId
    });
    return result;
  },

  /* POST /exams/:examId/result-publication/versions: re-publish while published */
  reviseExam: (ctx, examId) =>
    publishVersion(ctx, {
      kind: "EXAM",
      sourceId: examId,
      lock: async tx => {
        const exam = await lockExam(ctx, examId, tx);
        if (!exam.resultsPublishedAt) {
          throw conflict(`Results for ${exam.examName} are not published. Publish them first.`);
        }
        return exam;
      },
      compute: computeExam(ctx),
      after: async (tx, exam) => exam
    }),

  withdrawExam: (ctx, examId) =>
    withdrawVersion(ctx, {
      kind: "EXAM",
      sourceId: examId,
      lock: async tx => {
        const exam = await lockExam(ctx, examId, tx);
        if (!exam.resultsPublishedAt) throw notFound("Result publication");
        return exam;
      },
      after: (tx, exam) => examService.setResultsPublishedAt(ctx, exam.id, null, { dbc: tx })
    }),

  versions: async (ctx, kind, sourceId, { page, limit }) => {
    const result = await resultPublicationRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: [resultPublicationRepository.sourceCondition(kind, sourceId)],
      with: { publisher: { columns: { id: true, firstName: true, lastName: true } } }
    });
    return { ...result, rows: result.rows.map(publicationView) };
  },

  examVersions: async (ctx, examId, query) => {
    await reportCardService.loadExam(ctx, examId);
    return resultPublicationService.versions(ctx, "EXAM", examId, query);
  },

  compareExam: async (ctx, examId, { sectionId, version }) => {
    const exam = await reportCardService.loadExam(ctx, examId);
    if (sectionId) await teachingScope.assertSection(ctx, sectionId);
    return compareWith(ctx, {
      kind: "EXAM",
      sourceId: examId,
      sourceName: exam.examName,
      version,
      sectionId,
      liveSheets: await reportCardService.forExam(ctx, exam),
      reportFor: studentReport
    });
  },

  /* For assessment schemes (same mechanics, their own sheets) */
  publishVersion,
  withdrawVersion,
  compareWith
};
