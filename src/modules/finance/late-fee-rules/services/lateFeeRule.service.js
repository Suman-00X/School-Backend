import { asc, eq } from "drizzle-orm";
import { transaction } from "../../../../common/database/postgres.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { feeStructureService } from "../../fee-structures/index.js";
import { lateFeeRules, lateFeeSlabs } from "../models/lateFeeRule.schema.js";
import { lateFeeRuleRepository } from "../repositories/lateFeeRule.repository.js";

const withSlabs = { slabs: { orderBy: [asc(lateFeeSlabs.fromDay)] } };

/* Slabs start at day 1, follow each other without gaps or overlaps, and only the last may be open-ended */
const checkSlabs = slabs => {
  const ordered = [...slabs].sort((a, b) => a.fromDay - b.fromDay);
  ordered.forEach((slab, index) => {
    const expected = index === 0 ? 1 : ordered[index - 1].toDay + 1;
    if (slab.fromDay !== expected) {
      throw unprocessable(
        index === 0
          ? "The first slab must start at day 1"
          : `Slabs must follow each other: a slab should start at day ${expected}, not ${slab.fromDay}`
      );
    }
    if (slab.toDay === undefined || slab.toDay === null) {
      if (index < ordered.length - 1) throw unprocessable("Only the last slab can be open-ended (no toDay)");
    } else if (slab.toDay < slab.fromDay) {
      throw unprocessable(`The slab from day ${slab.fromDay} ends before it starts`);
    }
  });
  return ordered.map(slab => ({ ...slab, toDay: slab.toDay ?? null }));
};

export const lateFeeRuleService = {
  list: (ctx, { page, limit }) => lateFeeRuleRepository.list(ctx.tenantId, { page, limit, with: withSlabs }),

  getById: async (ctx, ruleId) => {
    const rule = await lateFeeRuleRepository.findById(ctx.tenantId, ruleId, { with: withSlabs });
    if (!rule) throw notFound("Late fee rule");
    return rule;
  },

  create: async (ctx, { slabs, ...data }) => {
    const ordered = checkSlabs(slabs);
    const id = await transaction(async tx => {
      if (data.isDefault) await lateFeeRuleRepository.clearDefault(ctx.tenantId, { dbc: tx });
      const rule = await lateFeeRuleRepository.create(ctx.tenantId, data, { dbc: tx });
      await lateFeeRuleRepository.replaceSlabs(ctx.tenantId, rule.id, ordered, { dbc: tx });
      return rule.id;
    });
    return lateFeeRuleService.getById(ctx, id);
  },

  /* Changes apply to open invoices from the next daily run */
  update: async (ctx, ruleId, { slabs, ...data }) => {
    await lateFeeRuleService.getById(ctx, ruleId);
    const ordered = slabs && checkSlabs(slabs);
    await transaction(async tx => {
      if (data.isDefault) await lateFeeRuleRepository.clearDefault(ctx.tenantId, { dbc: tx });
      await lateFeeRuleRepository.update(ctx.tenantId, ruleId, data, { dbc: tx });
      if (ordered) await lateFeeRuleRepository.replaceSlabs(ctx.tenantId, ruleId, ordered, { dbc: tx });
    });
    return lateFeeRuleService.getById(ctx, ruleId);
  },

  remove: async (ctx, ruleId) => {
    const rule = await lateFeeRuleService.getById(ctx, ruleId);
    const usedBy = await feeStructureService.usingLateFeeRule(ctx, ruleId);
    if (usedBy.length) {
      throw conflict(`${rule.name} is used by ${usedBy.map(s => s.name).join(", ")}; choose another rule there first`);
    }
    return lateFeeRuleRepository.softDelete(ctx.tenantId, ruleId);
  },

  /* For other submodules */
  exists: (ctx, ruleId) => lateFeeRuleRepository.exists(ctx.tenantId, [eq(lateFeeRules.id, ruleId)]),

  /* The rule that applies to a structure: its own, else the school's default, else none */
  forStructure: async (ctx, structure) => {
    if (!structure.chargesLateFee) return null;
    return lateFeeRuleRepository.findOne(
      ctx.tenantId,
      [structure.lateFeeRuleId ? eq(lateFeeRules.id, structure.lateFeeRuleId) : eq(lateFeeRules.isDefault, true)],
      { with: withSlabs }
    );
  },

  /* All tenants (daily job) -> resolve(tenantId, structure) -> rule or null */
  resolverForJob: async (ruleIds, tenantIds) => {
    const rules = await lateFeeRuleRepository.findForJob(ruleIds, tenantIds);
    const byId = new Map(rules.map(rule => [rule.id, rule]));
    const defaults = new Map(rules.filter(rule => rule.isDefault).map(rule => [rule.tenantId, rule]));
    return (tenantId, structure) => {
      if (!structure.chargesLateFee) return null;
      return structure.lateFeeRuleId ? (byId.get(structure.lateFeeRuleId) ?? null) : (defaults.get(tenantId) ?? null);
    };
  }
};
