import { created, ok } from "../../../../common/http/responses.js";
import { substitutionService } from "../services/substitution.service.js";

/* "Period 3 of Class 6-A on 2026-10-21" */
const which = item => `${item.period.name} of ${item.section.name} on ${item.date}`;

const PLANNED = {
  SUBSTITUTE: item => `${item.plan.substitute.name} substitutes`,
  ACTIVITY: item => `${item.plan.activity}${item.plan.substitute ? ` with ${item.plan.substitute.name}` : ""}`,
  LEISURE: () => "Leisure",
  NOT_NEEDED: item => `${item.absentTeacher.name} takes it`
};

export const substitutionController = {
  plan: async (req, res) =>
    ok(res, await substitutionService.plan(req.context, req.query), "Substitution plan retrieved successfully"),

  summary: async (req, res) =>
    ok(res, await substitutionService.summary(req.context), "Substitution summary retrieved successfully"),

  candidates: async (req, res) =>
    ok(res, await substitutionService.candidates(req.context, req.query), "Substitute teachers retrieved successfully"),

  /* 201 for a newly planned lesson, 200 when its plan was changed */
  assign: async (req, res) => {
    const { created: isNew, item } = await substitutionService.assign(req.context, req.body);
    const message = `${PLANNED[item.plan.kind](item)}: ${which({ ...item, date: req.body.date })}`;
    return isNew ? created(res, item, message) : ok(res, item, `${message} (plan changed)`);
  },

  cancel: async (req, res) => {
    const plan = await substitutionService.cancel(req.context, req.params.substitutionId);
    return ok(res, plan, `Plan cancelled: ${which(plan)} needs cover again`);
  },

  mine: async (req, res) =>
    ok(res, await substitutionService.mine(req.context, req.query), "Substitution duties retrieved successfully")
};
