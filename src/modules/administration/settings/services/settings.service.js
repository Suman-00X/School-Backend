import { notFound } from "../../../../common/http/errors.js";
import { storage } from "../../../../common/storage/storage.js";
import { getTenant, updateTenant } from "../../../../common/tenancy/tenant.service.js";
import { fileService } from "../../../files/documents/index.js";

const PUBLIC_FIELDS = [
  "id",
  "name",
  "code",
  "address",
  "contactEmail",
  "contactPhone",
  "description",
  "timezone",
  "currency",
  "country",
  "updatedAt"
];

/* Settings with a short-lived logo link when a logo is set */
const view = async tenant => ({
  ...Object.fromEntries(PUBLIC_FIELDS.map(field => [field, tenant[field] ?? null])),
  logoUrl: tenant.logoKey
    ? await storage.signedUrl(tenant.logoKey, { contentType: "image/png", expiresInSeconds: 3600 })
    : null
});

export const settingsService = {
  get: async ctx => {
    const tenant = await getTenant(ctx.tenantId);
    if (!tenant) throw notFound("School");
    return view(tenant);
  },

  update: async (ctx, changes) => {
    const tenant = await updateTenant(ctx.tenantId, changes);
    if (!tenant) throw notFound("School");
    return view(tenant);
  },

  /* Replace the school logo (used on report cards and receipts) */
  setLogo: async (ctx, file) => {
    const stored = await fileService.store(ctx, file, { ownerType: "TENANT", ownerId: ctx.tenantId, category: "LOGO" });
    const { storageKey } = await fileService.getById(ctx, stored.id);
    return view(await updateTenant(ctx.tenantId, { logoKey: storageKey }));
  }
};
