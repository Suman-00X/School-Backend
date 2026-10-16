import { subscribe } from "../../../common/events/events.js";
import { claimOnce } from "../../../common/jobs/claims.js";
import { itemService } from "../../inventory/items/index.js";
import { INVENTORY_EVENTS } from "../../inventory/shared/constants/inventory.constants.js";
import { notificationService } from "../notifications/index.js";
import { recipients } from "../shared/services/recipients.service.js";
import { messages } from "../shared/templates/messages.js";

/* Who restocks: administrators and the store's administrator (in-app) */
const RESTOCKERS = ["ADMIN", "INVENTORY_MANAGER"];

/* An item fell to its reorder level -> tell the people who restock it, once per movement */
subscribe(INVENTORY_EVENTS.LOW_STOCK, "communication.lowStock", async ({ tenantId, itemId, movementId }) => {
  const ctx = { tenantId, role: "SYSTEM" };
  const item = await itemService.getById(ctx, itemId).catch(error => {
    if (error.status === 404) return null;
    throw error;
  });
  if (!item || !(await claimOnce(`lowStock:${movementId}`))) return;
  await notificationService.notify(ctx, {
    userIds: await recipients.forAudience(ctx, { roles: RESTOCKERS }),
    type: "MESSAGE",
    ...messages.lowStock({
      itemName: item.name,
      stockOnHand: item.stockOnHand,
      reorderLevel: item.reorderLevel,
      unit: item.unit
    }),
    data: { itemId, movementId }
  });
});
