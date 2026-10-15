import { createCrudController } from "../../../../common/crud/crudController.js";
import { done } from "../../../../common/http/responses.js";
import { accountService } from "../services/account.service.js";

const crud = createCrudController(accountService, { singular: "User", plural: "Users", idParam: "userId" });

export const accountController = {
  list: crud.list,
  getById: crud.getById,
  update: crud.update,

  deactivate: async (req, res) => {
    await accountService.deactivate(req.context, req.params.userId);
    return done(res, "User deactivated successfully");
  }
};
