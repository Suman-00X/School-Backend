import { sql } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";

/* Flat rows for spreadsheet exports (read model, tenant-filtered) */
const rows = async query => (await db.execute(query)).rows;

export const exportQueries = {
  /* Students of the year with section, roll number and primary parent contact */
  studentRoster: (tenantId, academicYearId) =>
    rows(sql`
      SELECT st.student_code AS "studentCode", st.admission_number AS "admissionNumber",
             u.first_name AS "firstName", u.last_name AS "lastName", u.email, u.phone, u.gender, u.dob::text AS dob,
             c.class_name AS "className", s.section_name AS "sectionName", e.roll_number AS "rollNumber", e.status,
             pu.first_name || ' ' || pu.last_name AS "parentName", pu.phone AS "parentPhone", pu.email AS "parentEmail"
      FROM student_enrollments e
      JOIN students st ON st.id = e.student_id
      JOIN users u ON u.id = st.user_id
      JOIN sections s ON s.id = e.section_id
      JOIN classes c ON c.id = s.class_id
      LEFT JOIN LATERAL (
        SELECT p.user_id FROM student_parents sp JOIN parents p ON p.id = sp.parent_id
        WHERE sp.student_id = st.id AND sp.is_active ORDER BY sp.is_primary_contact DESC, sp.created_at LIMIT 1
      ) primary_parent ON true
      LEFT JOIN users pu ON pu.id = primary_parent.user_id
      WHERE e.tenant_id = ${tenantId} AND e.academic_year_id = ${academicYearId} AND e.is_active
      ORDER BY c.class_order, s.section_name, e.roll_number`),

  /* Whole-day marks of a section in a range */
  attendanceMarks: (tenantId, sectionId, from, to) =>
    rows(sql`
      SELECT student_id AS "studentId", date::text AS date, status
      FROM attendance_records
      WHERE tenant_id = ${tenantId} AND section_id = ${sectionId} AND period_number = 0 AND is_active
        AND date BETWEEN ${from}::date AND ${to}::date`),

  feeCollections: (tenantId, from, to, timezone) =>
    rows(sql`
      SELECT p.receipt_number AS "receiptNumber", (p.paid_at AT TIME ZONE ${timezone})::date::text AS "paidOn",
             p.amount::float AS amount, p.method, p.reference, i.invoice_number AS "invoiceNumber",
             st.admission_number AS "admissionNumber", u.first_name || ' ' || u.last_name AS "studentName"
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
      JOIN students st ON st.id = p.student_id
      JOIN users u ON u.id = st.user_id
      WHERE p.tenant_id = ${tenantId} AND p.status = 'SUCCEEDED' AND p.is_active
        AND (p.paid_at AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date
      ORDER BY p.paid_at`)
};
