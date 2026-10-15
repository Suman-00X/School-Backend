import { notFound } from "../../../../common/http/errors.js";
import { getTenant, updateTenant } from "../../../../common/tenancy/tenant.service.js";

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
  "logoKey",
  "updatedAt"
];

const view = tenant => Object.fromEntries(PUBLIC_FIELDS.map(field => [field, tenant[field] ?? null]));

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
  }
};
