import { eq, gte, inArray, lte, sql } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { scoped } from "../../../../common/database/repository.js";
import { publish } from "../../../../common/events/events.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { fileService } from "../../../files/documents/index.js";
import { teacherService } from "../../../users/teachers/index.js";
import { academicYearService } from "../../academic-years/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { sectionService } from "../../sections/index.js";
import { sectionSubjectService } from "../../section-subjects/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { homeworkAssignments, homeworkSubmissions } from "../models/homework.schema.js";
import { homeworkRepository, submissionRepository } from "../repositories/homework.repository.js";

export const HOMEWORK_ASSIGNED = "academics.homework.assigned";
export const HOMEWORK_GRADED = "academics.homework.graded";

const withSubject = { subject: { columns: { id: true, subjectName: true, subjectCode: true } } };

const loadHomework = async (ctx, homeworkId) => {
  const homework = await homeworkRepository.findById(ctx.tenantId, homeworkId, { with: withSubject });
  if (!homework) throw notFound("Homework");
  return homework;
};

/* Staff may manage homework only in sections/subjects they teach (teachers) */
const loadForStaff = async (ctx, homeworkId) => {
  const homework = await loadHomework(ctx, homeworkId);
  await teachingScope.assertSection(ctx, homework.sectionId, { subjectId: homework.subjectId });
  return homework;
};

/* Lock a submission row for the rest of the transaction (submit vs grade) */
const lockSubmission = async (ctx, tx, ...conditions) => {
  const [row] = await tx
    .select()
    .from(homeworkSubmissions)
    .where(scoped(homeworkSubmissions, ctx.tenantId, ...conditions))
    .for("update");
  return row ?? null;
};

/* Submission status of a student for one homework */
const statusOf = submission =>
  !submission
    ? "NOT_SUBMITTED"
    : submission.status === "GRADED"
      ? "GRADED"
      : submission.status === "RETURNED"
        ? "RETURNED"
        : submission.isLate
          ? "LATE"
          : "SUBMITTED";

