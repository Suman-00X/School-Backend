/* Enum values used by the inventory module's tables and validators (single source) */
export const UNITS = ["PCS", "BOX", "PACK", "KG", "G", "LITRE", "ML", "METRE", "SET", "REAM"];

/* Units counted in whole numbers (no 2.5 PCS) */
export const COUNTABLE_UNITS = ["PCS", "BOX", "PACK", "SET", "REAM"];

export const MOVEMENT_TYPES = ["RECEIPT", "ISSUE", "RETURN", "ADJUSTMENT"];

/* Largest values the numeric(12,3) quantity and numeric(12,2) money columns hold */
export const MAX_QUANTITY = 999_999_999.999;
export const MAX_MONEY = 9_999_999_999.99;

/* Domain events published by the inventory module */
export const INVENTORY_EVENTS = Object.freeze({
  /* An ISSUE or a negative ADJUSTMENT took an item from above its reorder level to at/below it.
     Payload: { tenantId, itemId, movementId, stockOnHand, reorderLevel } */
  LOW_STOCK: "inventory.item.lowStock"
});
