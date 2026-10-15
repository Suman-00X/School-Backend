import { sql } from "drizzle-orm";
import { createRepository } from "../../../../common/database/repository.js";
import { db } from "../../../../common/database/postgres.js";
import { marks } from "../models/marks.schema.js";

const excluded = column => sql.raw(`excluded."${column.name}"`);

const base = createRepository({ table: marks, queryKey: "marks" });

export const marksRepository = {
  ...base,

  /* Insert or update on (student_id, exam_paper_id) in one statement (all-or-nothing).
     `created` is true for new rows: Postgres sets xmax = 0 on insert. */
  upsert: (tenantId, rows, { dbc = db } = {}) =>
    dbc
      .insert(marks)
      .values(rows.map(row => ({ ...row, tenantId, isActive: true })))
      .onConflictDoUpdate({
        target: [marks.studentId, marks.examPaperId],
        set: {
          marksObtained: excluded(marks.marksObtained),
          isAbsent: excluded(marks.isAbsent),
          grade: excluded(marks.grade),
          remarks: excluded(marks.remarks),
          evaluatedBy: excluded(marks.evaluatedBy),
          evaluatedAt: excluded(marks.evaluatedAt),
          isActive: true,
          updatedAt: new Date()
        }
      })
      .returning({ id: marks.id, created: sql`(xmax = 0)`.mapWith(Boolean) })
};
