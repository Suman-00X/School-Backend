import { created, done, ok } from "../../../../common/http/responses.js";
import { endSession, startSession } from "../../shared/utils/systemAdminSession.util.js";
import { systemAdminService } from "../services/systemAdmin.service.js";

const client = req => ({ ipAddress: req.ip, userAgent: req.get("user-agent") });

export const systemAdminController = {
  /* The session goes in the cookie only: the answer never carries the token */
  login: async (req, res) => {
    const admin = await systemAdminService.login(req.body, client(req));
    const expiresAt = startSession(res, admin);
    return created(res, { systemAdmin: admin, expiresAt }, `Signed in as ${admin.name}`);
  },

  me: async (req, res) => ok(res, req.systemAdmin, "Your system admin account"),

  logout: async (req, res) => {
    await systemAdminService.logout(req.systemAdmin);
    endSession(res);
    return done(res, "Signed out");
  }
};
