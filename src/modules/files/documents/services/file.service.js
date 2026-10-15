import { createHash, randomUUID } from "node:crypto";
import { badRequest, notFound } from "../../../../common/http/errors.js";
import { storage } from "../../../../common/storage/storage.js";
import { CATEGORY_RULES, DOWNLOAD_URL_SECONDS } from "../../shared/constants/file.constants.js";
import { storedFileRepository } from "../repositories/storedFile.repository.js";

/* "Report card (final).PDF" -> "report-card-final.pdf" */
const safeName = name => {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const ext =
    dot > 0
      ? name
          .slice(dot + 1)
          .replace(/[^a-zA-Z0-9]/g, "")
          .toLowerCase()
      : "";
  return `${base.slice(0, 80) || "file"}${ext ? `.${ext}` : ""}`;
};

const hidden = { storageKey: 0 };
const view = file => {
  if (!file) return file;
  const { storageKey: _key, ...rest } = file;
  return rest;
};

/* Framework for the rest of the app: any module stores files through here,
   after doing its own access checks */
export const fileService = {
  /* Validate and store an upload (multer file) -> metadata */
  store: async (ctx, file, { ownerType, ownerId, category, description }) => {
    const rule = CATEGORY_RULES[category];
    if (!rule.types.includes(file.mimetype)) {
      throw badRequest(`A ${category.toLowerCase()} cannot be ${file.mimetype}. Allowed: ${rule.types.join(", ")}`);
    }
    if (file.size > rule.maxBytes) {
      throw badRequest(`A ${category.toLowerCase()} can be at most ${Math.round(rule.maxBytes / 1024 / 1024)} MB`);
    }

    const name = safeName(file.originalname ?? "file");
    const storageKey = `${ctx.tenantId}/${ownerType.toLowerCase()}/${ownerId}/${randomUUID()}-${name}`;
    await storage.put(storageKey, file.buffer, { contentType: file.mimetype });

    return view(
      await storedFileRepository.create(ctx.tenantId, {
        ownerType,
        ownerId,
        category,
        fileName: file.originalname ?? name,
        contentType: file.mimetype,
        size: file.size,
        checksum: createHash("sha256").update(file.buffer).digest("hex"),
        storageKey,
        uploadedBy: ctx.userId,
        description
      })
    );
  },

  list: (ctx, { page, limit, ownerType, ownerId, category }) =>
    storedFileRepository.list(ctx.tenantId, {
      page,
      limit,
      projection: hidden,
      filter: { ...(ownerType && { ownerType }), ...(ownerId && { ownerId }), ...(category && { category }) }
    }),

  forOwner: async (ctx, ownerType, ownerId) =>
    (await storedFileRepository.list(ctx.tenantId, { filter: { ownerType, ownerId }, limit: 100, projection: hidden }))
      .rows,

  getById: async (ctx, fileId, { ownerType, ownerId } = {}) => {
    const file = await storedFileRepository.findById(ctx.tenantId, fileId);
    if (!file || (ownerType && file.ownerType !== ownerType) || (ownerId && file.ownerId !== ownerId))
      throw notFound("File");
    return file;
  },

  /* Short-lived link to download the bytes (local: signed token; S3: presigned) */
  downloadUrl: async (ctx, fileId, owner) => {
    const file = await fileService.getById(ctx, fileId, owner);
    const url = await storage.signedUrl(file.storageKey, {
      fileName: file.fileName,
      contentType: file.contentType,
      expiresInSeconds: DOWNLOAD_URL_SECONDS
    });
    return {
      url,
      fileName: file.fileName,
      contentType: file.contentType,
      expiresAt: new Date(Date.now() + DOWNLOAD_URL_SECONDS * 1000)
    };
  },

  /* The raw bytes (for embedding, e.g. a logo in a PDF) */
  readBytes: async storageKey => {
    const chunks = [];
    for await (const chunk of await storage.getStream(storageKey)) chunks.push(chunk);
    return Buffer.concat(chunks);
  },

  remove: async (ctx, fileId, owner) => {
    const file = await fileService.getById(ctx, fileId, owner);
    await storage.remove(file.storageKey);
    await storedFileRepository.remove(ctx.tenantId, fileId);
    return view(file);
  }
};