export const homeworkService = {
  create: async (ctx, { sectionId, subjectId, title, description, dueDate, maxMarks, allowLateSubmission }) => {
    const section = await sectionService.findById(ctx, sectionId);
    if (!section) throw unprocessable("sectionId does not refer to an existing section");
    await teachingScope.assertSection(ctx, sectionId, { subjectId });
    if (!(await sectionSubjectService.isTaught(ctx, section.academicYearId, sectionId, subjectId))) {
      throw unprocessable("This subject is not taught in the section");
    }
    const assignedOn = await tenantToday(ctx.tenantId);
    if (dueDate < assignedOn) throw unprocessable("dueDate cannot be in the past");

    const homework = await homeworkRepository.create(ctx.tenantId, {
      academicYearId: section.academicYearId,
      sectionId,
      subjectId,
      assignedBy: ctx.userId,
      teacherId: (await teacherService.findByUserId(ctx, ctx.userId))?.id ?? null,
      title,
      description,
      assignedOn,
      dueDate,
      maxMarks,
      allowLateSubmission
    });
    await publish(HOMEWORK_ASSIGNED, { tenantId: ctx.tenantId, homeworkId: homework.id });
    return homework;
  },

  /* Year-scoped. Teachers without a section filter see their own sections. */
  list: async (ctx, { page, limit, sectionId, subjectId, from, to }) => {
    if (sectionId) await teachingScope.assertSection(ctx, sectionId);
    const scoped = sectionId ? null : await teachingScope.sectionIds(ctx);
    const result = await homeworkRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withSubject,
      conditions: [
        eq(homeworkAssignments.academicYearId, ctx.academicYearId),
        sectionId && eq(homeworkAssignments.sectionId, sectionId),
        scoped && (scoped.length ? inArray(homeworkAssignments.sectionId, scoped) : sql`false`),
        subjectId && eq(homeworkAssignments.subjectId, subjectId),
        from && gte(homeworkAssignments.dueDate, from),
        to && lte(homeworkAssignments.dueDate, to)
      ].filter(Boolean)
    });
    const counts = await homeworkRepository.submissionCounts(
      ctx.tenantId,
      result.rows.map(r => r.id)
    );
    return {
      ...result,
      rows: result.rows.map(r => ({ ...r, submissions: counts.get(r.id) ?? { submitted: 0, graded: 0 } }))
    };
  },

  getById: async (ctx, homeworkId) => {
    const homework = await loadForStaff(ctx, homeworkId);
    return { ...homework, attachments: await fileService.forOwner(ctx, "HOMEWORK", homeworkId) };
  },

  update: async (ctx, homeworkId, data) => {
    const homework = await loadForStaff(ctx, homeworkId);
    if (data.dueDate && data.dueDate < homework.assignedOn)
      throw unprocessable("dueDate cannot be before the day it was set");
    return homeworkRepository.update(ctx.tenantId, homeworkId, data);
  },

  remove: async (ctx, homeworkId) => {
    await loadForStaff(ctx, homeworkId);
    if (await submissionRepository.exists(ctx.tenantId, [eq(homeworkSubmissions.homeworkId, homeworkId)])) {
      throw conflict("Students have already submitted this homework; it cannot be deleted");
    }
    return homeworkRepository.softDelete(ctx.tenantId, homeworkId);
  },

  addAttachment: async (ctx, homeworkId, file) => {
    const homework = await loadForStaff(ctx, homeworkId);
    await academicYearService.assertWritable(ctx, homework.academicYearId);
    return fileService.store(ctx, file, { ownerType: "HOMEWORK", ownerId: homeworkId, category: "ATTACHMENT" });
  },

  removeAttachment: async (ctx, homeworkId, fileId) => {
    const homework = await loadForStaff(ctx, homeworkId);
    await academicYearService.assertWritable(ctx, homework.academicYearId);
    return fileService.remove(ctx, fileId, { ownerType: "HOMEWORK", ownerId: homeworkId });
  },

  attachmentUrl: async (ctx, homeworkId, fileId) => {
    await loadForStaff(ctx, homeworkId);
    return fileService.downloadUrl(ctx, fileId, { ownerType: "HOMEWORK", ownerId: homeworkId });
  },

  /* Every student of the section with their submission */
  submissions: async (ctx, homeworkId) => {
    const homework = await loadForStaff(ctx, homeworkId);
    const [roster, submissions] = await Promise.all([
      enrollmentService.findRoster(ctx, homework.sectionId),
      submissionRepository.findMany(ctx.tenantId, { conditions: [eq(homeworkSubmissions.homeworkId, homeworkId)] })
    ]);
    const byStudent = new Map(submissions.map(s => [s.studentId, s]));
    return {
      homework: { id: homework.id, title: homework.title, dueDate: homework.dueDate, maxMarks: homework.maxMarks },
      students: roster.map(e => {
        const submission = byStudent.get(e.studentId) ?? null;
        return {
          studentId: e.studentId,
          rollNumber: e.rollNumber,
          firstName: e.student?.user?.firstName,
          lastName: e.student?.user?.lastName,
          status: statusOf(submission),
          submission
        };
      })
    };
  },

  /* GRADED keeps the marks; RETURNED asks the student to resubmit */
  grade: async (ctx, homeworkId, submissionId, { marksAwarded, feedback, status }) => {
    const homework = await loadForStaff(ctx, homeworkId);
    if (marksAwarded !== undefined && homework.maxMarks === null)
      throw unprocessable("This homework is not marked; send feedback only");
    if (marksAwarded !== undefined && marksAwarded > homework.maxMarks) {
      throw unprocessable(`marksAwarded cannot exceed ${homework.maxMarks}`);
    }
    /* Locked so a resubmission cannot interleave with grading */
    const { submission, updated } = await transaction(async tx => {
      const submission = await lockSubmission(ctx, tx, eq(homeworkSubmissions.id, submissionId));
      if (!submission || submission.homeworkId !== homeworkId) throw notFound("Submission");
      const updated = await submissionRepository.update(
        ctx.tenantId,
        submissionId,
        { status, marksAwarded: marksAwarded ?? null, feedback, gradedBy: ctx.userId, gradedAt: new Date() },
        { dbc: tx }
      );
      return { submission, updated };
    });
    await publish(HOMEWORK_GRADED, {
      tenantId: ctx.tenantId,
      homeworkId,
      submissionId,
      studentId: submission.studentId,
      status
    });
    return updated;
  },

  submissionAttachmentUrl: async (ctx, homeworkId, submissionId, fileId) => {
    await loadForStaff(ctx, homeworkId);
    const submission = await submissionRepository.findById(ctx.tenantId, submissionId);
    if (!submission || submission.homeworkId !== homeworkId) throw notFound("Submission");
    return fileService.downloadUrl(ctx, fileId, { ownerType: "SUBMISSION", ownerId: submissionId });
  },

  /* For the portal (callers check that the student is visible to them) */

  forStudent: async (ctx, studentId, { status, page, limit }) => {
    const year = ctx.academicYear;
    const enrollment = year ? await enrollmentService.findForStudent(ctx, studentId, year.id) : null;
    if (!enrollment) return { rows: [], meta: { page, limit, total: 0, totalPages: 1 } };

    const all = await homeworkRepository.findMany(ctx.tenantId, {
      conditions: [
        eq(homeworkAssignments.sectionId, enrollment.sectionId),
        eq(homeworkAssignments.academicYearId, year.id)
      ],
      with: withSubject
    });
    const submissions = all.length
      ? await submissionRepository.findMany(ctx.tenantId, {
          conditions: [
            eq(homeworkSubmissions.studentId, studentId),
            inArray(
              homeworkSubmissions.homeworkId,
              all.map(h => h.id)
            )
          ]
        })
      : [];
    const byHomework = new Map(submissions.map(s => [s.homeworkId, s]));
    const rows = all
      .map(h => ({ ...h, myStatus: statusOf(byHomework.get(h.id)), mySubmission: byHomework.get(h.id) ?? null }))
      .filter(
        h =>
          !status ||
          (status === "pending"
            ? ["NOT_SUBMITTED", "RETURNED"].includes(h.myStatus)
            : status === "submitted"
              ? ["SUBMITTED", "LATE"].includes(h.myStatus)
              : h.myStatus === "GRADED")
      );
    const start = (page - 1) * limit;
    return {
      rows: rows.slice(start, start + limit),
      meta: { page, limit, total: rows.length, totalPages: Math.max(Math.ceil(rows.length / limit), 1) }
    };
  },

  /* Homework of the student's section, with attachments and their own submission */
  detailForStudent: async (ctx, studentId, homeworkId) => {
    const homework = await loadHomework(ctx, homeworkId);
    if (!(await enrollmentService.isStudentInSection(ctx, studentId, homework.sectionId, homework.academicYearId)))
      throw notFound("Homework");
    const submission = await submissionRepository.findOne(ctx.tenantId, [
      eq(homeworkSubmissions.homeworkId, homeworkId),
      eq(homeworkSubmissions.studentId, studentId)
    ]);
    return {
      ...homework,
      attachments: await fileService.forOwner(ctx, "HOMEWORK", homeworkId),
      mySubmission: submission
        ? { ...submission, attachments: await fileService.forOwner(ctx, "SUBMISSION", submission.id) }
        : null,
      myStatus: statusOf(submission)
    };
  },

  attachmentUrlForStudent: async (ctx, studentId, homeworkId, fileId) => {
    const detail = await homeworkService.detailForStudent(ctx, studentId, homeworkId);
    const owner = detail.attachments.some(a => a.id === fileId)
      ? { ownerType: "HOMEWORK", ownerId: homeworkId }
      : { ownerType: "SUBMISSION", ownerId: detail.mySubmission?.id ?? "none" };
    return fileService.downloadUrl(ctx, fileId, owner);
  },

  /* A student submits (or resubmits after RETURNED) -> { submission, created } */
  submit: async (ctx, studentId, homeworkId, { content }, file) => {
    const homework = await loadHomework(ctx, homeworkId);
    const enrolled = await enrollmentService.isStudentInSection(
      ctx,
      studentId,
      homework.sectionId,
      homework.academicYearId,
      { activeOnly: true }
    );
    if (!enrolled) throw notFound("Homework");
    if (!content && !file) throw unprocessable("Send some text or attach a file");
    /* Reject a bad file before anything is written */
    if (file) fileService.check(file, "ATTACHMENT");

    const today = await tenantToday(ctx.tenantId);
    const isLate = today > homework.dueDate;
    if (isLate && !homework.allowLateSubmission) throw unprocessable(`The due date (${homework.dueDate}) has passed`);

    /* Row lock: a resubmission and a grading of the same work never interleave.
       The file is stored inside the transaction, so a storage failure leaves no half-written submission. */
    return transaction(async tx => {
      const existing = await lockSubmission(
        ctx,
        tx,
        eq(homeworkSubmissions.homeworkId, homeworkId),
        eq(homeworkSubmissions.studentId, studentId)
      );
      if (existing?.status === "GRADED") throw conflict("This homework has already been graded");

      const values = {
        content: content ?? null,
        submittedAt: new Date(),
        isLate,
        status: "SUBMITTED",
        marksAwarded: null,
        feedback: existing?.feedback ?? null
      };
      const submission = existing
        ? await submissionRepository.update(ctx.tenantId, existing.id, values, { dbc: tx })
        : await submissionRepository.create(ctx.tenantId, { ...values, homeworkId, studentId }, { dbc: tx });

      const attachment = file
        ? await fileService.store(ctx, file, {
            ownerType: "SUBMISSION",
            ownerId: submission.id,
            category: "ATTACHMENT"
          })
        : null;
      return { submission: { ...submission, attachments: attachment ? [attachment] : [] }, created: !existing };
    });
  },

  findById: (ctx, homeworkId) => homeworkRepository.findById(ctx.tenantId, homeworkId, { with: withSubject }),

  findSubmission: (ctx, submissionId) => submissionRepository.findById(ctx.tenantId, submissionId)
};
