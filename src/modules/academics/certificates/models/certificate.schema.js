import { relations, sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activeRows, baseColumns } from "../../../../common/database/columns.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYears } from "../../academic-years/models/academicYear.schema.js";
import { CERTIFICATE_STATUSES, CERTIFICATE_TYPES, FORMAT_TYPES } from "../constants/certificate.constants.js";

export const certificateType = pgEnum("certificate_type", CERTIFICATE_TYPES);
export const certificateStatus = pgEnum("certificate_status", CERTIFICATE_STATUSES);
export const documentFormatType = pgEnum("document_format_type", FORMAT_TYPES);

/* A school's format of one document type (a certificate, or the report card), one row per saved version (never changed
   afterwards). The highest version is the one used for new certificates; restoring an
   old version saves a copy of it as the next version. `html` is the body template
   (common/export/htmlTemplate.js placeholders), `css` its stylesheet. */
export const certificateFormatVersions = pgTable(
  "certificate_format_versions",
  {
    ...baseColumns(),
    type: documentFormatType("type").notNull(),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    html: text("html").notNull(),
    css: text("css").notNull().default(""),
    /* What changed, as told by whoever saved it */
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id)
  },
  t => [uniqueIndex("certificate_format_versions_type_version_uq").on(t.tenantId, t.type, t.version)]
);

/* A certificate issued to a student. `details` is every placeholder value as it was at
   issue (the inputs too): the PDF is printed again from it and the format version it
   was issued with, so a reprint always matches the original. */
export const certificates = pgTable(
  "certificates",
  {
    ...baseColumns(),
    type: certificateType("type").notNull(),
    /* BC/2026-27/0001: the type's prefix, the academic year, the next number of both */
    serialNumber: text("serial_number").notNull(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    academicYearId: uuid("academic_year_id").references(() => academicYears.id),
    formatVersionId: uuid("format_version_id")
      .notNull()
      .references(() => certificateFormatVersions.id),
    details: jsonb("details").notNull(),
    status: certificateStatus("status").notNull().default("ISSUED"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    issuedBy: uuid("issued_by").references(() => users.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancelReason: text("cancel_reason")
  },
  t => [
    uniqueIndex("certificates_serial_number_uq").on(t.tenantId, t.serialNumber),
    /* One transfer certificate in force per student: cancel it to issue another */
    uniqueIndex("certificates_one_tc_uq")
      .on(t.tenantId, t.studentId)
      .where(sql`${t.type} = 'TRANSFER' AND ${t.status} = 'ISSUED' AND ${activeRows(t)}`),
    index("certificates_issued_at_idx").on(t.tenantId, t.issuedAt),
    index("certificates_student_idx").on(t.studentId)
  ]
);

export const certificateFormatVersionsRelations = relations(certificateFormatVersions, ({ one }) => ({
  creator: one(users, { fields: [certificateFormatVersions.createdBy], references: [users.id] })
}));

export const certificatesRelations = relations(certificates, ({ one }) => ({
  student: one(students, { fields: [certificates.studentId], references: [students.id] }),
  formatVersion: one(certificateFormatVersions, {
    fields: [certificates.formatVersionId],
    references: [certificateFormatVersions.id]
  }),
  issuer: one(users, { fields: [certificates.issuedBy], references: [users.id] })
}));
