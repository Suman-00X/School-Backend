import { created, done, ok, paginated } from "../../../../common/http/responses.js";
import { circulationRuleService } from "../services/circulationRule.service.js";

export const circulationRuleController = {
  create: async (req, res) => {
    const rule = await circulationRuleService.create(req.context, req.body);
    return created(
      res,
      rule,
      `Circulation rule for ${rule.appliesTo} created: ${rule.loanDays} days, ${rule.maxLoans} at a time`
    );
  },

  list: async (req, res) =>
    paginated(
      res,
      await circulationRuleService.list(req.context, req.query),
      "Circulation rules retrieved successfully"
    ),

  getById: async (req, res) =>
    ok(
      res,
      await circulationRuleService.getById(req.context, req.params.ruleId),
      "Circulation rule retrieved successfully"
    ),

  update: async (req, res) => {
    const rule = await circulationRuleService.update(req.context, req.params.ruleId, req.body);
    return ok(res, rule, `Circulation rule for ${rule.appliesTo} updated`);
  },

  remove: async (req, res) => {
    const rule = await circulationRuleService.remove(req.context, req.params.ruleId);
    return done(res, `Circulation rule for ${rule.appliesTo} removed`);
  }
};
