import { sql } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";

/* Read-only aggregate SQL for dashboards. Reads other modules' tables directly
   (read model): every query is filtered by tenant and active rows. */

const rows = async query => (await db.execute(query)).rows;
const first = async query => (await rows(query))[0] ?? {};
const num = value => (value === null || value === undefined ? 0 : Number(value));

/* Attended weight per status (same rule as academics: LATE = 1, HALF_DAY = 0.5, EXCUSED not counted) */
const WEIGHT = sql.raw("CASE r.status WHEN 'PRESENT' THEN 1 WHEN 'LATE' THEN 1 WHEN 'HALF_DAY' THEN 0.5 ELSE 0 END");
const percent = (attended, countable) =>
  num(countable) > 0 ? Math.round((num(attended) / num(countable)) * 1000) / 10 : null;

/* One row per student and day over the registers taken, in day units for every mode
   (academics/attendance): a DAY mark counts 1; a FORENOON or AFTERNOON mark 0.5; a
   period-wise day 1, present when the school's threshold of its marked periods was
   attended. EXCUSED is left out. periodsAttended/periodsCountable keep the period detail. */
const studentDays = (tenantId, academicYearId, from, to) => sql`
  WITH threshold AS (
    SELECT coalesce((SELECT period_presence_threshold FROM attendance_policies
                     WHERE tenant_id = ${tenantId} AND is_active), 50) AS pct
  ), marks AS (
    SELECT r.student_id, r.section_id, r.date,
           coalesce(sum(${WEIGHT}) FILTER (WHERE r.kind = 'DAY'), 0)
             + 0.5 * coalesce(sum(${WEIGHT}) FILTER (WHERE r.kind IN ('FORENOON', 'AFTERNOON')), 0) AS session_credit,
           count(*) FILTER (WHERE r.kind = 'DAY' AND r.status <> 'EXCUSED')
             + 0.5 * count(*) FILTER (WHERE r.kind IN ('FORENOON', 'AFTERNOON') AND r.status <> 'EXCUSED') AS session_countable,
           coalesce(sum(${WEIGHT}) FILTER (WHERE r.kind = 'PERIOD'), 0) AS periods_attended,
           count(*) FILTER (WHERE r.kind = 'PERIOD' AND r.status <> 'EXCUSED') AS periods_countable
    FROM attendance_records r
    WHERE r.tenant_id = ${tenantId} AND r.academic_year_id = ${academicYearId} AND r.is_active
      AND r.date BETWEEN ${from}::date AND ${to}::date
    GROUP BY r.student_id, r.section_id, r.date
  ), student_days AS (
    SELECT m.student_id, m.section_id, m.date, m.periods_attended, m.periods_countable,
           m.session_credit + CASE WHEN m.periods_countable > 0
                                    AND 100 * m.periods_attended >= (SELECT pct FROM threshold) * m.periods_countable
                               THEN 1 ELSE 0 END AS credit,
           m.session_countable + CASE WHEN m.periods_countable > 0 THEN 1 ELSE 0 END AS countable
    FROM marks m
  )`;

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

  /* absent: students with no attendance that day; partlyAbsent: some of it (a session, too few periods…) */
  attendanceOn: async (tenantId, academicYearId, date) => {
    const row = await first(sql`
      ${studentDays(tenantId, academicYearId, date, date)}
      SELECT
        (SELECT count(DISTINCT section_id) FROM attendance_sessions WHERE tenant_id = ${tenantId} AND academic_year_id = ${academicYearId} AND date = ${date} AND is_active) AS "sectionsTaken",
        (SELECT count(*) FROM sections WHERE tenant_id = ${tenantId} AND academic_year_id = ${academicYearId} AND is_active) AS "sectionsTotal",
        sum(credit) AS attended, sum(countable) AS countable,
        count(*) FILTER (WHERE countable > 0 AND credit = 0) AS absent,
        count(*) FILTER (WHERE credit > 0 AND credit < countable) AS "partlyAbsent"
      FROM student_days`);
    return {
      date,
      sectionsTaken: num(row.sectionsTaken),
      sectionsTotal: num(row.sectionsTotal),
      absent: num(row.absent),
      partlyAbsent: num(row.partlyAbsent),
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
        (SELECT coalesce(sum(r.amount), 0) FROM payment_refunds r JOIN invoices i ON i.id = r.invoice_id
          WHERE r.tenant_id = ${tenantId} AND r.status IN ('PROCESSED', 'PENDING') AND r.is_active AND i.academic_year_id = ${academicYearId}) AS "refundedThisYear",
        coalesce(sum(balance) FILTER (WHERE status IN ('ISSUED', 'PARTIALLY_PAID')), 0) AS outstanding,
        coalesce(sum(balance) FILTER (WHERE status IN ('ISSUED', 'PARTIALLY_PAID') AND due_date < ${today}::date), 0) AS overdue,
        count(*) FILTER (WHERE status IN ('ISSUED', 'PARTIALLY_PAID') AND due_date < ${today}::date) AS "overdueInvoices",
        coalesce(sum(total) FILTER (WHERE status <> 'CANCELLED'), 0) AS billed,
        coalesce(sum(discount) FILTER (WHERE status <> 'CANCELLED'), 0) AS concessions,
        coalesce(sum(late_fee) FILTER (WHERE status <> 'CANCELLED'), 0) AS "lateFees",
        coalesce(sum(late_fee_waived_amount) FILTER (WHERE status <> 'CANCELLED'), 0) AS "lateFeesWaived",
        (SELECT coalesce(sum(balance), 0) FROM student_credit_balances
          WHERE tenant_id = ${tenantId} AND is_active) AS "creditHeld"
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

  /* Attendance % per section over [from, to] (of registers taken, in days), plus the
     period percentage of period-wise registers */
  attendanceBySection: async (tenantId, academicYearId, from, to) =>
    (
      await rows(sql`
        ${studentDays(tenantId, academicYearId, from, to)}
        SELECT s.id AS "sectionId", s.class_id AS "classId", c.class_name || '-' || s.section_name AS section,
               sum(d.credit) AS attended, sum(d.countable) AS countable, count(DISTINCT d.date) AS days,
               sum(d.periods_attended) AS "periodsAttended", sum(d.periods_countable) AS "periodsCountable"
        FROM sections s
        JOIN classes c ON c.id = s.class_id
        LEFT JOIN student_days d ON d.section_id = s.id
        WHERE s.tenant_id = ${tenantId} AND s.academic_year_id = ${academicYearId} AND s.is_active
        GROUP BY s.id, s.class_id, c.class_name, c.class_order, s.section_name
        ORDER BY c.class_order, s.section_name`)
    ).map(r => ({
      sectionId: r.sectionId,
      classId: r.classId,
      section: r.section,
      daysRecorded: num(r.days),
      percentage: percent(r.attended, r.countable),
      periodPercentage: percent(r.periodsAttended, r.periodsCountable)
    })),

  attendanceTrend: async (tenantId, academicYearId, from, to) =>
    (
      await rows(sql`
        ${studentDays(tenantId, academicYearId, from, to)}
        SELECT date::text AS date, sum(credit) AS attended, sum(countable) AS countable,
               count(*) FILTER (WHERE countable > 0 AND credit = 0) AS absent
        FROM student_days
        GROUP BY date ORDER BY date`)
    ).map(r => ({ date: r.date, absent: num(r.absent), percentage: percent(r.attended, r.countable) })),

  /* Students under `threshold` % with at least `minDays` countable days of registers */
  lowAttendance: async (tenantId, academicYearId, from, to, { threshold, minDays }) =>
    (
      await rows(sql`
        ${studentDays(tenantId, academicYearId, from, to)}
        SELECT d.student_id AS "studentId", u.first_name AS "firstName", u.last_name AS "lastName",
               c.class_name || '-' || s.section_name AS section,
               sum(d.credit) AS attended, sum(d.countable) AS countable
        FROM student_days d
        JOIN students st ON st.id = d.student_id
        JOIN users u ON u.id = st.user_id
        JOIN sections s ON s.id = d.section_id
        JOIN classes c ON c.id = s.class_id
        GROUP BY d.student_id, u.first_name, u.last_name, c.class_name, s.section_name
        HAVING sum(d.countable) >= ${minDays}`)
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
               sum(i.total) AS billed, sum(i.discount) AS concessions, sum(i.amount_paid) AS collected, sum(i.balance) AS outstanding
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
      concessions: num(r.concessions),
      collected: num(r.collected),
      outstanding: num(r.outstanding)
    })),

  /* Concessions given on a year's live invoices, by why they were given */
  concessionsByCategory: async (tenantId, academicYearId) =>
    (
      await rows(sql`
        SELECT c.category, sum(ilc.amount) AS amount, count(DISTINCT i.student_id) AS students
        FROM invoice_line_concessions ilc
        JOIN invoices i ON i.id = ilc.invoice_id
        JOIN concessions c ON c.id = ilc.concession_id
        WHERE ilc.tenant_id = ${tenantId} AND ilc.is_active AND i.is_active
          AND i.academic_year_id = ${academicYearId} AND i.status <> 'CANCELLED'
        GROUP BY c.category ORDER BY amount DESC`)
    ).map(r => ({ category: r.category, amount: num(r.amount), students: num(r.students) })),

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
