import { conflict, forbidden, notFound, unprocessable } from "../../../../common/http/errors.js";
import { logger } from "../../../../common/logging/logger.js";
import { reportError } from "../../../../common/observability/errorReporter.js";
import { academicYearService } from "../../academic-years/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { sectionService } from "../../sections/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { reportSnapshotRepository } from "../repositories/reportSnapshot.repository.js";
import { resultPublicationRepository } from "../repositories/resultPublication.repository.js";
import { forFamilies, reportCardService } from "./reportCard.service.js";
import { sealed } from "./resultPublication.service.js";

const TAMPERED = "This report card failed its integrity check and cannot be shown. The school has been alerted.";

/* A snapshot that does not match its seal was changed outside the application: never
   show it, and raise an alert (logged, counted, sent to error tracking) */
const alarm = (ctx, snapshot) => {
  logger.error(
    { tenantId: ctx.tenantId, snapshotId: snapshot.id, studentId: snapshot.studentId },
    "Report snapshot seal mismatch"
  );
  reportError(new Error("Report snapshot seal mismatch"), { source: "integrity", tenantId: ctx.tenantId });
};

/* Attach integrity to snapshots: VERIFIED, or TAMPERED (with an alert) */
const withIntegrity = async (ctx, snapshots) => {
  const manifests = await resultPublicationRepository.manifestsOf(ctx.tenantId, [
    ...new Set(snapshots.map(snapshot => snapshot.publicationId))
  ]);
  return snapshots.map(snapshot => {
    const publication = manifests.get(snapshot.publicationId);
    const intact = sealed(snapshot, publication?.seals);
    if (!intact) alarm(ctx, snapshot);
    return {
      ...snapshot,
      integrity: intact ? "VERIFIED" : "TAMPERED",
      /* Visibility lives on the publication */
      publicationStatus: !publication
        ? null
        : publication.withdrawnAt
          ? "WITHDRAWN"
          : publication.supersededAt
            ? "SUPERSEDED"
            : "CURRENT"
    };
  });
};

/* Report snapshots: staff browse every version; students and parents only see the
   current published version of each exam or scheme (never live marks, never withdrawn). */

const familyReport = snapshot => ({
  ...forFamilies(snapshot.report),
  snapshotId: snapshot.id,
  version: snapshot.version,
  publishedAt: snapshot.publishedAt
});

const sourceFilter = ({ examId, schemeId }) =>
  examId ? { kind: "EXAM", sourceId: examId } : schemeId ? { kind: "SCHEME", sourceId: schemeId } : {};

/* Published snapshots a student's family may see */
const visibleSnapshots = async (ctx, studentId, { examId, schemeId, academicYearId }) => {
  const publications = await resultPublicationRepository.findCurrentInYear(ctx.tenantId, academicYearId, {
    examId,
    schemeId
  });
  if (!publications.length) return [];
  const snapshots = await reportSnapshotRepository.findMany(
    ctx.tenantId,
    { studentId, publicationId: { $in: publications.map(p => p.id) } },
    { sort: { publishedAt: 1 } }
  );
  /* Families never see a report card that fails its seal */
  return (await withIntegrity(ctx, snapshots)).filter(snapshot => snapshot.integrity === "VERIFIED");
};

export const reportSnapshotService = {
  /* Staff: every version, filtered. Teachers see their sections only. */
  list: async (ctx, { page, limit, examId, schemeId, studentId, sectionId, version }) => {
    const visible = await teachingScope.sectionIds(ctx);
    if (sectionId && visible && !visible.includes(sectionId))
      throw forbidden("You can only do this for sections you teach");
    /* Only snapshots of committed publications (never leftovers of a failed attempt) */
    const committed = (await resultPublicationRepository.findMany(ctx.tenantId, {})).map(p => p.id);
    const filter = {
      publicationId: { $in: committed },
      ...sourceFilter({ examId, schemeId }),
      ...(studentId && { studentId }),
      ...(version && { version }),
      ...(sectionId ? { sectionId } : visible ? { sectionId: { $in: visible } } : {})
    };
    const result = await reportSnapshotRepository.list(ctx.tenantId, {
      filter,
      page,
      limit,
      sort: { publishedAt: -1, sourceName: 1, "student.rollNumber": 1 }
    });
    return { ...result, rows: await withIntegrity(ctx, result.rows) };
  },

  getById: async (ctx, snapshotId) => {
    const snapshot = await reportSnapshotRepository.findById(ctx.tenantId, snapshotId);
    if (!snapshot) throw notFound("Report snapshot");
    await teachingScope.assertSection(ctx, snapshot.sectionId);
    const [checked] = await withIntegrity(ctx, [snapshot]);
    return checked;
  },

  /* Printing: only an intact snapshot */
  getIntact: async (ctx, snapshotId) => {
    const snapshot = await reportSnapshotService.getById(ctx, snapshotId);
    if (snapshot.integrity !== "VERIFIED") throw conflict(TAMPERED);
    return snapshot;
  },

  /* Portal: the current published report cards of a student in a year (one exam or scheme, or all) */
  forFamily: async (ctx, studentId, { examId, schemeId, academicYearId }) => {
    /* An exam or scheme names its own year */
    const schemePublication =
      schemeId && (await resultPublicationRepository.findCurrentFor(ctx.tenantId, { schemeIds: [schemeId] }))[0];
    const yearId = examId
      ? (await reportCardService.loadExam(ctx, examId)).academicYearId
      : (schemePublication?.academicYearId ?? academicYearId ?? (await academicYearService.findCurrent(ctx))?.id);
    if (!yearId) throw unprocessable("No academic year found for this request");

    const enrollment = await enrollmentService.findForStudent(ctx, studentId, yearId);
    if (!enrollment) throw notFound("Enrollment for this student in the academic year");
    const section = await sectionService.findById(ctx, enrollment.sectionId);

    const snapshots = await visibleSnapshots(ctx, studentId, { examId, schemeId, academicYearId: yearId });
    if ((examId || schemeId) && !snapshots.length) {
      throw notFound(`Published results for this ${examId ? "exam" : "assessment"}`);
    }
    return {
      student: {
        id: studentId,
        rollNumber: enrollment.rollNumber,
        section: { id: section.id, name: reportCardService.sectionLabel(section) }
      },
      academicYearId: yearId,
      reports: snapshots.map(familyReport)
    };
  },

  /* Portal PDF: the snapshot of one exam or scheme */
  familySnapshot: async (ctx, studentId, { examId, schemeId }) => {
    const [publication] = await resultPublicationRepository.findCurrentFor(
      ctx.tenantId,
      examId ? { examIds: [examId] } : { schemeIds: [schemeId] }
    );
    const [snapshot] = publication
      ? await reportSnapshotRepository.findMany(ctx.tenantId, { studentId, publicationId: publication.id })
      : [];
    if (!snapshot) throw notFound("Report card");
    const [checked] = await withIntegrity(ctx, [snapshot]);
    if (checked.integrity !== "VERIFIED") throw conflict(TAMPERED);
    return checked;
  }
};
