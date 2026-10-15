import { and, desc, eq, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { feeStructures } from "../../fee-structures/models/feeStructure.schema.js";
import { OPEN_INVOICE_STATUSES } from "../../shared/constants/finance.constants.js";
import { invoiceLines, invoices } from "../models/invoice.schema.js";

export const invoiceRepository = {
  ...createRepository({
    table: invoices,
    queryKey: "invoices",
    orderBy: [desc(invoices.dueDate), desc(invoices.createdAt)]
  }),

  /* Lock an invoice for the rest of the transaction (payments) */
  lockForUpdate: async (tenantId, invoiceId, { dbc }) => {
    const [row] = await dbc
      .select()
      .from(invoices)
      .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId), eq(invoices.isActive, true)))
      .for("update");
    return row ?? null;
  },

  insertLines: (tenantId, invoiceId, lines, { dbc = db } = {}) =>
    dbc.insert(invoiceLines).values(lines.map(line => ({ ...line, invoiceId, tenantId }))),

  liveStudentIdsForInstallment: async (tenantId, feeInstallmentId) => {
    const rows = await db
      .select({ studentId: invoices.studentId })
      .from(invoices)
      .where(
        and(
          eq(invoices.tenantId, tenantId),
          eq(invoices.feeInstallmentId, feeInstallmentId),
          ne(invoices.status, "CANCELLED")
        )
      );
    return new Set(rows.map(row => row.studentId));
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

  /* All tenants: open invoices past due whose structure charges late fees */
  findLateFeeCandidates: () =>
    db
      .select({ invoice: invoices, structure: feeStructures })
      .from(invoices)
      .innerJoin(feeStructures, eq(feeStructures.id, invoices.feeStructureId))
      .where(
        and(
          eq(invoices.isActive, true),
          inArray(invoices.status, OPEN_INVOICE_STATUSES),
          ne(feeStructures.lateFeeType, "NONE"),
          lt(invoices.dueDate, sql`current_date + 1`)
        )
      )
};
