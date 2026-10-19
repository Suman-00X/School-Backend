import { publish } from "../../../../common/events/events.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { safeErrorMessage } from "../../../../common/http/errorHandler.middleware.js";
import { parseCsvTable } from "../../../../common/import/csv.js";
import { storage } from "../../../../common/storage/storage.js";
import { accountService } from "../../../users/accounts/index.js";
import { parentService } from "../../../users/parents/index.js";
import { studentService } from "../../../users/students/index.js";
import { academicYearService } from "../../../academics/academic-years/index.js";
import { levelFromName } from "../../../academics/classes/index.js";
import { sectionService } from "../../../academics/sections/index.js";
import {
  STUDENT_FIELDS,
  applyMapping,
  missingRequired,
  suggestMapping
} from "../../shared/utils/studentFields.util.js";
import { MAX_RECORDED_ERRORS, PREVIEW_ROWS } from "../models/importJob.model.js";
import { importJobRepository } from "../repositories/importJob.repository.js";
import { STUDENT_TEMPLATE_COLUMNS, studentRowSchema } from "../validators/importRow.validator.js";

export const IMPORT_COMPLETED = "administration.import.completed";

const MAX_ROWS = 5000;
const PROGRESS_EVERY = 25;

/* A section by class and name. Classes match by level, so "Grade 1", "class-1" and
   "Class 1" in a file all find Class 1; a class without a level matches by name. */
const classKey = className => levelFromName(className) ?? className.trim().replace(/\s+/g, " ").toLowerCase();
const sectionKey = section => `${section.class.level ?? classKey(section.class.className)}|${section.sectionName}`;
const rowKey = ({ className, sectionName }) => `${classKey(className)}|${sectionName}`;

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

const loadMapping = async (ctx, importId) => {
  const job = await importJobRepository.findById(ctx.tenantId, importId);
  if (!job) throw notFound("Import");
  if (job.status !== "MAPPING")
    throw conflict(`This import is ${job.status.toLowerCase()}; its mapping can no longer change`);
  return job;
};

/* Every mapped column must exist, and no column may feed two fields */
const checkMapping = (headers, mapping) => {
  const unknown = Object.values(mapping).filter(header => !headers.includes(header));
  if (unknown.length) throw unprocessable(`The file has no column named ${unknown.map(h => `"${h}"`).join(", ")}`);
  const seen = new Map();
  for (const [field, header] of Object.entries(mapping)) {
    if (seen.has(header)) throw unprocessable(`Column "${header}" is mapped to both ${seen.get(header)} and ${field}`);
    seen.set(header, field);
  }
};

/* What the mapping screen needs: fields, columns with sample values, and how the
   first rows would import (validation only; nothing is written) */
const mappingView = async (ctx, job) => {
  const sections = await sectionService.findAllInYear(ctx, job.options.academicYearId);
  const sectionNames = new Set(sections.map(sectionKey));
  const mappedHeaders = new Set(Object.values(job.mapping));
  return {
    fields: STUDENT_FIELDS.map(({ field, label, required }) => ({
      field,
      label,
      required,
      column: job.mapping[field] ?? null
    })),
    columns: job.columns.map((header, i) => ({
      header,
      mapped: mappedHeaders.has(header),
      samples: job.sampleRows.slice(0, 3).map(row => row[i] ?? "")
    })),
    missingRequired: missingRequired(job.mapping).map(f => f.field),
    preview: job.sampleRows.map((cells, index) => {
      const parsed = studentRowSchema.safeParse(
        applyMapping(
          job.columns,
          job.mapping,
          cells.map(cell => (cell === "" ? undefined : cell))
        )
      );
      if (!parsed.success) return { row: index + 2, ok: false, message: describeIssues(parsed.error) };
      const { className, sectionName } = parsed.data;
      return sectionNames.has(rowKey(parsed.data))
        ? { row: index + 2, ok: true }
        : { row: index + 2, ok: false, message: `No section ${className}-${sectionName} in the academic year` };
    })
  };
};

