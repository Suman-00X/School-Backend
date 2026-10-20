import { created, ok } from "../../../../common/http/responses.js";
import { operatorService } from "../services/operator.service.js";

const client = req => ({ ipAddress: req.ip, userAgent: req.get("user-agent") });

export const operatorController = {
  login: async (req, res) => {
    const result = await operatorService.login(req.body, client(req));
    return created(res, result, `Signed in as ${result.operator.name}`);
  },

  me: async (req, res) => ok(res, operatorService.me(req.operator), "Your operator account")
};
