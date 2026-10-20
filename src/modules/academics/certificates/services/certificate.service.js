import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db, transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { nextSequence, pad } from "../../../../common/sequences/sequence.service.js";
import { tenantToday } from "../../../../common/tenancy/tenant.service.js";
import { date as isoDate } from "../../../../common/validation/schemas.js";
import { users } from "../../../users/accounts/models/user.schema.js";
import { students } from "../../../users/students/models/student.schema.js";
import { academicYearService } from "../../academic-years/index.js";
import { enrollmentService } from "../../enrollments/index.js";
import { CERTIFICATE_TYPE_INFO } from "../constants/certificate.constants.js";
import { certificates } from "../models/certificate.schema.js";
import { certificateRepository } from "../repositories/certificate.repository.js";
import { certificateDataService } from "./certificateData.service.js";
import { certificateFormatService } from "./certificateFormat.service.js";
import { certificateRenderService } from "./certificateRender.service.js";

const WITH = {
  student: {
    columns: { id: true, admissionNumber: true },
    with: { user: { columns: { firstName: true, middleName: true, lastName: true } } }
  },
  formatVersion: { columns: { id: true, version: true, name: true } },
  issuer: { columns: { id: true, firstName: true, lastName: true } }
};

const nameOf = user => [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(" ");

const view = certificate => ({
  id: certificate.id,
  type: certificate.type,
  label: CERTIFICATE_TYPE_INFO[certificate.type].label,
  serialNumber: certificate.serialNumber,
  status: certificate.status,
  student: {
    id: certificate.studentId,
    name: certificate.details.values.student.name,
    admissionNumber: certificate.details.values.student.admissionNumber,
    classSection: certificate.details.values.class.classSection ?? ""
  },
  academicYearId: certificate.academicYearId,
  formatVersion: certificate.formatVersion ?? { id: certificate.formatVersionId },
  inputs: certificate.details.inputs,
  issuedAt: certificate.issuedAt,
  issuedBy: certificate.issuer ? { id: certificate.issuer.id, name: nameOf(certificate.issuer) } : null,
  cancelledAt: certificate.cancelledAt,
  cancelReason: certificate.cancelReason
});

/* The inputs a type asks for, checked and trimmed: { key: string } ("" when left out) */
const readInputs = (type, given = {}) => {
  const inputs = {};
  for (const input of CERTIFICATE_TYPE_INFO[type].inputs) {
    const raw = given[input.key];
    const value = raw === null || raw === undefined ? "" : String(raw).trim();
    if (!value) {
      if (input.required) throw unprocessable(`${input.label} is required`);
    } else if (input.kind === "date" && !isoDate().safeParse(value).success) {
      throw unprocessable(`${input.label} must be a date (YYYY-MM-DD)`);
    } else if (input.kind === "number" && !/^\d{1,5}(\.\d{1,2})?$/.test(value)) {
      throw unprocessable(`${input.label} must be a number`);
    } else if (input.kind === "choice" && !input.options.includes(value)) {
      throw unprocessable(`${input.label} must be one of: ${input.options.join(", ")}`);
    } else if (value.length > (input.max ?? 1000)) {
      throw unprocessable(`${input.label} must be at most ${input.max ?? 1000} characters`);
    }
    inputs[input.key] = value;
  }
  return inputs;
};

const findTransfer = (ctx, studentId) =>
  certificateRepository.findOne(ctx.tenantId, [
    eq(certificates.studentId, studentId),
    eq(certificates.type, "TRANSFER"),
    eq(certificates.status, "ISSUED")
  ]);

/* Name or admission number of the student, or the certificate number */
const searchCondition = (tenantId, search) => {
  const pattern = `%${search.replace(/[\\%_]/g, char => `\\${char}`)}%`;
  return or(
    ilike(certificates.serialNumber, pattern),
    inArray(
      certificates.studentId,
      db
        .select({ id: students.id })
        .from(students)
        .innerJoin(users, eq(users.id, students.userId))
        .where(
          and(
            eq(students.tenantId, tenantId),
            or(
              ilike(students.admissionNumber, pattern),
              ilike(sql`concat_ws(' ', ${users.firstName}, ${users.middleName}, ${users.lastName})`, pattern),
              ilike(sql`concat_ws(' ', ${users.firstName}, ${users.lastName})`, pattern)
            )
          )
        )
    )
  );
};

const getRow = async (ctx, certificateId) => {
  const certificate = await certificateRepository.findById(ctx.tenantId, certificateId, { with: WITH });
  if (!certificate) throw notFound("Certificate");
  return certificate;
};

/* A cancelled certificate prints with CANCELLED across it */
const CANCELLED_MARK = {
  html: `<div class="certificate-cancelled">CANCELLED</div>`,
  css: `.certificate-cancelled { position: fixed; top: 45%; left: 0; right: 0; text-align: center; transform: rotate(-30deg);
  font: bold 96pt sans-serif; color: rgba(200, 30, 30, 0.22); letter-spacing: 8pt; pointer-events: none; z-index: 10; }`
};

const formatOf = async (ctx, certificate) => {
  const version = await certificateFormatService.findById(ctx, certificate.formatVersionId);
  if (certificate.status !== "CANCELLED") return version;
  return { ...version, html: version.html + CANCELLED_MARK.html, css: `${version.css}\n${CANCELLED_MARK.css}` };
};

/* What a family sees: the certificate, not who issued it or how */
const familyView = certificate => {
  const { id, type, label, serialNumber, student, academicYearId, issuedAt } = view(certificate);
  return { id, type, label, serialNumber, student, academicYearId, issuedAt };
};

/* A family reaches only the student's certificates in force: a cancelled one is not there */
const getIssuedOf = async (ctx, studentId, certificateId) => {
  const certificate = await getRow(ctx, certificateId);
  if (certificate.studentId !== studentId || certificate.status !== "ISSUED") throw notFound("Certificate");
  return certificate;
};

const fileNameOf = certificate =>
  `${CERTIFICATE_TYPE_INFO[certificate.type].label.toLowerCase().replaceAll(" ", "-")}-${certificate.serialNumber.replaceAll("/", "-")}`;

export const certificateService = {
  /* Issued certificates, newest first */
  list: (ctx, { type, status, studentId, search, page, limit }) =>
    certificateRepository
      .list(ctx.tenantId, {
        page,
        limit,
        with: WITH,
        conditions: [
          type && eq(certificates.type, type),
          status && eq(certificates.status, status),
          studentId && eq(certificates.studentId, studentId),
          search && searchCondition(ctx.tenantId, search)
        ].filter(Boolean)
      })
      .then(result => ({ ...result, rows: result.rows.map(view) })),

  get: async (ctx, certificateId) => view(await getRow(ctx, certificateId)),

  /* Before issuing: the inputs' starting values for the student, and what to know first
     (an earlier certificate of the type; for a TC, one in force blocks issuing) */
  draft: async (ctx, { type, studentId }) => {
    const [inputs, earlier, student, enrollments] = await Promise.all([
      certificateDataService.inputDefaults(ctx, type, studentId),
      certificateRepository.findMany(ctx.tenantId, {
        conditions: [eq(certificates.studentId, studentId), eq(certificates.type, type)],
        with: WITH
      }),
      certificateDataService.build(ctx, type, studentId, {}, {}),
      enrollmentService.findAllForStudent(ctx, studentId)
    ]);
    const enrollment = student.enrollment;
    return {
      type,
      studentId,
      inputs,
      student: { name: student.values.student.name, classSection: student.values.class.classSection ?? "" },
      /* ACTIVE while the student is enrolled in any year (promoted on into the next one too) */
      enrollmentStatus: enrollments.some(e => e.status === "ACTIVE") ? "ACTIVE" : (enrollment?.status ?? null),
      earlier: earlier.map(view),
      blocked:
        type === "TRANSFER" && earlier.some(c => c.status === "ISSUED")
          ? "A transfer certificate is already in force for this student: cancel it to issue another"
          : null
    };
  },

  /* The certificate as it would be issued now (current format), as an HTML document */
  preview: async (ctx, { type, studentId, inputs }) => {
    const read = readInputs(type, inputs);
    const format = await certificateFormatService.current(ctx, type);
    const { values } = await certificateDataService.build(ctx, type, studentId, read, {
      serialNumber: `${CERTIFICATE_TYPE_INFO[type].prefix}/…`
    });
    return certificateRenderService.document(ctx, format, values);
  },

  /* Issue: the details are frozen with the format version in use. A TC can also mark the
     student LEFT (other modules then release their seat, bed and so on); markedLeft says
     whether a live enrollment was closed. */
  issue: async (ctx, { type, studentId, inputs, markLeft = false }) => {
    const read = readInputs(type, inputs);
    if (type === "TRANSFER" && (await findTransfer(ctx, studentId))) {
      throw conflict("A transfer certificate is already in force for this student: cancel it to issue another");
    }
    const format = await certificateFormatService.current(ctx, type);
    const issuedOn = await tenantToday(ctx.tenantId);
    const { values, enrollment } = await certificateDataService.build(ctx, type, studentId, read, { issuedOn });

    const year = enrollment
      ? await academicYearService.findById(ctx, enrollment.academicYearId)
      : await academicYearService.findCurrent(ctx);
    const yearName = year?.yearName ?? issuedOn.slice(0, 4);
    const { prefix } = CERTIFICATE_TYPE_INFO[type];

    /* One transaction: if the student can't be marked left (e.g. an archived year), no TC
       and no serial number are taken either */
    let left = [];
    const certificate = await transaction(async tx => {
      const n = await nextSequence(ctx.tenantId, `CERTIFICATE_${type}_${yearName}`, { dbc: tx });
      const serialNumber = `${prefix}/${yearName}/${pad(n, 4)}`;
      values.certificate.serialNumber = serialNumber;
      const row = await certificateRepository.create(
        ctx.tenantId,
        {
          type,
          serialNumber,
          studentId,
          academicYearId: year?.id ?? null,
          formatVersionId: format.id,
          details: { values, inputs: read },
          status: "ISSUED",
          issuedBy: ctx.userId ?? null
        },
        { dbc: tx }
      );
      /* The live enrollment, wherever it is: after a promotion it's the next year's, while
         the certificate speaks of the year the request names */
      if (type === "TRANSFER" && markLeft) left = await enrollmentService.closeForLeaving(ctx, studentId, { dbc: tx });
      return row;
    });
    await enrollmentService.announceLeft(ctx, left);

    return { ...(await certificateService.get(ctx, certificate.id)), markedLeft: left.length > 0 };
  },

  /* Cancelled certificates stay listed and print with CANCELLED across them. A cancelled
     TC does not bring the student back: re-enroll them if they return. */
  cancel: async (ctx, certificateId, { reason }) => {
    const certificate = await getRow(ctx, certificateId);
    if (certificate.status === "CANCELLED") throw conflict("This certificate is already cancelled");
    await certificateRepository.update(ctx.tenantId, certificateId, {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledBy: ctx.userId ?? null,
      cancelReason: reason
    });
    return certificateService.get(ctx, certificateId);
  },

  /* The certificate as issued: { html } for the screen, or the PDF */
  document: async (ctx, certificateId) => {
    const certificate = await getRow(ctx, certificateId);
    return certificateRenderService.document(ctx, await formatOf(ctx, certificate), certificate.details.values, {
      title: certificate.serialNumber
    });
  },

  /* The portal: a student's certificates in force, newest first (every year) */
  forStudent: (ctx, studentId, { type, page, limit }) =>
    certificateRepository
      .list(ctx.tenantId, {
        page,
        limit,
        with: WITH,
        conditions: [
          eq(certificates.studentId, studentId),
          eq(certificates.status, "ISSUED"),
          type && eq(certificates.type, type)
        ].filter(Boolean)
      })
      .then(result => ({ ...result, rows: result.rows.map(familyView) })),

  documentForStudent: async (ctx, studentId, certificateId) => {
    await getIssuedOf(ctx, studentId, certificateId);
    return certificateService.document(ctx, certificateId);
  },

  pdfForStudent: async (ctx, studentId, certificateId) => {
    await getIssuedOf(ctx, studentId, certificateId);
    return certificateService.pdf(ctx, certificateId);
  },

  pdf: async (ctx, certificateId) => {
    const certificate = await getRow(ctx, certificateId);
    const buffer = await certificateRenderService.pdf(
      ctx,
      await formatOf(ctx, certificate),
      certificate.details.values,
      {
        title: certificate.serialNumber
      }
    );
    return { buffer, fileName: fileNameOf(certificate) };
  }
};
