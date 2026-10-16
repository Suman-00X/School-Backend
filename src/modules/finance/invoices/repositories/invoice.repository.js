import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { feeStructures } from "../../fee-structures/models/feeStructure.schema.js";
import { OPEN_INVOICE_STATUSES } from "../../shared/constants/finance.constants.js";
import { invoiceLineConcessions, invoiceLines, invoices } from "../models/invoice.schema.js";

export const invoiceRepository = {
  ...createRepository({
    table: invoices,
    queryKey: "invoices",
    orderBy: [desc(invoices.dueDate), desc(invoices.createdAt)]
  }),

  /* Lock an invoice for the rest of the transaction (payments, waivers, credit) */
  lockForUpdate: async (tenantId, invoiceId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(invoices)
      .where(scoped(invoices, tenantId, eq(invoices.id, invoiceId)))
      .for("update");
    return row ?? null;
  },

  /* A student's live (not cancelled) invoices of a year, locked, in due-date order */
  lockLiveForStudent: (tenantId, studentId, academicYearId, { dbc }) =>
    dbc
      .select()
      .from(invoices)
      .where(
        scoped(
          invoices,
          tenantId,
          eq(invoices.studentId, studentId),
          eq(invoices.academicYearId, academicYearId),
          ne(invoices.status, "CANCELLED")
        )
      )
      .orderBy(asc(invoices.dueDate), asc(invoices.invoiceNumber))
      .for("update"),

  /* Live invoices of a structure for some students: which plan and installments they cover */
  liveForStructure: (tenantId, feeStructureId, studentIds, { dbc = db } = {}) =>
    studentIds.length
      ? dbc
          .select({
            studentId: invoices.studentId,
            installmentPlanId: invoices.installmentPlanId,
            planInstallmentId: invoices.planInstallmentId
          })
          .from(invoices)
          .where(
            scoped(
              invoices,
              tenantId,
              eq(invoices.feeStructureId, feeStructureId),
              inArray(invoices.studentId, studentIds),
              ne(invoices.status, "CANCELLED")
            )
          )
      : [],

  /* Lines with the concessions on each: [{ ..., concessions: [{ concessionId, name, amount }] }] */
  insertLines: async (tenantId, invoiceId, lines, { dbc = db } = {}) => {
    const rows = lines.map(({ concessions: _applied, ...line }) => ({
      ...line,
      id: randomUUID(),
      invoiceId,
      tenantId
    }));
    await dbc.insert(invoiceLines).values(rows);
    const applied = lines.flatMap((line, index) =>
      line.concessions.map(c => ({ ...c, invoiceId, invoiceLineId: rows[index].id, tenantId }))
    );
    if (applied.length) await dbc.insert(invoiceLineConcessions).values(applied);
  },

  /* Lines are rebuilt when an unpaid invoice is recalculated */
  deleteLines: async (tenantId, invoiceId, { dbc }) => {
    await dbc
      .delete(invoiceLineConcessions)
      .where(and(eq(invoiceLineConcessions.tenantId, tenantId), eq(invoiceLineConcessions.invoiceId, invoiceId)));
    await dbc
      .delete(invoiceLines)
      .where(and(eq(invoiceLines.tenantId, tenantId), eq(invoiceLines.invoiceId, invoiceId)));
  },

  /* All tenants: open invoices due within the next `days` days or already overdue */
  findOpenDueWithin: days =>
    db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.isActive, true),
          inArray(invoices.status, OPEN_INVOICE_STATUSES),
          lte(invoices.dueDate, sql`current_date + ${days}::int`)
        )
      ),

  /* All tenants: open, unwaived invoices that are overdue (or already carry a late fee) */
  findLateFeeCandidates: () =>
    db
      .select({
        invoice: invoices,
        structure: {
          id: feeStructures.id,
          chargesLateFee: feeStructures.chargesLateFee,
          lateFeeRuleId: feeStructures.lateFeeRuleId
        }
      })
      .from(invoices)
      .innerJoin(feeStructures, eq(feeStructures.id, invoices.feeStructureId))
      .where(
        and(
          eq(invoices.isActive, true),
          inArray(invoices.status, OPEN_INVOICE_STATUSES),
          isNull(invoices.lateFeeWaivedAt),
          sql`(${invoices.dueDate} < current_date + 1 OR ${gt(invoices.lateFee, 0)})`
        )
      )
};
