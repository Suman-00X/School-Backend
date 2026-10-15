import { sql } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";

/* Read-only aggregate SQL for dashboards. Reads other modules' tables directly
   (read model): every query is filtered by tenant and active rows. */

const rows = async query => (await db.execute(query)).rows;
const first = async query => (await rows(query))[0] ?? {};
const num = value => (value === null || value === undefined ? 0 : Number(value));

/* Attended weight per status (same rule as academics: LATE = 1, HALF_DAY = 0.5, EXCUSED not counted) */
const ATTENDED = sql`CASE status WHEN 'PRESENT' THEN 1 WHEN 'LATE' THEN 1 WHEN 'HALF_DAY' THEN 0.5 ELSE 0 END`;
const COUNTABLE = sql`CASE WHEN status = 'EXCUSED' THEN 0 ELSE 1 END`;
const percent = (attended, countable) =>
  num(countable) > 0 ? Math.round((num(attended) / num(countable)) * 1000) / 10 : null;

export const analyticsQueries = {
  headcounts: async (tenantId, academicYearId) => {
    const row = await first(sql`
      SELECT
        (SELECT count(*) FROM student_enrollments WHERE tenant_id = ${tenantId} AND academic_year_id = ${academicYearId} AND status = 'ACTIVE' AND is_active) AS students,
        (SELECT count(*) FROM teachers WHERE tenant_id = ${tenantId} AND is_active) AS teachers,
        (SELECT count(*) FROM staff_members WHERE tenant_id = ${tenantId} AND is_active) AS staff,
        (SELECT count(*) FROM sections WHERE tenant_id = ${tenantId} AND academic_year_id = ${academicYearId} AND is_active) AS sections,
        (SELECT count(*) FROM classes WHERE tenant_id = ${tenantId} AND is_active) AS classes,
        (SELECT count(*) FROM students WHERE tenant_id = ${tenantId} AND is_active AND created_at >= now() - interval '30 days') AS "admissionsLast30Days"`);
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, num(v)]));
  },

  attendanceOn: async (tenantId, academicYearId, date) => {
    const row = await first(sql`
      SELECT
        (SELECT count(*) FROM attendance_sessions WHERE tenant_id = ${tenantId} AND academic_year_id = ${academicYearId} AND date = ${date} AND period_number = 0 AND is_active) AS "sectionsTaken",
        (SELECT count(*) FROM sections WHERE tenant_id = ${tenantId} AND academic_year_id = ${academicYearId} AND is_active) AS "sectionsTotal",
        sum(${ATTENDED}) AS attended, sum(${COUNTABLE}) AS countable,
        count(*) FILTER (WHERE status = 'ABSENT') AS absent
      FROM attendance_records
      WHERE tenant_id = ${tenantId} AND academic_year_id = ${academicYearId} AND date = ${date} AND period_number = 0 AND is_active`);
    return {
      date,
      sectionsTaken: num(row.sectionsTaken),
      sectionsTotal: num(row.sectionsTotal),
      absent: num(row.absent),
      presentPercentage: percent(row.attended, row.countable)
    };
  },

  feeSummary: async (tenantId, academicYearId, { today, monthStart, timezone }) => {
    const row = await first(sql`
      SELECT
        (SELECT coalesce(sum(amount), 0) FROM payments
          WHERE tenant_id = ${tenantId} AND status = 'SUCCEEDED' AND is_active
            AND (paid_at AT TIME ZONE ${timezone})::date >= ${monthStart}::date) AS "collectedThisMonth",
        (SELECT coalesce(sum(p.amount), 0) FROM payments p JOIN invoices i ON i.id = p.invoice_id
          WHERE p.tenant_id = ${tenantId} AND p.status = 'SUCCEEDED' AND p.is_active AND i.academic_year_id = ${academicYearId}) AS "collectedThisYear",
        coalesce(sum(balance) FILTER (WHERE status IN ('ISSUED', 'PARTIALLY_PAID')), 0) AS outstanding,
        coalesce(sum(balance) FILTER (WHERE status IN ('ISSUED', 'PARTIALLY_PAID') AND due_date < ${today}::date), 0) AS overdue,
        count(*) FILTER (WHERE status IN ('ISSUED', 'PARTIALLY_PAID') AND due_date < ${today}::date) AS "overdueInvoices",
        coalesce(sum(total) FILTER (WHERE status <> 'CANCELLED'), 0) AS billed
      FROM invoices WHERE tenant_id = ${tenantId} AND academic_year_id = ${academicYearId} AND is_active`);
    return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, num(v)]));
  },

  upcomingPapers: async (tenantId, today, days) =>
    num(
      (
        await first(sql`
          SELECT count(*) AS n FROM exam_papers
          WHERE tenant_id = ${tenantId} AND is_active AND exam_date BETWEEN ${today}::date AND ${today}::date + ${days}::int`)
      ).n
    ),

  /* Attendance % per section over [from, to] (of registers taken) */
  attendanceBySection: async (tenantId, academicYearId, from, to) =>
    (
      await rows(sql`
        SELECT s.id AS "sectionId", c.class_name || '-' || s.section_name AS section, c.class_order AS "classOrder",
               sum(${sql.raw("CASE r.status WHEN 'PRESENT' THEN 1 WHEN 'LATE' THEN 1 WHEN 'HALF_DAY' THEN 0.5 ELSE 0 END")}) AS attended,
               sum(${sql.raw("CASE WHEN r.status = 'EXCUSED' THEN 0 ELSE 1 END")}) AS countable,
               count(DISTINCT r.date) AS days
        FROM sections s
        JOIN classes c ON c.id = s.class_id
        LEFT JOIN attendance_records r ON r.section_id = s.id AND r.is_active AND r.period_number = 0 AND r.date BETWEEN ${from}::date AND ${to}::date
        WHERE s.tenant_id = ${tenantId} AND s.academic_year_id = ${academicYearId} AND s.is_active
        GROUP BY s.id, c.class_name, c.class_order, s.section_name
        ORDER BY c.class_order, s.section_name`)
    ).map(r => ({
      sectionId: r.sectionId,
      section: r.section,
      daysRecorded: num(r.days),
      percentage: percent(r.attended, r.countable)
    })),

  attendanceTrend: async (tenantId, academicYearId, from, to) =>
    (
      await rows(sql`
        SELECT date::text AS date, sum(${ATTENDED}) AS attended, sum(${COUNTABLE}) AS countable, count(*) FILTER (WHERE status = 'ABSENT') AS absent
        FROM attendance_records
        WHERE tenant_id = ${tenantId} AND academic_year_id = ${academicYearId} AND period_number = 0 AND is_active
          AND date BETWEEN ${from}::date AND ${to}::date
        GROUP BY date ORDER BY date`)
    ).map(r => ({ date: r.date, absent: num(r.absent), percentage: percent(r.attended, r.countable) })),

  /* Students under `threshold` % with at least `minDays` registers */
  lowAttendance: async (tenantId, academicYearId, from, to, { threshold, minDays }) =>
    (
      await rows(sql`
        SELECT r.student_id AS "studentId", u.first_name AS "firstName", u.last_name AS "lastName",
               c.class_name || '-' || s.section_name AS section,
               sum(${sql.raw("CASE r.status WHEN 'PRESENT' THEN 1 WHEN 'LATE' THEN 1 WHEN 'HALF_DAY' THEN 0.5 ELSE 0 END")}) AS attended,
               sum(${sql.raw("CASE WHEN r.status = 'EXCUSED' THEN 0 ELSE 1 END")}) AS countable
        FROM attendance_records r
        JOIN students st ON st.id = r.student_id
        JOIN users u ON u.id = st.user_id
        JOIN sections s ON s.id = r.section_id
        JOIN classes c ON c.id = s.class_id
        WHERE r.tenant_id = ${tenantId} AND r.academic_year_id = ${academicYearId} AND r.period_number = 0 AND r.is_active
          AND r.date BETWEEN ${from}::date AND ${to}::date
        GROUP BY r.student_id, u.first_name, u.last_name, c.class_name, s.section_name
        HAVING sum(${sql.raw("CASE WHEN r.status = 'EXCUSED' THEN 0 ELSE 1 END")}) >= ${minDays}`)
    )
      .map(r => ({
        studentId: r.studentId,
        firstName: r.firstName,
        lastName: r.lastName,
        section: r.section,
        percentage: percent(r.attended, r.countable)
      }))
      .filter(r => r.percentage !== null && r.percentage < threshold)
      .sort((a, b) => a.percentage - b.percentage),

  collectionsByMonth: async (tenantId, from, to, timezone) =>
    (
      await rows(sql`
        SELECT to_char(paid_at AT TIME ZONE ${timezone}, 'YYYY-MM') AS month, sum(amount) AS amount, count(*) AS payments
        FROM payments
        WHERE tenant_id = ${tenantId} AND status = 'SUCCEEDED' AND is_active
          AND (paid_at AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1 ORDER BY 1`)
    ).map(r => ({ month: r.month, amount: num(r.amount), payments: num(r.payments) })),

  collectionsByMethod: async (tenantId, from, to, timezone) =>
    (
      await rows(sql`
        SELECT method, sum(amount) AS amount, count(*) AS payments
        FROM payments
        WHERE tenant_id = ${tenantId} AND status = 'SUCCEEDED' AND is_active
          AND (paid_at AT TIME ZONE ${timezone})::date BETWEEN ${from}::date AND ${to}::date
        GROUP BY method ORDER BY amount DESC`)
    ).map(r => ({ method: r.method, amount: num(r.amount), payments: num(r.payments) })),

  /* Billed vs collected per class for a year */
  feesByClass: async (tenantId, academicYearId) =>
    (
      await rows(sql`
        SELECT c.id AS "classId", c.class_name AS "className",
               sum(i.total) AS billed, sum(i.amount_paid) AS collected, sum(i.balance) AS outstanding
        FROM invoices i
        JOIN student_enrollments e ON e.student_id = i.student_id AND e.academic_year_id = i.academic_year_id AND e.is_active
        JOIN sections s ON s.id = e.section_id
        JOIN classes c ON c.id = s.class_id
        WHERE i.tenant_id = ${tenantId} AND i.academic_year_id = ${academicYearId} AND i.is_active AND i.status <> 'CANCELLED'
        GROUP BY c.id, c.class_name, c.class_order ORDER BY c.class_order`)
    ).map(r => ({
      classId: r.classId,
      className: r.className,
      billed: num(r.billed),
      collected: num(r.collected),
      outstanding: num(r.outstanding)
    })),

  /* Students with overdue balances, largest first */
  defaulters: async (tenantId, academicYearId, today, { limit }) =>
    (
      await rows(sql`
        SELECT i.student_id AS "studentId", st.admission_number AS "admissionNumber", u.first_name AS "firstName", u.last_name AS "lastName",
               c.class_name || '-' || s.section_name AS section,
               sum(i.balance) AS overdue, count(*) AS invoices, min(i.due_date)::text AS "oldestDueDate"
        FROM invoices i
        JOIN students st ON st.id = i.student_id
        JOIN users u ON u.id = st.user_id
        LEFT JOIN student_enrollments e ON e.student_id = i.student_id AND e.academic_year_id = i.academic_year_id AND e.is_active
        LEFT JOIN sections s ON s.id = e.section_id
        LEFT JOIN classes c ON c.id = s.class_id
        WHERE i.tenant_id = ${tenantId} AND i.academic_year_id = ${academicYearId} AND i.is_active
          AND i.status IN ('ISSUED', 'PARTIALLY_PAID') AND i.due_date < ${today}::date
        GROUP BY i.student_id, st.admission_number, u.first_name, u.last_name, c.class_name, s.section_name
        ORDER BY overdue DESC LIMIT ${limit}`)
    ).map(r => ({ ...r, overdue: num(r.overdue), invoices: num(r.invoices) }))
};
