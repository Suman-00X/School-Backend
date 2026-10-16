import { eq, ne } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { conflict, validationError } from "../../../../common/http/errors.js";
import { getTenant } from "../../../../common/tenancy/tenant.service.js";
import { matchesText } from "../../shared/utils/search.util.js";
import { inventoryVendors } from "../models/vendor.schema.js";
import { vendorRepository } from "../repositories/vendor.repository.js";

/* 15 characters: state code, PAN, entity number, "Z", check character (format only, no checksum) */
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const base = createCrudService(vendorRepository, { entity: "Vendor" });

const checkTaxId = async (ctx, taxId, exceptId) => {
  if (!taxId) return;
  if ((await getTenant(ctx.tenantId))?.country === "IN" && !GSTIN.test(taxId)) {
    const message = "must be a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5)";
    throw validationError(`Invalid request: taxId ${message}`, [{ location: "body", field: "taxId", message }]);
  }
  const taken = await vendorRepository.findOne(ctx.tenantId, [
    eq(inventoryVendors.taxId, taxId),
    exceptId && ne(inventoryVendors.id, exceptId)
  ]);
  if (taken) throw conflict(`${taken.name} is already registered with tax id ${taxId}`);
};

export const vendorService = {
  ...base,

  list: (ctx, { page, limit, q }) =>
    base.list(
      ctx,
      { page, limit },
      [
        matchesText(q, [
          inventoryVendors.name,
          inventoryVendors.contactPerson,
          inventoryVendors.phone,
          inventoryVendors.email,
          inventoryVendors.taxId
        ])
      ].filter(Boolean)
    ),

  create: async (ctx, data) => {
    await checkTaxId(ctx, data.taxId);
    return vendorRepository.create(ctx.tenantId, data);
  },

  update: async (ctx, vendorId, data) => {
    await checkTaxId(ctx, data.taxId, vendorId);
    return base.update(ctx, vendorId, data);
  },

  /* For other submodules: an active vendor, or null */
  findById: (ctx, vendorId) => vendorRepository.findById(ctx.tenantId, vendorId)
};
