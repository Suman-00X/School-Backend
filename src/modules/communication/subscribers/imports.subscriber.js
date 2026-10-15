import { subscribe } from "../../../common/events/events.js";
import { IMPORT_COMPLETED } from "../../administration/imports/index.js";
import { notificationService } from "../notifications/index.js";
import { messages } from "../shared/templates/messages.js";

/* The person who started an import hears when it finishes */
subscribe(
  IMPORT_COMPLETED,
  "communication.importCompleted",
  async ({ tenantId, importId, userId, succeeded, failed }) => {
    await notificationService.notify(
      { tenantId },
      {
        userIds: [userId],
        type: "IMPORT_COMPLETED",
        ...messages.importCompleted({ succeeded, failed }),
        data: { importId }
      }
    );
  }
);
