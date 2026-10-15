import { eq } from "drizzle-orm";
import { db } from "../../database/postgres/client.js";
import { sections } from "../../database/postgres/schema/index.js";
import { exists, scoped, updateOne } from "../../database/postgres/helpers.js";
import { getPagination } from "../../common/utils/pagination.util.js";
import { sanitizeInput } from "../../common/utils/sanitize.util.js";

const withClassAndTeacher = {
  class: { columns: { id: true, className: true, classOrder: true } },
  classTeacher: { columns: { id: true, employeeCode: true } }
};

export const createSection = async (tenantId, academicYearId, payload) => {
  const [row] = await db
    .insert(sections)
    .values({ ...sanitizeInput(payload), tenantId, academicYearId })
    .returning();
  return row;
};

/* All-or-nothing: one INSERT statement */
export const createSectionsBulk = (tenantId, academicYearId, items) =>
  db
    .insert(sections)
    .values(items.map(item => ({ ...sanitizeInput(item), tenantId, academicYearId })))
    .returning();

export const getSections = (tenantId, academicYearId, query = {}) => {
  const { skip, limit } = getPagination(query);
  return db.query.sections.findMany({
    where: scoped(sections, tenantId, eq(sections.academicYearId, academicYearId)),
    with: withClassAndTeacher,
    limit,
    offset: skip
  });
};

export const getSectionById = async (tenantId, sectionId) =>
  (await db.query.sections.findFirst({
    where: scoped(sections, tenantId, eq(sections.id, sectionId)),
    with: withClassAndTeacher
  })) ?? null;

export const getSectionsByClass = (tenantId, academicYearId, classId) =>
  db
    .select()
    .from(sections)
    .where(scoped(sections, tenantId, eq(sections.academicYearId, academicYearId), eq(sections.classId, classId)));

/* Section inside a given year, with its class (for code generation) */
export const getSectionInYear = async (tenantId, academicYearId, sectionId, dbc = db) =>
  (await dbc.query.sections.findFirst({
    where: scoped(sections, tenantId, eq(sections.academicYearId, academicYearId), eq(sections.id, sectionId)),
    with: { class: true }
  })) ?? null;

export const isSectionInAcademicYear = (tenantId, academicYearId, sectionId) =>
  exists(db, sections, scoped(sections, tenantId, eq(sections.academicYearId, academicYearId), eq(sections.id, sectionId)));

export const updateSection = (tenantId, sectionId, payload) =>
  updateOne(
    db,
    sections,
    scoped(sections, tenantId, eq(sections.id, sectionId)),
    sanitizeInput(payload, ["academicYearId"])
  );
