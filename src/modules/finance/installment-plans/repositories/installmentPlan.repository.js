import { and, asc, eq, inArray } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { installmentPlans, planInstallments, studentInstallmentPlans } from "../models/installmentPlan.schema.js";

export const installmentPlanRepository = {
  ...createRepository({ table: installmentPlans, queryKey: "installmentPlans", orderBy: asc(installmentPlans.name) }),

  /* A plan's installments are replaced as a set (only while no invoice uses them) */
  replaceInstallments: async (tenantId, installmentPlanId, installments, { dbc = db } = {}) => {
    await dbc
      .delete(planInstallments)
      .where(and(eq(planInstallments.tenantId, tenantId), eq(planInstallments.installmentPlanId, installmentPlanId)));
    await dbc.insert(planInstallments).values(
      installments.map((installment, index) => ({
        ...installment,
        installmentPlanId,
        tenantId,
        sequence: index + 1
      }))
    );
  }
};

export const planAssignmentRepository = {
  ...createRepository({ table: studentInstallmentPlans, queryKey: "studentInstallmentPlans" }),

  /* The students' rows for the year, created when missing and locked for the rest of
     the transaction, in student-id order so concurrent callers cannot deadlock.
     Billing, plan changes and concession changes all go through this lock. */
  lockForStudents: async (tenantId, academicYearId, studentIds, { dbc }) => {
    const ids = [...new Set(studentIds)].sort();
    if (!ids.length) return [];
    await dbc
      .insert(studentInstallmentPlans)
      .values(ids.map(studentId => ({ tenantId, studentId, academicYearId })))
      .onConflictDoNothing({
        target: [
          studentInstallmentPlans.tenantId,
          studentInstallmentPlans.studentId,
          studentInstallmentPlans.academicYearId
        ]
      });
    return dbc
      .select()
      .from(studentInstallmentPlans)
      .where(
        scoped(
          studentInstallmentPlans,
          tenantId,
          eq(studentInstallmentPlans.academicYearId, academicYearId),
          inArray(studentInstallmentPlans.studentId, ids)
        )
      )
      .orderBy(asc(studentInstallmentPlans.studentId))
      .for("update");
  }
};
