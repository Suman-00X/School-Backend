import { asc, count, max } from "drizzle-orm";
import { createRepository, scoped } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { diaryEntries, diarySignatures } from "../models/diary.schema.js";

const entries = createRepository({ table: diaryEntries, queryKey: "diaryEntries", orderBy: asc(diaryEntries.createdAt) });
const signatures = createRepository({ table: diarySignatures, queryKey: "diarySignatures" });

export const diaryEntryRepository = {
  ...entries,

  /* Per day: how many entries, and when the latest was written or changed */
  perDay: (tenantId, conditions = []) =>
    db
      .select({ date: diaryEntries.entryDate, entries: count(), lastChangedAt: max(diaryEntries.updatedAt) })
      .from(diaryEntries)
      .where(scoped(diaryEntries, tenantId, ...conditions))
      .groupBy(diaryEntries.entryDate)
};

export const diarySignatureRepository = {
  ...signatures,

  /* Per day: how many students' diaries were signed */
  perDay: (tenantId, conditions = []) =>
    db
      .select({ date: diarySignatures.entryDate, signed: count() })
      .from(diarySignatures)
      .where(scoped(diarySignatures, tenantId, ...conditions))
      .groupBy(diarySignatures.entryDate)
};
