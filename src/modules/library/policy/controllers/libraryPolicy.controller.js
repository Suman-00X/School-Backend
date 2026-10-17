import { ok } from "../../../../common/http/responses.js";
import { libraryPolicyService } from "../services/libraryPolicy.service.js";

/* What the school still has to decide itself (D-65: the fine limit is the school's own) */
const withSetup = policy => ({
  ...policy,
  setupNeeded: policy.blockOnFines && policy.fineBlockThreshold === null ? ["fineBlockThreshold"] : []
});

const note = policy =>
  policy.setupNeeded.length
    ? ". Set fineBlockThreshold: until the school sets its own limit, fines do not block borrowing"
    : "";

export const libraryPolicyController = {
  get: async (req, res) => {
    const policy = withSetup(await libraryPolicyService.get(req.context));
    return ok(res, policy, `Library policy retrieved successfully${note(policy)}`);
  },

  update: async (req, res) => {
    const policy = withSetup(await libraryPolicyService.update(req.context, req.body));
    return ok(res, policy, `Library policy updated successfully${note(policy)}`);
  }
};
