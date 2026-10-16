import { eq, isNotNull } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { publish } from "../../../../common/events/events.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { enrollmentService } from "../../../academics/enrollments/index.js";
import { sectionService } from "../../../academics/sections/index.js";
import { studentService } from "../../../users/students/index.js";
import { feeStructureService } from "../../fee-structures/index.js";
import { INVOICES_ISSUED, invoiceIssuingService } from "../../invoices/index.js";
import { studentInstallmentPlans } from "../models/installmentPlan.schema.js";
import { planAssignmentRepository } from "../repositories/installmentPlan.repository.js";
import { installmentPlanService } from "./installmentPlan.service.js";

const nameOf = student => `${student?.user?.firstName ?? ""} ${student?.user?.lastName ?? ""}`.trim();

const planSummary = plan => plan && { id: plan.id, name: plan.name, installmentCount: plan.installments.length };

/* The plan must exist in the year (null = back to each structure's default) */
const loadPlan = async (ctx, installmentPlanId) => {
  if (!installmentPlanId) return null;
  const [plan] = await installmentPlanService.findManyByIds(ctx, [installmentPlanId]);
  if (!plan || plan.academicYearId !== ctx.academicYearId) {
    throw unprocessable(`installmentPlanId does not refer to an installment plan of ${ctx.academicYear.yearName}`);
  }
  return plan;
};

/* A plan can only be assigned where some fee structure of the student's class offers it */
const assertOffered = async (ctx, plan, classes) => {
  if (!plan) return;
  for (const { classId, className } of classes) {
    const structures = await feeStructureService.forClass(ctx, ctx.academicYearId, classId);
    if (!structures.some(s => s.installmentPlans.some(p => p.id === plan.id))) {
      throw unprocessable(`The ${plan.name} plan is not offered by any fee structure of ${className}`);
    }
  }
};

const sectionLabel = section => `${section.class?.className ?? "Class"}-${section.sectionName}`;

/* Active students of the scope -> [{ studentId, classId, className }] */
const studentsInScope = async (ctx, { sectionId, classId, studentIds }) => {
  const sections = (await sectionService.findAllInYear(ctx, ctx.academicYearId)).filter(section =>
    sectionId ? section.id === sectionId : classId ? section.classId === classId : true
  );
  if ((sectionId || classId) && !sections.length) {
    throw unprocessable(`${sectionId ? "sectionId" : "classId"} has no sections in ${ctx.academicYear.yearName}`);
  }
  const members = [];
  for (const section of sections) {
    for (const enrollment of await enrollmentService.findRoster(ctx, section.id)) {
      members.push({ studentId: enrollment.studentId, classId: section.classId, className: section.class.className });
    }
  }
  if (!studentIds)
    return { members, label: sections.length === 1 ? sectionLabel(sections[0]) : sections[0]?.class?.className };

  const byId = new Map(members.map(m => [m.studentId, m]));
  const missing = studentIds.filter(id => !byId.has(id));
  if (missing.length) {
    throw unprocessable(`${missing.length} of the students are not active in ${ctx.academicYear.yearName}`);
  }
  return { members: studentIds.map(id => byId.get(id)), label: null };
};

/* Set the plans of locked students and reschedule their unpaid invoices (one transaction) */
const applyAssignments = async (ctx, plan, members, tx) => {
  const students = new Map(
    (
      await studentService.findManyByIds(
        ctx,
        members.map(m => m.studentId)
      )
    ).map(s => [s.id, s])
  );
  const rows = await installmentPlanService.lockStudents(
    ctx,
    ctx.academicYearId,
    members.map(m => m.studentId),
    { dbc: tx }
  );
  const result = { changed: 0, invoicesCancelled: [], invoicesIssued: [] };
  for (const row of rows) {
    if ((row.installmentPlanId ?? null) === (plan?.id ?? null)) continue;
    const rescheduled = await invoiceIssuingService.rescheduleForPlanChange(
      ctx,
      { student: students.get(row.studentId), academicYear: ctx.academicYear, installmentPlanId: plan?.id ?? null },
      { dbc: tx }
    );
    await planAssignmentRepository.update(
      ctx.tenantId,
      row.id,
      { installmentPlanId: plan?.id ?? null, assignedBy: ctx.userId },
      { dbc: tx }
    );
    result.changed++;
    result.invoicesCancelled.push(...rescheduled.cancelled);
    result.invoicesIssued.push(...rescheduled.issued);
  }
  return result;
};

const announce = async (ctx, result) => {
  if (result.invoicesIssued.length) {
    await publish(INVOICES_ISSUED, { tenantId: ctx.tenantId, invoiceIds: result.invoicesIssued.map(i => i.id) });
  }
};

export const planAssignmentService = {
  /* Year-scoped: students with an explicitly assigned plan */
  list: (ctx, { page, limit, installmentPlanId, studentId }) =>
    planAssignmentRepository.list(ctx.tenantId, {
      page,
      limit,
      conditions: [
        eq(studentInstallmentPlans.academicYearId, ctx.academicYearId),
        isNotNull(studentInstallmentPlans.installmentPlanId),
        installmentPlanId && eq(studentInstallmentPlans.installmentPlanId, installmentPlanId),
        studentId && eq(studentInstallmentPlans.studentId, studentId)
      ].filter(Boolean),
      with: {
        plan: { columns: { id: true, name: true } },
        student: {
          columns: { id: true, studentCode: true, admissionNumber: true },
          with: { user: { columns: { firstName: true, lastName: true } } }
        }
      }
    }),

  /* One student's plan for the year. Unpaid invoices issued under the old plan are
     cancelled and re-issued under the new one; once anything is paid it is refused. */
  assign: async (ctx, { studentId, installmentPlanId }) => {
    const [student] = await studentService.findManyByIds(ctx, [studentId]);
    if (!student) throw unprocessable("studentId does not refer to an existing student");
    const plan = await loadPlan(ctx, installmentPlanId);

    const enrollment = await enrollmentService.findForStudent(ctx, studentId, ctx.academicYearId);
    if (!enrollment || enrollment.status !== "ACTIVE") {
      throw unprocessable(`${nameOf(student)} is not an active student in ${ctx.academicYear.yearName}`);
    }
    const section = await sectionService.findById(ctx, enrollment.sectionId);
    await assertOffered(ctx, plan, [{ classId: section.classId, className: section.class.className }]);

    const result = await transaction(tx => applyAssignments(ctx, plan, [{ studentId }], tx));
    await announce(ctx, result);
    return { studentId, studentName: nameOf(student), installmentPlan: planSummary(plan), ...result };
  },

  /* The same plan for a whole section, a class, or a list of students (all or nothing) */
  assignMany: async (ctx, { installmentPlanId, sectionId, classId, studentIds }) => {
    const plan = await loadPlan(ctx, installmentPlanId);
    const { members, label } = await studentsInScope(ctx, { sectionId, classId, studentIds });
    if (!members.length) throw unprocessable("There are no active students to assign");
    const classes = [...new Map(members.map(m => [m.classId, m])).values()];
    await assertOffered(ctx, plan, classes);

    const result = await transaction(tx => applyAssignments(ctx, plan, members, tx));
    await announce(ctx, result);
    return { installmentPlan: planSummary(plan), students: members.length, scope: label, ...result };
  }
};
