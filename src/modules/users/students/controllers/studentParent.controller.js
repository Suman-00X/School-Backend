import { created, done, paginated } from "../../../../common/http/responses.js";
import { studentParentService } from "../services/studentParent.service.js";

export const studentParentController = {
  list: async (req, res) =>
    paginated(res, await studentParentService.list(req.context, req.params.studentId, req.query), "Parents retrieved successfully"),

  link: async (req, res) =>
    created(res, await studentParentService.link(req.context, req.params.studentId, req.body), "Parent linked to student successfully"),

  unlink: async (req, res) => {
    await studentParentService.unlink(req.context, req.params.studentId, req.params.parentId);
    return done(res, "Parent unlinked from student successfully");
  }
};
