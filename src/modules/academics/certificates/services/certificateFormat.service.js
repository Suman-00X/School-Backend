import { eq, lte } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { checkTemplate } from "../../../../common/export/htmlTemplate.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { lockSequence } from "../../../../common/sequences/sequence.service.js";
import { FORMAT_TYPES } from "../constants/certificate.constants.js";
import { certificateFormatVersions as versions } from "../models/certificate.schema.js";
import { certificateFormatRepository } from "../repositories/certificateFormat.repository.js";
import { certificateRenderService } from "./certificateRender.service.js";
import { formatTypeOf, knownPlaceholders } from "./formatTypes.js";

/* A school's document formats (certificates and the report card): every save is a new
   version; the highest is in use */

const summary = version => ({
  id: version.id,
  type: version.type,
  version: version.version,
  name: version.name,
  note: version.note,
  createdBy: version.createdBy,
  createdByName: version.creator ? `${version.creator.firstName} ${version.creator.lastName}`.trim() : null,
  createdAt: version.createdAt
});

const WITH_CREATOR = { creator: { columns: { firstName: true, lastName: true } } };

const full = version => ({ ...summary(version), html: version.html, css: version.css });

/* Schools whose first versions exist (this process has checked) */
const ensured = new Set();

const ensure = async ctx => {
  if (ensured.has(ctx.tenantId)) return;
  const missing = [];
  for (const type of FORMAT_TYPES) {
    if (!(await certificateFormatRepository.latestNumber(ctx.tenantId, type))) {
      missing.push({ type, ...formatTypeOf(type).defaultFormat(), note: "The standard format" });
    }
  }
  await certificateFormatRepository.ensureFirst(ctx.tenantId, missing);
  ensured.add(ctx.tenantId);
};

const findVersion = (ctx, type, version, options) =>
  certificateFormatRepository.findOne(ctx.tenantId, [eq(versions.type, type), eq(versions.version, version)], {
    ...options,
    with: WITH_CREATOR
  });

const labelOf = type => formatTypeOf(type).label.toLowerCase();

/* A template must parse and use only placeholders this type has */
const assertTemplate = (type, html) => {
  const { error, unknown } = checkTemplate(html, knownPlaceholders(type));
  if (error) throw unprocessable(`The format can't be read: ${error}`);
  if (unknown.length) {
    throw unprocessable(
      `Unknown placeholder${unknown.length === 1 ? "" : "s"} ${unknown.map(p => `{{${p}}}`).join(", ")}: pick fields from the list for a ${labelOf(type)}`
    );
  }
};

export const certificateFormatService = {
  /* The format in use of every type */
  listCurrent: async ctx =>
    Promise.all(
      FORMAT_TYPES.map(async type => ({
        ...summary(await certificateFormatService.current(ctx, type)),
        label: formatTypeOf(type).label
      }))
    ),

  /* The version in use (the highest), with its HTML and CSS */
  current: async (ctx, type, options) => {
    await ensure(ctx);
    const latest = await certificateFormatRepository.latestNumber(ctx.tenantId, type, options);
    return findVersion(ctx, type, latest, options);
  },

  /* With the placeholders the editor offers */
  currentFull: async (ctx, type) => ({
    ...full(await certificateFormatService.current(ctx, type)),
    label: formatTypeOf(type).label,
    placeholders: formatTypeOf(type).placeholderGroups()
  }),

  /* The version that was in use at a moment (the first version when none was saved by
     then: the standard format, created the first time the formats were read) */
  inUseAt: async (ctx, type, at) => {
    await ensure(ctx);
    /* Newest first */
    const [then] = await certificateFormatRepository.findMany(ctx.tenantId, {
      conditions: [eq(versions.type, type), lte(versions.createdAt, new Date(at))]
    });
    return then ?? findVersion(ctx, type, 1);
  },

  /* Every version of a type, newest first (without their HTML) */
  versions: async (ctx, type) => {
    await ensure(ctx);
    return (
      await certificateFormatRepository.findMany(ctx.tenantId, {
        conditions: [eq(versions.type, type)],
        with: WITH_CREATOR
      })
    ).map(summary);
  },

  getVersion: async (ctx, type, version) => {
    await ensure(ctx);
    const found = await findVersion(ctx, type, version);
    if (!found) throw notFound(`Version ${version} of the ${labelOf(type)} format`);
    return full(found);
  },

  /* Save a new version. baseVersion: the version the editor started from; when someone
     saved another since, 409 instead of overwriting their change. */
  save: async (ctx, type, { name, html, css = "", note, baseVersion }) => {
    assertTemplate(type, html);
    await ensure(ctx);
    const saved = await transaction(async tx => {
      await lockSequence(ctx.tenantId, `CERTIFICATE_FORMAT_${type}`, { dbc: tx });
      const latest = await certificateFormatRepository.latestNumber(ctx.tenantId, type, { dbc: tx });
      if (baseVersion !== undefined && baseVersion !== latest) {
        throw conflict(
          `Version ${latest} was saved after you opened version ${baseVersion}: reload the format to see it`
        );
      }
      return certificateFormatRepository.create(
        ctx.tenantId,
        { type, version: latest + 1, name, html, css, note: note ?? null, createdBy: ctx.userId ?? null },
        { dbc: tx }
      );
    });
    return certificateFormatService.getVersion(ctx, type, saved.version);
  },

  /* Make an old version the one in use again: saved as the next version */
  restore: async (ctx, type, version) => {
    const old = await certificateFormatService.getVersion(ctx, type, version);
    return certificateFormatService.save(ctx, type, {
      name: old.name,
      html: old.html,
      css: old.css,
      note: `Restored from version ${version}`
    });
  },

  /* A format being edited, filled with a student's details (or the sample ones):
     the HTML document, or its PDF */
  preview: async (ctx, type, { html, css = "", name, studentId }, { pdf = false } = {}) => {
    assertTemplate(type, html);
    const kind = formatTypeOf(type);
    const values = studentId ? await kind.forStudent(ctx, studentId) : await kind.sample(ctx);
    const format = { html, css, name: name ?? kind.label };
    return pdf
      ? certificateRenderService.pdf(ctx, format, values)
      : certificateRenderService.document(ctx, format, values);
  },

  /* For certificates: the version a certificate was issued with */
  findById: (ctx, formatVersionId) => certificateFormatRepository.findById(ctx.tenantId, formatVersionId)
};
