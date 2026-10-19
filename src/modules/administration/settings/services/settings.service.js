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

const logoFiles = ctx => fileService.forOwner(ctx, "TENANT", ctx.tenantId);

/* Settings with a short-lived logo link when a logo is set */
const view = async (ctx, tenant) => {
  const logo = tenant.logoKey ? (await logoFiles(ctx)).find(f => f.category === "LOGO") : null;
  return {
    ...Object.fromEntries(PUBLIC_FIELDS.map(field => [field, tenant[field] ?? null])),
    logoUrl: tenant.logoKey
      ? await storage.signedUrl(tenant.logoKey, {
          contentType: logo?.contentType ?? "application/octet-stream",
          expiresInSeconds: 3600
        })
      : null
  };
};

export const settingsService = {
  get: async ctx => {
    const tenant = await getTenant(ctx.tenantId);
    if (!tenant) throw notFound("School");
    return view(ctx, tenant);
  },

  update: async (ctx, changes) => {
    const tenant = await updateTenant(ctx.tenantId, changes);
    if (!tenant) throw notFound("School");
    return view(ctx, tenant);
  },

  /* For other modules (choosing a school at sign-in): a short-lived logo link, or null */
  logoUrl: async ctx => {
    const tenant = await getTenant(ctx.tenantId);
    return tenant?.logoKey ? (await view(ctx, tenant)).logoUrl : null;
  },

  /* Replace the school logo (used on report cards and receipts) */
  setLogo: async (ctx, file) => {
    const stored = await fileService.store(ctx, file, { ownerType: "TENANT", ownerId: ctx.tenantId, category: "LOGO" });
    const { storageKey } = await fileService.getById(ctx, stored.id);
    const tenant = await updateTenant(ctx.tenantId, { logoKey: storageKey });
    /* The previous logo is no longer referenced */
    for (const old of await logoFiles(ctx)) {
      if (old.id !== stored.id && old.category === "LOGO")
        await fileService.remove(ctx, old.id, { ownerType: "TENANT" });
    }
    return view(ctx, tenant);
  }
};
