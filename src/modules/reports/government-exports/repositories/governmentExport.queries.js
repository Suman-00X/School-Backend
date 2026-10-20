import { sql } from "drizzle-orm";
import { db } from "../../../../common/database/postgres.js";

const rows = async query => (await db.execute(query)).rows;

/* The first active parent of a relation, as name + phone + email */
const parentOf = relation => sql`
  LEFT JOIN LATERAL (
    SELECT pu.first_name || ' ' || pu.last_name AS name, pu.phone, pu.email
    FROM student_parents sp JOIN parents p ON p.id = sp.parent_id JOIN users pu ON pu.id = p.user_id
    WHERE sp.student_id = st.id AND sp.is_active AND sp.relation = ${relation}
    ORDER BY sp.is_primary_contact DESC, sp.created_at LIMIT 1
  )`;

/* Flat rows for the UDISE+ and APAAR files (read model, tenant-filtered) */
export const governmentExportQueries = {
  /* Students currently enrolled in the year (one section, or all), with what UDISE+ asks,
     and their class in the school's previous academic year (DCF 4.2.5) */
  students: (tenantId, academicYearId, { sectionId } = {}) =>
    rows(sql`
      SELECT st.id AS "studentId", st.admission_number AS "admissionNumber", st.admission_date::text AS "admissionDate",
             st.pen, st.apaar_id AS "apaarId", st.apaar_consent_on::text AS "apaarConsentOn",
             st.mother_tongue AS "motherTongue", st.category, st.religion, st.blood_group AS "bloodGroup",
             u.first_name AS "firstName", u.middle_name AS "middleName", u.last_name AS "lastName",
             u.gender, u.dob::text AS dob, u.email AS "studentEmail", u.phone AS "studentPhone", u.address,
             c.class_name AS "className", c.level AS "classLevel", s.section_name AS "sectionName",
             e.section_id AS "sectionId", e.roll_number AS "rollNumber", e.admission_type AS "admissionType",
             mother.name AS "motherName", father.name AS "fatherName", guardian.name AS "guardianName",
             mother.phone AS "motherPhone", father.phone AS "fatherPhone", guardian.phone AS "guardianPhone",
             COALESCE(mother.email, father.email, guardian.email, u.email) AS email,
             prev.level AS "previousLevel", prev.class_name AS "previousClassName"
      FROM student_enrollments e
      JOIN academic_years y ON y.id = e.academic_year_id
      JOIN students st ON st.id = e.student_id
      JOIN users u ON u.id = st.user_id
      JOIN sections s ON s.id = e.section_id
      JOIN classes c ON c.id = s.class_id
      ${parentOf("MOTHER")} mother ON true
      ${parentOf("FATHER")} father ON true
      ${parentOf("GUARDIAN")} guardian ON true
      LEFT JOIN LATERAL (
        SELECT pc.level, pc.class_name
        FROM student_enrollments pe JOIN sections ps ON ps.id = pe.section_id JOIN classes pc ON pc.id = ps.class_id
        WHERE pe.student_id = st.id AND pe.is_active
          AND pe.academic_year_id = (
            SELECT py.id FROM academic_years py
            WHERE py.tenant_id = e.tenant_id AND py.is_active AND py.start_date < y.start_date
            ORDER BY py.start_date DESC LIMIT 1)
        ORDER BY pe.created_at DESC LIMIT 1
      ) prev ON true
      WHERE e.tenant_id = ${tenantId} AND e.academic_year_id = ${academicYearId} AND e.is_active
        AND e.status = 'ACTIVE' AND st.is_active
        ${sectionId ? sql`AND e.section_id = ${sectionId}` : sql``}
      ORDER BY c.class_order, s.section_name, e.roll_number`)
};
