import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { getTenant, tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { minDate } from "../../../../common/utils/date.util.js";
import { attendanceService } from "../../attendance/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { examPaperService } from "../../exams/index.js";
import { nepPolicyService } from "../../nep-policy/index.js";
import { reportCardService, subjectGroups } from "../../report-cards/index.js";
import { sectionService } from "../../sections/index.js";
import { teachingScope } from "../../teacher-assignments/index.js";
import { HPC_ABILITIES, HPC_REFLECTIONS, levelsFor } from "../constants/holisticProgress.constants.js";
import { holisticProgressRepository } from "../repositories/holisticProgress.repository.js";

/* The Holistic Progress Card of an exam (a term): recorded by the class teacher beside the
   marks, for the classes whose NEP stage the school's NEP policy has it for. The card puts
   the student's details, attendance and the exam's result next to it. */

const REFLECTION_KEYS = HPC_REFLECTIONS.map(r => r.key);
const SUBJECT_FIELDS = [...HPC_ABILITIES.map(a => a.key), "selfAssessment", "peerAssessment", "remark"];

const stageView = stage => ({ stage: stage.stage, label: stage.label, levels: levelsFor(stage.stage) });

/* An entry counts as assessed once the teacher has given a level for every ability */
const isAssessed = entry => Boolean(entry) && HPC_ABILITIES.every(a => entry[a.key]);
const hasReflections = record => Boolean(record) && REFLECTION_KEYS.some(key => record[key]);

/* Subjects the section sits in the exam, in display-code order */
const subjectsOf = async (ctx, examId, sectionId) =>
  subjectGroups(await examPaperService.findForExam(ctx, examId, { sectionId })).map(group => group.subject);

/* Exam and section, then the scope and the NEP policy (404s before 409s) */
const sectionContext = async (ctx, { examId, sectionId }) => {
  const exam = await reportCardService.loadExam(ctx, examId);
  const section = await sectionService.findById(ctx, sectionId);
  if (!section) throw notFound("Section");
  if (section.academicYearId !== exam.academicYearId)
    throw unprocessable("The exam and the section are in different academic years");
  await teachingScope.assertReportCards(ctx, section.id);
  const { stage } = await nepPolicyService.assertHolisticProgress(ctx, section.class);
  return { exam, section, stage, subjects: await subjectsOf(ctx, exam.id, section.id) };
};

const studentContext = async (ctx, { examId, studentId }) => {
  const exam = await reportCardService.loadExam(ctx, examId);
  const enrollment = await enrollmentService.findForStudent(ctx, studentId, exam.academicYearId);
  if (!enrollment) throw notFound("Enrollment for this student in the exam's academic year");
  const context = await sectionContext(ctx, { examId, sectionId: enrollment.sectionId });
  return { ...context, enrollment };
};

const examView = exam => ({ id: exam.id, examName: exam.examName, startDate: exam.startDate, endDate: exam.endDate });

const recordView = (record, subjects) => {
  const entryOf = new Map((record?.subjects ?? []).map(entry => [entry.subjectId, entry]));
  return {
    subjects: subjects.map(subject => ({ subject, entry: entryOf.get(subject.id) ?? null })),
    ...Object.fromEntries(REFLECTION_KEYS.map(key => [key, record?.[key] ?? null])),
    updatedAt: record?.updatedAt ?? null
  };
};

/* What the exam's result says, for the card (null when the student has no line) */
const academicOf = async (ctx, studentId, examId) => {
  const report = (await reportCardService.forStudent(ctx, studentId, { examId })).reports[0];
  if (!report) return null;
  const line = l => ({
    subjectId: l.subject.id,
    subjectName: l.subject.subjectName,
    grade: l.grade ?? null,
    percentage: report.display?.marks === false ? null : (l.percentage ?? null)
  });
  return {
    policy: report.policy?.name ?? null,
    percentage: report.display?.marks === false ? null : report.percentage,
    grade: report.grade,
    result: report.result,
    subjects: [...report.subjects, ...(report.coScholastic ?? [])].map(line)
  };
};

/* Attendance from the start of the year to the end of the exam (or today) */
const attendanceOf = async (ctx, studentId, exam) => {
  const today = await tenantToday(ctx.tenantId);
  const summary = await attendanceService.studentAttendance(ctx, studentId, {
    academicYearId: exam.academicYearId,
    to: exam.endDate ? minDate(exam.endDate, today) : today
  });
  return {
    from: summary.from,
    to: summary.to,
    workingDays: summary.workingDays,
    attendedDays: summary.attendedDays,
    percentage: summary.percentage
  };
};

export const holisticProgressService = {
  /* A section's cards for an exam: who is done, who is not */
  forSection: async (ctx, { examId, sectionId }) => {
    const { exam, section, stage, subjects } = await sectionContext(ctx, { examId, sectionId });
    const roster = await enrollmentService.findRoster(ctx, section.id);
    const records = await holisticProgressRepository.findForStudents(
      ctx.tenantId,
      exam.id,
      roster.map(e => e.studentId)
    );
    const recordOf = new Map(records.map(r => [r.studentId, r]));
    const subjectIds = new Set(subjects.map(s => s.id));

    const students = roster.map(enrollment => {
      const record = recordOf.get(enrollment.studentId);
      const assessed = (record?.subjects ?? []).filter(e => subjectIds.has(e.subjectId) && isAssessed(e)).length;
      return {
        studentId: enrollment.studentId,
        rollNumber: enrollment.rollNumber,
        firstName: enrollment.student?.user?.firstName,
        lastName: enrollment.student?.user?.lastName,
        admissionNumber: enrollment.student?.admissionNumber,
        assessedSubjects: assessed,
        reflections: hasReflections(record),
        complete: assessed === subjects.length && hasReflections(record),
        updatedAt: record?.updatedAt ?? null
      };
    });

    return {
      exam: examView(exam),
      section: { id: section.id, name: reportCardService.sectionLabel(section), classId: section.classId },
      stage: stageView(stage),
      abilities: HPC_ABILITIES,
      reflections: HPC_REFLECTIONS,
      subjects,
      students,
      summary: {
        students: students.length,
        complete: students.filter(s => s.complete).length,
        started: students.filter(s => s.updatedAt).length
      }
    };
  },

  /* One student's card: the record with everything printed beside it */
  forStudent: async (ctx, { examId, studentId }) => {
    const { exam, section, stage, subjects, enrollment } = await studentContext(ctx, { examId, studentId });
    const [record, details, tenant, policy, academic, attendance] = await Promise.all([
      holisticProgressRepository.findFor(ctx.tenantId, exam.id, studentId),
      holisticProgressRepository.studentDetails(ctx.tenantId, studentId),
      getTenant(ctx.tenantId),
      nepPolicyService.find(ctx),
      academicOf(ctx, studentId, exam.id),
      attendanceOf(ctx, studentId, exam)
    ]);
    return {
      school: { name: tenant?.name ?? null, address: tenant?.address ?? null, udiseCode: policy.udiseCode ?? null },
      student: {
        id: studentId,
        ...details,
        rollNumber: enrollment.rollNumber,
        section: { id: section.id, name: reportCardService.sectionLabel(section) }
      },
      exam: examView(exam),
      stage: stageView(stage),
      abilities: HPC_ABILITIES,
      reflections: HPC_REFLECTIONS,
      ...recordView(record, subjects),
      academic,
      attendance
    };
  },

  /* Replace a student's card for an exam (PUT: what is not sent is cleared) */
  save: async (ctx, { examId, studentId }, body) => {
    const { exam, section, subjects } = await studentContext(ctx, { examId, studentId });
    const known = new Set(subjects.map(s => s.id));
    for (const entry of body.subjects) {
      if (!known.has(entry.subjectId))
        throw unprocessable(`subjects: ${entry.subjectId} is not a subject ${reportCardService.sectionLabel(section)} sits in ${exam.examName}`);
    }
    const values = {
      sectionId: section.id,
      subjects: body.subjects.map(entry => ({
        subjectId: entry.subjectId,
        ...Object.fromEntries(SUBJECT_FIELDS.map(field => [field, entry[field] ?? null]))
      })),
      ...Object.fromEntries(REFLECTION_KEYS.map(key => [key, body[key] ?? null])),
      recordedBy: ctx.userId ?? null
    };
    const existing = await holisticProgressRepository.findFor(ctx.tenantId, exam.id, studentId);
    if (existing) await holisticProgressRepository.update(ctx.tenantId, existing.id, values);
    else
      await holisticProgressRepository.create(ctx.tenantId, {
        ...values,
        academicYearId: exam.academicYearId,
        examId: exam.id,
        studentId
      });
    return holisticProgressService.forStudent(ctx, { examId, studentId });
  }
};
