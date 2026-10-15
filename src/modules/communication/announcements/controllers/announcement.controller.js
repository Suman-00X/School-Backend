import { createCrudController } from "../../../../common/crud/crudController.js";
import { ok } from "../../../../common/http/responses.js";
import { announcementService } from "../services/announcement.service.js";

const crud = createCrudController(announcementService, {
  singular: "Announcement",
  plural: "Announcements",
  idParam: "announcementId"
});

export const announcementController = {
  ...crud,

  publish: async (req, res) => {
    const announcement = await announcementService.publish(req.context, req.params.announcementId, req.body);
    const scheduled = new Date(announcement.publishAt) > new Date(Date.now() + 1000);
    const message = scheduled
      ? `Announcement scheduled for ${new Date(announcement.publishAt).toISOString()}`
      : "Announcement is being sent";
    return ok(res, announcement, message);
  }
};
