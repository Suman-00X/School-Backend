import { eq } from "drizzle-orm";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { toMinor } from "../../../../common/money/money.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { addDays } from "../../../../common/utils/date.util.js";
import { invoiceService } from "../../../finance/invoices/index.js";
import { attendanceService } from "../../attendance/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { examPaperService, examService } from "../../exams/index.js";
import { sectionService } from "../../sections/index.js";
import { examEligibilityExemptions } from "../models/examEligibility.schema.js";
import {
  examEligibilityExemptionRepository,
  examEligibilityPolicyRepository
} from "../repositories/examEligibility.repository.js";

const POLICY_FIELDS = ["attendanceRuleEnabled", "minAttendancePercentage", "duesRuleEnabled", "maxOverdueAmount"];

const policyView = policy => ({
  id: policy.id,
  ...Object.fromEntries(POLICY_FIELDS.map(field => [field, policy[field]])),
  updatedAt: policy.updatedAt
});

const sectionLabel = section => `${section.class?.className}-${section.sectionName}`;

const minDate = (a, b) => (a <= b ? a : b);

/* The dates an exam is judged on. Attendance counts from the start of the year up to the
   day before the exam starts (or today, if earlier), so it stops changing once the exam
   begins. Dues are what is overdue today: fees paid since count straight away. */
const judgedOn = (exam, today) => ({
  attendanceThrough: exam.startDate ? minDate(today, addDays(exam.startDate, -1)) : today,
  duesAsOf: today
});

/* One student against the policy. attendance: the summary's percentage (null when no
   working day has passed yet, which never blocks); overdue: amount owed past due */
const judge = (policy, { percentage, overdue, exemption }) => {
  const attendanceMet = !policy.attendanceRuleEnabled || percentage === null || percentage >= policy.minAttendancePercentage;
  const duesMet = !policy.duesRuleEnabled || toMinor(overdue) <= toMinor(policy.maxOverdueAmount);
  const reasons = [
    !attendanceMet && `Attendance ${percentage}% is below the required ${policy.minAttendancePercentage}%`,
    !duesMet && `Overdue fees of ${overdue} are above the allowed ${policy.maxOverdueAmount}`
  ].filter(Boolean);
  return {
    attendance: { percentage, required: policy.attendanceRuleEnabled ? policy.minAttendancePercentage : null, met: attendanceMet },
    dues: { overdue, allowed: policy.duesRuleEnabled ? policy.maxOverdueAmount : null, met: duesMet },
    meetsRules: attendanceMet && duesMet,
    exemption: exemption ? { reason: exemption.reason, grantedBy: exemption.grantedBy, grantedAt: exemption.createdAt } : null,
    eligible: (attendanceMet && duesMet) || Boolean(exemption),
    reasons
  };
};

export const examEligibilityPolicyService = {
  get: async ctx => policyView(await examEligibilityPolicyRepository.ensure(ctx.tenantId)),

  update: async (ctx, changes) => {
    const policy = await examEligibilityPolicyRepository.ensure(ctx.tenantId);
    await examEligibilityPolicyRepository.update(ctx.tenantId, policy.id, changes);
    return examEligibilityPolicyService.get(ctx);
  }
};

