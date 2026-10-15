import { createMongoRepository } from "../../../../common/database/mongoRepository.js";
import { Notification } from "../models/notification.model.js";

export const notificationRepository = {
  ...createMongoRepository(Notification),

  insertMany: async (tenantId, docs) =>
    (
      await Notification.insertMany(
        docs.map(doc => ({ ...doc, tenantId })),
        { ordered: false }
      )
    ).map(d => String(d._id)),

  setDelivery: (notificationId, channel, changes) =>
    Notification.updateOne(
      { _id: notificationId, "deliveries.channel": channel },
      { $set: Object.fromEntries(Object.entries(changes).map(([key, value]) => [`deliveries.$.${key}`, value])) }
    )
};
