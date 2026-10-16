import { desc, eq, gte, sql } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { studentCreditBalances, studentCreditEntries } from "../models/studentCredit.schema.js";

export const creditBalanceRepository = {
  ...createRepository({ table: studentCreditBalances, queryKey: "studentCreditBalances" }),

  /* Add to a student's credit (creates the balance row on first use) -> new balance */
  add: async (tenantId, studentId, amount, { dbc = db } = {}) => {
    const [row] = await dbc
      .insert(studentCreditBalances)
      .values({ tenantId, studentId, balance: amount })
      .onConflictDoUpdate({
        target: [studentCreditBalances.tenantId, studentCreditBalances.studentId],
        set: { balance: sql`${studentCreditBalances.balance} + ${amount}`, updatedAt: new Date() }
      })
      .returning({ balance: studentCreditBalances.balance });
    return row.balance;
  },

  /* Spend credit only if there is enough, in one statement: concurrent spenders queue on
     the row and re-check the balance, so it can never go below zero -> new balance or null */
  take: async (tenantId, studentId, amount, { dbc = db } = {}) => {
    const [row] = await dbc
      .update(studentCreditBalances)
      .set({ balance: sql`${studentCreditBalances.balance} - ${amount}` })
      .where(
        scoped(
          studentCreditBalances,
          tenantId,
          eq(studentCreditBalances.studentId, studentId),
          gte(studentCreditBalances.balance, amount)
        )
      )
      .returning({ balance: studentCreditBalances.balance });
    return row ? row.balance : null;
  }
};

export const creditEntryRepository = createRepository({
  table: studentCreditEntries,
  queryKey: "studentCreditEntries",
  orderBy: desc(studentCreditEntries.createdAt)
});
