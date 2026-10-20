import { ok } from "../../../../common/http/responses.js";
import { catalogueService } from "../services/catalogue.service.js";

export const catalogueController = {
  list: async (req, res) => ok(res, catalogueService.list(), "Modules retrieved successfully")
};