export const examEligibilityService = {
  /* Every student of the sections sitting the exam (or of one section), judged against the
     school's rules today: their attendance, overdue fees, any exemption, and the verdict */
  evaluate: async (ctx, examId, { sectionId } = {}) => {
    const exam = await examService.getById(ctx, examId);
    const papers = await examPaperService.findForExam(ctx, examId, { sectionId });
    const sectionIds = [...new Set(papers.map(paper => paper.sectionId))];
    if (sectionId && !sectionIds.length) throw unprocessable("This section has no papers in the exam");

    const [policy, today, sections, exemptions] = await Promise.all([
      examEligibilityPolicyRepository.ensure(ctx.tenantId),
      tenantToday(ctx.tenantId),
      sectionService.findAllInYear(ctx, exam.academicYearId),
      examEligibilityExemptionRepository.findMany(ctx.tenantId, {
        conditions: [eq(examEligibilityExemptions.examId, examId)]
      })
    ]);
    const dates = judgedOn(exam, today);
    const exemptionOf = new Map(exemptions.map(exemption => [exemption.studentId, exemption]));
    const sectionOf = new Map(sections.map(section => [section.id, section]));
    const ordered = sectionIds
      .map(id => sectionOf.get(id))
      .filter(Boolean)
      .sort((a, b) => (a.class?.classOrder ?? 0) - (b.class?.classOrder ?? 0) || a.sectionName.localeCompare(b.sectionName));

    const perSection = await Promise.all(
      ordered.map(async section => {
        const [roster, attendance] = await Promise.all([
          enrollmentService.findRoster(ctx, section.id),
          attendanceService.sectionSummary(ctx, { sectionId: section.id, to: dates.attendanceThrough })
        ]);
        return { section, roster, percentageOf: new Map(attendance.students.map(s => [s.studentId, s.percentage])) };
      })
    );
    const overdueOf = await invoiceService.overdueByStudent(
      ctx,
      perSection.flatMap(({ roster }) => roster.map(enrollment => enrollment.studentId)),
      { asOf: dates.duesAsOf }
    );

    const result = perSection.map(({ section, roster, percentageOf }) => ({
      section: { id: section.id, name: sectionLabel(section) },
      students: roster.map(enrollment => ({
        studentId: enrollment.studentId,
        enrollmentId: enrollment.id,
        rollNumber: enrollment.rollNumber,
        admissionNumber: enrollment.student?.admissionNumber,
        firstName: enrollment.student?.user?.firstName,
        lastName: enrollment.student?.user?.lastName,
        ...judge(policy, {
          percentage: percentageOf.get(enrollment.studentId) ?? null,
          overdue: overdueOf.get(enrollment.studentId) ?? 0,
          exemption: exemptionOf.get(enrollment.studentId)
        })
      }))
    }));
    const students = result.flatMap(s => s.students);

    return {
      exam: { id: exam.id, examName: exam.examName, startDate: exam.startDate, endDate: exam.endDate, academicYearId: exam.academicYearId },
      policy: policyView(policy),
      ...dates,
      totals: {
        students: students.length,
        eligible: students.filter(s => s.eligible).length,
        notEligible: students.filter(s => !s.eligible).length,
        exempted: students.filter(s => s.exemption && !s.meetsRules).length
      },
      sections: result
    };
  },

  /* Allow a student to sit the exam whatever the rules say */
  exempt: async (ctx, examId, { studentId, reason }) => {
    const exam = await examService.getById(ctx, examId);
    const enrollment = await enrollmentService.findForStudent(ctx, studentId, exam.academicYearId);
    if (!enrollment) throw unprocessable("The student is not enrolled in the exam's academic year");
    return examEligibilityExemptionRepository.create(ctx.tenantId, {
      examId,
      studentId,
      reason,
      grantedBy: ctx.userId ?? null
    });
  },

  /* The rules apply to the student again (an admit card already issued stays until cards are generated again) */
  removeExemption: async (ctx, examId, studentId) => {
    const exemption = await examEligibilityExemptionRepository.findOne(ctx.tenantId, [
      eq(examEligibilityExemptions.examId, examId),
      eq(examEligibilityExemptions.studentId, studentId)
    ]);
    if (!exemption) throw notFound("Exemption");
    return examEligibilityExemptionRepository.softDelete(ctx.tenantId, exemption.id);
  },

  /* The exam is being removed: its exemptions go with it */
  releaseExam: (ctx, examId, { dbc }) =>
    examEligibilityExemptionRepository.softDeleteWhere(ctx.tenantId, [eq(examEligibilityExemptions.examId, examId)], { dbc })
};
