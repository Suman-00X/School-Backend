import { createCrudController } from "../../../../common/crud/crudController.js";
import { created, done, paginated } from "../../../../common/http/responses.js";
import { concessionService } from "../services/concession.service.js";

const crud = createCrudController(concessionService, {
  singular: "Concession",
  plural: "Concessions",
  idParam: "concessionId"
});

export const concessionController = {
  ...crud,

  grant: async (req, res) =>
    created(res, await concessionService.grant(req.context, req.body), "Concession granted successfully"),

  listGrants: async (req, res) =>
    paginated(
      res,
      await concessionService.listGrants(req.context, req.query),
      "Concession grants retrieved successfully"
    ),

  revoke: async (req, res) => {
    await concessionService.revoke(req.context, req.params.grantId);
    return done(res, "Concession revoked successfully");
  }
};
