import { createMongoRepository } from "../../../../common/database/mongoRepository.js";
import { Announcement } from "../models/announcement.model.js";

export const announcementRepository = createMongoRepository(Announcement);
