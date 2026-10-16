import { eq, ne } from "drizzle-orm";
import { ROLES } from "../../../../common/auth/roles.js";
import { conflict, notFound, unprocessable } from "../../../../common/http/errors.js";
import { classService } from "../../../academics/classes/index.js";
import { DEFAULT_RULES, ITEM_TYPE_LABELS } from "../../shared/constants/library.constants.js";
import { libraryCirculationRules as rules } from "../models/circulationRule.schema.js";
import { circulationRuleRepository } from "../repositories/circulationRule.repository.js";

const withClass = { class: { columns: { id: true, className: true } } };

/* Class beats role beats "anyone"; then a specific item type beats "any item" */
const specificity = rule => (rule.classId ? 4 : 0) + (rule.borrowerRole ? 2 : 0) + (rule.itemType ? 1 : 0);
const mostSpecific = candidates => candidates.toSorted((a, b) => specificity(b) - specificity(a))[0] ?? null;

/* "Class 1 students borrowing media", "teachers borrowing any item", "everyone borrowing books" */
const roleLabel = role => (role ? `${role.toLowerCase().replaceAll("_", " ")}s` : "everyone");
export const describeRule = (rule, className) =>
  `${className ? `${className} students` : roleLabel(rule.borrowerRole)} borrowing ${
    rule.itemType ? ITEM_TYPE_LABELS[rule.itemType] : "any item"
  }`;

const withLabel = rule => ({ ...rule, appliesTo: describeRule(rule, rule.class?.className) });

const describe = async (ctx, scope) => {
  const className = scope.classId ? (await classService.findById(ctx, scope.classId))?.className : null;
  return describeRule(scope, className);
};

const checkScope = async (ctx, scope, exceptId) => {
  if (scope.classId && scope.borrowerRole !== ROLES.STUDENT) {
    throw unprocessable("A rule for a class applies to students; set borrowerRole to STUDENT");
  }
  if (scope.classId && !(await classService.exists(ctx, scope.classId))) {
    throw unprocessable("classId does not refer to an existing class");
  }
  const existing = await circulationRuleRepository.findOne(
    ctx.tenantId,
    [...circulationRuleRepository.scopeConditions(scope), exceptId && ne(rules.id, exceptId)].filter(Boolean)
  );
  if (existing) throw conflict(`A circulation rule for ${await describe(ctx, scope)} already exists`);
};

export const circulationRuleService = {
  list: async (ctx, { page, limit, borrowerRole, classId, itemType }) => {
    const result = await circulationRuleRepository.list(ctx.tenantId, {
      page,
      limit,
      with: withClass,
      conditions: [
        borrowerRole && eq(rules.borrowerRole, borrowerRole),
        classId && eq(rules.classId, classId),
        itemType && eq(rules.itemType, itemType)
      ].filter(Boolean)
    });
    return { ...result, rows: result.rows.map(withLabel) };
  },

  getById: async (ctx, ruleId) => {
    const rule = await circulationRuleRepository.findById(ctx.tenantId, ruleId, { with: withClass });
    if (!rule) throw notFound("Circulation rule");
    return withLabel(rule);
  },

  create: async (ctx, data) => {
    await checkScope(ctx, data);
    const rule = await circulationRuleRepository.create(ctx.tenantId, data);
    return circulationRuleService.getById(ctx, rule.id);
  },

  update: async (ctx, ruleId, data) => {
    const existing = await circulationRuleService.getById(ctx, ruleId);
    const scope = { ...existing, ...data };
    if (["borrowerRole", "classId", "itemType"].some(key => key in data)) await checkScope(ctx, scope, ruleId);
    await circulationRuleRepository.update(ctx.tenantId, ruleId, data);
    return circulationRuleService.getById(ctx, ruleId);
  },

  /* Loans keep the terms they were issued on */
  remove: async (ctx, ruleId) => {
    const rule = await circulationRuleService.getById(ctx, ruleId);
    await circulationRuleRepository.softDelete(ctx.tenantId, ruleId);
    return rule;
  },

  /* For library/policy, when a school opens its library */
  seedDefaults: (ctx, { dbc }) =>
    circulationRuleRepository.createMany(
      ctx.tenantId,
      DEFAULT_RULES.map(rule => ({ ...rule })),
      { dbc }
    ),

  /* For circulation: the rule for this borrower and item type, plus the general
     rule (any item) whose loan limit caps all of the borrower's loans together.
     -> { rule, overall } (rule null when nothing covers them) */
  resolve: async (ctx, borrower, itemType, options) => {
    const covering = await circulationRuleRepository.findCovering(ctx.tenantId, borrower, itemType, options);
    const rule = mostSpecific(covering);
    const overall = rule?.itemType ? mostSpecific(covering.filter(r => !r.itemType)) : null;
    return { rule, overall };
  },

  describe
};
