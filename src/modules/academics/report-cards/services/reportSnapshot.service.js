import { forbidden, notFound, unprocessable } from "../../../../common/http/errors.js";
import { academicYearService } from "../../academic-years/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { sectionService } from "../../sections/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { reportSnapshotRepository } from "../repositories/reportSnapshot.repository.js";
import { resultPublicationRepository } from "../repositories/resultPublication.repository.js";
import { forFamilies, reportCardService } from "./reportCard.service.js";

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
    { studentId, publicationId: { $in: publications.map(p => p.id) }, withdrawnAt: null },
    { sort: { publishedAt: 1 } }
  );
  return snapshots;
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
    return reportSnapshotRepository.list(ctx.tenantId, {
      filter,
      page,
      limit,
      sort: { publishedAt: -1, sourceName: 1, "student.rollNumber": 1 }
    });
  },

  getById: async (ctx, snapshotId) => {
    const snapshot = await reportSnapshotRepository.findById(ctx.tenantId, snapshotId);
    if (!snapshot) throw notFound("Report snapshot");
    await teachingScope.assertSection(ctx, snapshot.sectionId);
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
      ? await reportSnapshotRepository.findMany(ctx.tenantId, {
          studentId,
          publicationId: publication.id,
          withdrawnAt: null
        })
      : [];
    if (!snapshot) throw notFound("Report card");
    return snapshot;
  }
};