export const studentImportService = {
  /* Step 1: accept the file, read its columns and suggest a mapping (status MAPPING).
     A mapping sent with the upload is applied on top of the suggestion. */
  upload: async (ctx, file, { academicYearId, mapping: requested }) => {
    const year = academicYearId
      ? await academicYearService.findById(ctx, academicYearId)
      : await academicYearService.findCurrent(ctx);
    if (!year)
      throw unprocessable("No academic year to admit students into. Set a current year or send academicYearId.");

    const { headers, rows } = parseCsvTable(file.buffer, { maxRows: MAX_ROWS });
    const mapping = Object.fromEntries(
      Object.entries({ ...suggestMapping(headers), ...(requested ?? {}) }).filter(([, header]) => header !== null)
    );
    checkMapping(headers, mapping);

    const job = await importJobRepository.create(ctx.tenantId, {
      type: "STUDENTS",
      status: "MAPPING",
      fileName: file.originalname,
      options: { academicYearId: year.id },
      totalRows: rows.length,
      columns: headers,
      mapping,
      sampleRows: rows.slice(0, PREVIEW_ROWS).map(cells => cells.map(cell => cell ?? "")),
      createdBy: ctx.userId
    });
    const storageKey = `${ctx.tenantId}/imports/${job.id}.csv`;
    await storage.put(storageKey, file.buffer, { contentType: "text/csv" });
    await importJobRepository.update(ctx.tenantId, job.id, { storageKey });
    return studentImportService.getById(ctx, job.id);
  },

  /* Step 2 (optional): correct the mapping, e.g. { admissionNumber: "Pupil Code" }.
     null unmaps a field. */
  updateMapping: async (ctx, importId, changes) => {
    const job = await loadMapping(ctx, importId);
    const mapping = Object.fromEntries(
      Object.entries({ ...job.mapping, ...changes }).filter(([, header]) => header !== null)
    );
    checkMapping(job.columns, mapping);
    await importJobRepository.update(ctx.tenantId, importId, { mapping });
    return studentImportService.getById(ctx, importId);
  },

  /* Step 3: every required field mapped -> queue the work (202) */
  start: async (ctx, importId, enqueue) => {
    const job = await loadMapping(ctx, importId);
    const missing = missingRequired(job.mapping);
    if (missing.length) {
      throw unprocessable(`Map these required fields to a column first: ${missing.map(f => f.label).join(", ")}`);
    }
    if (!(await importJobRepository.transition(ctx.tenantId, importId, "MAPPING", "QUEUED"))) {
      throw conflict("This import has already been started or cancelled");
    }
    await enqueue({ tenantId: ctx.tenantId, userId: ctx.userId, role: ctx.role, importId });
    return studentImportService.getById(ctx, importId);
  },

  /* Discard an import that has not started */
  cancel: async (ctx, importId) => {
    const job = await loadMapping(ctx, importId);
    if (
      !(await importJobRepository.transition(ctx.tenantId, importId, "MAPPING", "CANCELLED", {
        finishedAt: new Date()
      }))
    ) {
      throw conflict("This import has already been started or cancelled");
    }
    await storage.remove(job.storageKey).catch(() => {});
    return studentImportService.getById(ctx, importId);
  },

  /* Background job body: admit every row; one bad row never stops the rest */
  run: async ({ tenantId, userId, role, importId }) => {
    const ctx = { tenantId, userId, role };
    /* Only a queued import runs, and only once (a duplicate job finds it already PROCESSING) */
    const claimed = await importJobRepository.transition(tenantId, importId, "QUEUED", "PROCESSING", {
      startedAt: new Date(),
      processedRows: 0,
      succeeded: 0,
      failed: 0,
      rowErrors: []
    });
    if (!claimed) return;
    const job = await importJobRepository.findById(tenantId, importId);

    try {
      const chunks = [];
      for await (const chunk of await storage.getStream(job.storageKey)) chunks.push(chunk);
      const { headers, rows } = parseCsvTable(Buffer.concat(chunks), { maxRows: MAX_ROWS });

      const sections = await sectionService.findAllInYear(ctx, job.options.academicYearId);
      const sectionByName = new Map(sections.map(s => [sectionKey(s), s]));

      const progress = { processedRows: 0, succeeded: 0, failed: 0 };
      const rowErrors = [];

      for (const [index, cells] of rows.entries()) {
        const rowNumber = index + 2; /* line 1 is the header */
        try {
          const parsed = studentRowSchema.safeParse(applyMapping(headers, job.mapping, cells));
          if (!parsed.success) throw unprocessable(describeIssues(parsed.error));
          const row = parsed.data;

          const section = sectionByName.get(rowKey(row));
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
      projection: { rowErrors: 0, storageKey: 0, sampleRows: 0 }
    }),

  /* While MAPPING, the answer includes the field list and a validated preview */
  getById: async (ctx, importId) => {
    const job = await importJobRepository.findById(ctx.tenantId, importId);
    if (!job) throw notFound("Import");
    const { storageKey: _key, sampleRows: _rows, ...rest } = job;
    return job.status === "MAPPING" ? { ...rest, ...(await mappingView(ctx, job)) } : rest;
  },

  template: () =>
    `${STUDENT_TEMPLATE_COLUMNS.join(",")}\r\n` +
    "Asha,Rao,asha.rao@example.com,+91 98765 43210,FEMALE,2015-04-12,ADM-2026-001,2026-06-01,Class 1,A,Meera,Rao,meera.rao@example.com,+91 98765 43211,MOTHER\r\n"
};
