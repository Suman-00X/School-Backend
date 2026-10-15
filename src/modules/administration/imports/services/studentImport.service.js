import { publish } from "../../../../common/events/events.js";
import { notFound, unprocessable } from "../../../../common/http/errors.js";
import { safeErrorMessage } from "../../../../common/http/errorHandler.middleware.js";
import { parseCsv } from "../../../../common/import/csv.js";
import { storage } from "../../../../common/storage/storage.js";
import { accountService } from "../../../users/accounts/index.js";
import { parentService } from "../../../users/parents/index.js";
import { studentService } from "../../../users/students/index.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { sectionService } from "../../../academics/sections/index.js";
import { MAX_RECORDED_ERRORS } from "../models/importJob.model.js";
import { importJobRepository } from "../repositories/importJob.repository.js";
import { STUDENT_TEMPLATE_COLUMNS, studentRowSchema } from "../validators/importRow.validator.js";

export const IMPORT_COMPLETED = "administration.import.completed";

const MAX_ROWS = 5000;
const PROGRESS_EVERY = 25;
const REQUIRED_COLUMNS = ["firstName", "lastName", "email", "admissionNumber", "className", "sectionName"];

const describeIssues = error => error.issues.map(i => `${i.path.join(".") || "row"} ${i.message}`).join("; ");

/* The parent for a row: an existing parent with that email, else a new one */
const resolveParent = async (ctx, row) => {
  if (!row.parentEmail) return [];
  const account = await accountService.findByEmail(ctx, row.parentEmail);
  if (account) {
    const parent = await parentService.findByUserId(ctx, account.id);
    if (!parent) throw unprocessable(`${row.parentEmail} belongs to an account that is not a parent`);
    return [{ parentId: parent.id, relation: row.parentRelation, isPrimaryContact: true }];
  }
  return [
    {
      user: {
        firstName: row.parentFirstName,
        lastName: row.parentLastName,
        email: row.parentEmail,
        phone: row.parentPhone
      },
      profile: {},
      relation: row.parentRelation,
      isPrimaryContact: true
    }
  ];
};

export const studentImportService = {
  /* Accept the file, check it can be read, queue the work -> import job (202) */
  start: async (ctx, file, { academicYearId }, enqueue) => {
    const year = academicYearId
      ? await academicYearService.findById(ctx, academicYearId)
      : await academicYearService.findCurrent(ctx);
    if (!year)
      throw unprocessable("No academic year to admit students into. Set a current year or send academicYearId.");

    const rows = parseCsv(file.buffer, { maxRows: MAX_ROWS });
    const missing = REQUIRED_COLUMNS.filter(column => !(column in rows[0]));
    if (missing.length) throw unprocessable(`The CSV is missing required column(s): ${missing.join(", ")}`);

    const job = await importJobRepository.create(ctx.tenantId, {
      type: "STUDENTS",
      fileName: file.originalname,
      options: { academicYearId: year.id },
      totalRows: rows.length,
      createdBy: ctx.userId
    });
    const storageKey = `${ctx.tenantId}/imports/${job.id}.csv`;
    await storage.put(storageKey, file.buffer, { contentType: "text/csv" });
    await importJobRepository.update(ctx.tenantId, job.id, { storageKey });

    await enqueue({ tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role, importId: job.id });
    return { ...job, storageKey: undefined };
  },

  /* Background job body: admit every row; one bad row never stops the rest */
  run: async ({ tenantId, userId, role, importId }) => {
    const ctx = { tenantId, userId, role };
    const job = await importJobRepository.findById(tenantId, importId);
    if (!job || job.status === "COMPLETED") return;

    await importJobRepository.update(tenantId, importId, {
      status: "PROCESSING",
      startedAt: new Date(),
      processedRows: 0,
      succeeded: 0,
      failed: 0,
      rowErrors: []
    });

    try {
      const chunks = [];
      for await (const chunk of await storage.getStream(job.storageKey)) chunks.push(chunk);
      const rows = parseCsv(Buffer.concat(chunks), { maxRows: MAX_ROWS });

      const sections = await sectionService.findAllInYear(ctx, job.options.academicYearId);
      const sectionByName = new Map(sections.map(s => [`${s.class.className.toLowerCase()}|${s.sectionName}`, s]));

      const progress = { processedRows: 0, succeeded: 0, failed: 0 };
      const rowErrors = [];

      for (const [index, raw] of rows.entries()) {
        const rowNumber = index + 2; /* line 1 is the header */
        try {
          const parsed = studentRowSchema.safeParse(raw);
          if (!parsed.success) throw unprocessable(describeIssues(parsed.error));
          const row = parsed.data;

          const section = sectionByName.get(`${row.className.toLowerCase()}|${row.sectionName}`);
          if (!section) throw unprocessable(`No section ${row.className}-${row.sectionName} in the academic year`);

          await studentService.admit(ctx, {
            user: {
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email,
              phone: row.phone,
              gender: row.gender,
              dob: row.dob
            },
            profile: { admissionNumber: row.admissionNumber, admissionDate: row.admissionDate },
            parents: await resolveParent(ctx, row),
            enrollment: { academicYearId: job.options.academicYearId, sectionId: section.id, admissionType: "NEW" }
          });
          progress.succeeded++;
        } catch (error) {
          progress.failed++;
          if (rowErrors.length < MAX_RECORDED_ERRORS)
            rowErrors.push({ row: rowNumber, message: safeErrorMessage(error) });
        }
        progress.processedRows++;
        if (progress.processedRows % PROGRESS_EVERY === 0) {
          await importJobRepository.update(tenantId, importId, { ...progress, rowErrors });
        }
      }

      await importJobRepository.update(tenantId, importId, {
        ...progress,
        rowErrors,
        status: "COMPLETED",
        finishedAt: new Date()
      });
      await publish(IMPORT_COMPLETED, { tenantId, importId, userId, ...progress });
    } catch (error) {
      await importJobRepository.update(tenantId, importId, {
        status: "FAILED",
        failureReason: safeErrorMessage(error, "The import could not be processed"),
        finishedAt: new Date()
      });
      throw error;
    }
  },

  list: (ctx, { page, limit, status }) =>
    importJobRepository.list(ctx.tenantId, {
      page,
      limit,
      filter: status ? { status } : {},
      projection: { rowErrors: 0, storageKey: 0 }
    }),

  getById: async (ctx, importId) => {
    const job = await importJobRepository.findById(ctx.tenantId, importId);
    if (!job) throw notFound("Import");
    delete job.storageKey;
    return job;
  },

  template: () =>
    `${STUDENT_TEMPLATE_COLUMNS.join(",")}\r\n` +
    "Asha,Rao,asha.rao@example.com,+91 98765 43210,FEMALE,2015-04-12,ADM-2026-001,2026-06-01,Class 1,A,Meera,Rao,meera.rao@example.com,+91 98765 43211,MOTHER\r\n"
};
