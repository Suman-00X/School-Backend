import { eq, inArray } from "drizzle-orm";
import { createCrudService } from "../../../../common/crud/crudService.js";
import { conflict, unprocessable } from "../../../../common/http/errors.js";
import { salaryComponents } from "../models/payroll.schema.js";
import { employeeSalaryRepository, salaryComponentRepository } from "../repositories/payroll.repository.js";

const base = createCrudService(salaryComponentRepository, { entity: "Salary component" });

const assertPercent = ({ calculation, defaultValue }) => {
  if (calculation === "PERCENT_OF_BASIC" && defaultValue > 100) {
    throw unprocessable("A percent-of-basic component's defaultValue must be between 0 and 100");
  }
};

const assertUnused = async (ctx, component, change) => {
  const revisions = await employeeSalaryRepository.countUsingComponent(ctx.tenantId, component.id);
  if (revisions) throw conflict(`${component.name} is used in ${revisions} salary revision(s); ${change}`);
};

export const salaryComponentService = {
  ...base,

  list: (ctx, { page, limit, kind }) =>
    base.list(ctx, { page, limit }, [kind && eq(salaryComponents.kind, kind)].filter(Boolean)),

  create: (ctx, data) => {
    assertPercent(data);
    return salaryComponentRepository.create(ctx.tenantId, data);
  },

  /* Kind and calculation give salary values their meaning, so they are fixed once used */
  update: async (ctx, componentId, data) => {
    const existing = await base.getById(ctx, componentId);
    assertPercent({ ...existing, ...data });
    const reshaped =
      (data.kind && data.kind !== existing.kind) || (data.calculation && data.calculation !== existing.calculation);
    if (reshaped) await assertUnused(ctx, existing, "its kind and calculation can no longer change");
    return base.update(ctx, componentId, data);
  },

  remove: async (ctx, componentId) => {
    const existing = await base.getById(ctx, componentId);
    await assertUnused(ctx, existing, "it cannot be removed");
    return base.remove(ctx, componentId);
  },

  /* For other submodules */
  findManyByIds: (ctx, ids) =>
    ids.length
      ? salaryComponentRepository.findMany(ctx.tenantId, { conditions: [inArray(salaryComponents.id, ids)] })
      : []
};
