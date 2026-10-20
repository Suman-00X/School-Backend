import { created, ok } from "../../../../common/http/responses.js";
import { schoolService } from "../services/school.service.js";

export const schoolController = {
  list: async (req, res) => ok(res, await schoolService.list(req.query), "Schools retrieved successfully"),

  codeAvailability: async (req, res) => {
    const result = await schoolService.codeAvailable(req.query.code);
    return ok(res, result, result.available ? `${result.code} is available` : `${result.code} is already taken`);
  },

  get: async (req, res) => ok(res, await schoolService.get(req.params.schoolId), "School retrieved successfully"),

  onboard: async (req, res) => {
    const result = await schoolService.onboard(req.operator, req.body);
    return created(
      res,
      result,
      result.invitation.emailed
        ? `${result.school.name} is ready. ${req.body.admin.email} has been emailed a link to set a password.`
        : `${result.school.name} is ready, but the invitation email could not be sent. Share the link instead.`
    );
  },

  setModules: async (req, res) =>
    ok(res, await schoolService.setModules(req.operator, req.params.schoolId, req.body), "Modules updated"),

  setStatus: async (req, res) => {
    const school = await schoolService.setStatus(req.operator, req.params.schoolId, req.body);
    return ok(res, school, school.status === "ACTIVE" ? `${school.name} is active` : `${school.name} is suspended`);
  },

  inviteAdmin: async (req, res) => {
    const invitation = await schoolService.inviteAdmin(req.operator, req.params.schoolId, req.params.userId);
    return created(
      res,
      invitation,
      invitation.emailed ? "A new invitation has been emailed" : "The email could not be sent. Share the link instead."
    );
  }
};
