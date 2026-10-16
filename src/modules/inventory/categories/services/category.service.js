import { eq, ne, sql } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { matchesText } from "../../shared/utils/search.util.js";
import { inventoryCategories } from "../models/category.schema.js";
import { categoryRepository } from "../repositories/category.repository.js";

const base = createCrudService(categoryRepository, { entity: "Category" });

/* Names are unique per school, ignoring case */
const assertNameFree = async (ctx, name, exceptId) => {
  const taken = await categoryRepository.findOne(ctx.tenantId, [
    eq(sql`lower(${inventoryCategories.name})`, name.toLowerCase()),
    exceptId && ne(inventoryCategories.id, exceptId)
  ]);
  if (taken) throw conflict(`A category named ${taken.name} already exists`);
};

export const categoryService = {
  ...base,

  list: (ctx, { page, limit, q }) =>
    base.list(ctx, { page, limit }, [matchesText(q, [inventoryCategories.name])].filter(Boolean)),

  create: async (ctx, data) => {
    await assertNameFree(ctx, data.name);
    return categoryRepository.create(ctx.tenantId, data);
  },

  update: async (ctx, categoryId, data) => {
    if (data.name) await assertNameFree(ctx, data.name, categoryId);
    return base.update(ctx, categoryId, data);
  },

  /* A category still holding items cannot be removed */
  remove: async (ctx, categoryId) => {
    const category = await categoryRepository.findById(ctx.tenantId, categoryId);
    if (!category) throw notFound("Category");
    const items = await categoryRepository.countItems(ctx.tenantId, categoryId);
    if (items) {
      throw unprocessable(
        `${category.name} still has ${items} item${items === 1 ? "" : "s"}. Move or remove them first.`
      );
    }
    return categoryRepository.softDelete(ctx.tenantId, categoryId);
  },

  /* For other submodules */
  exists: (ctx, categoryId) => categoryRepository.exists(ctx.tenantId, [eq(inventoryCategories.id, categoryId)])
};
