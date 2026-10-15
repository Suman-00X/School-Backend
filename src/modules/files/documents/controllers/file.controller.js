import { created, done, ok, paginated } from "../../../../common/http/responses.js";
import { unprocessable } from "../../../../common/http/errors.js";
import { studentService } from "../../../users/students/index.js";
import { staffService } from "../../../users/staff/index.js";
import { fileService } from "../services/file.service.js";

/* The owner named in an upload must exist in this school */
const checkOwner = async (ctx, { ownerType, ownerId }) => {
  if (ownerType === "GENERAL") return ctx.tenantId;
  if (!ownerId) throw unprocessable("ownerId is required for student and staff files");
  const exists =
    ownerType === "STUDENT"
      ? await studentService.exists(ctx, ownerId)
      : (await staffService.findManyByIds(ctx, [ownerId])).length > 0;
  if (!exists) throw unprocessable(`ownerId does not refer to an existing ${ownerType.toLowerCase()} record`);
  return ownerId;
};

export const fileController = {
  upload: async (req, res) => {
    const ownerId = await checkOwner(req.context, req.body);
    const file = await fileService.store(req.context, req.file, { ...req.body, ownerId });
    return created(res, file, `${file.fileName} uploaded successfully`);
  },

  list: async (req, res) =>
    paginated(res, await fileService.list(req.context, req.query), "Files retrieved successfully"),

  getById: async (req, res) => {
    const { storageKey: _key, ...file } = await fileService.getById(req.context, req.params.fileId);
    return ok(res, file, "File retrieved successfully");
  },

  downloadUrl: async (req, res) =>
    ok(
      res,
      await fileService.downloadUrl(req.context, req.params.fileId),
      "Download link created (valid for 15 minutes)"
    ),

  remove: async (req, res) => {
    await fileService.remove(req.context, req.params.fileId);
    return done(res, "File deleted successfully");
  }
};
