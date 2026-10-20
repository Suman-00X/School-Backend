import { conflict, unprocessable } from "../../../../common/http/errors.js";
import { NEP_STAGES, stageOfLevel } from "../constants/nep.constants.js";
import { nepPolicyRepository } from "../repositories/nepPolicy.repository.js";

const stageLabel = key => NEP_STAGES.find(s => s.stage === key)?.label ?? key;

const view = policy => ({
  holisticProgressCard: policy.holisticProgressCard,
  hpcStages: policy.hpcStages,
  udiseExport: policy.udiseExport,
  apaarExport: policy.apaarExport,
  udiseCode: policy.udiseCode ?? null,
  /* What each stage covers, for the form */
  stages: NEP_STAGES.map(({ stage, label, classes }) => ({ stage, label, classes })),
  updatedAt: policy.updatedAt
});

const EXPORTS = {
  udise: { flag: "udiseExport", name: "the UDISE+ export" },
  apaar: { flag: "apaarExport", name: "the APAAR export" }
};

/* NEP 2020 options the school opts into: the Holistic Progress Card (exams and results)
   and the UDISE+ / APAAR exports (reports). Other submodules ask it before doing anything. */
export const nepPolicyService = {
  get: async ctx => view(await nepPolicyRepository.ensure(ctx.tenantId)),

  update: async (ctx, changes) => {
    const policy = await nepPolicyRepository.ensure(ctx.tenantId);
    const next = { ...policy, ...changes };
    if (next.udiseExport && !next.udiseCode)
      throw unprocessable("Enter the school's 11-digit UDISE code before switching on the UDISE+ export");
    if (next.holisticProgressCard && !next.hpcStages.length)
      throw unprocessable("Pick at least one stage for the Holistic Progress Card");
    await nepPolicyRepository.update(ctx.tenantId, policy.id, {
      ...changes,
      /* Stages in school order, once each */
      ...(changes.hpcStages && {
        hpcStages: NEP_STAGES.map(s => s.stage).filter(stage => changes.hpcStages.includes(stage))
      })
    });
    return nepPolicyService.get(ctx);
  },

  /* For other submodules */

  /* The card's stage for a class, or 409 when the school has not opted in for it */
  assertHolisticProgress: async (ctx, schoolClass) => {
    const policy = await nepPolicyRepository.ensure(ctx.tenantId);
    if (!policy.holisticProgressCard)
      throw conflict("The school has not opted for the Holistic Progress Card (NEP policy)");
    const stage = stageOfLevel(schoolClass?.level);
    if (!stage)
      throw conflict(
        `${schoolClass?.className ?? "This class"} has no grade level, so its NEP stage (and Holistic Progress Card) is not known`
      );
    if (!policy.hpcStages.includes(stage.stage))
      throw conflict(
        `The Holistic Progress Card is not used for ${schoolClass.className}: the NEP policy has it for ${policy.hpcStages.map(stageLabel).join(", ")}`
      );
    return { policy, stage };
  },

  /* kind: udise | apaar. 409 unless the school has switched that export on. */
  assertExport: async (ctx, kind) => {
    const policy = await nepPolicyRepository.ensure(ctx.tenantId);
    if (!policy[EXPORTS[kind].flag]) throw conflict(`The school has not opted for ${EXPORTS[kind].name} (NEP policy)`);
    return policy;
  },

  find: ctx => nepPolicyRepository.ensure(ctx.tenantId)
};
