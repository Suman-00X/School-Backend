import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, text } from "../../../../common/validation/schemas.js";
import { MOVEMENT_TYPES } from "../../shared/constants/inventory.constants.js";
import { moneyValue, positiveQuantity, quantityValue } from "../../shared/utils/schemas.util.js";

const article = type => (/^[AEIOU]/.test(type) ? `an ${type}` : `a ${type}`);

/* Which fields each movement type takes */
const checkShape = (m, ctx) => {
  const issue = (field, message) => ctx.addIssue({ code: "custom", path: [field], message });

  if (m.type === "ADJUSTMENT") {
    if (m.quantityChange === undefined) issue("quantityChange", "is required for an ADJUSTMENT");
    else if (m.quantityChange === 0) issue("quantityChange", "must not be zero");
    if (m.quantity !== undefined) issue("quantity", "is not used by an ADJUSTMENT (send a signed quantityChange)");
    if (!m.reason) issue("reason", "is required for an ADJUSTMENT");
  } else {
    if (m.quantity === undefined) issue("quantity", `is required for ${article(m.type)}`);
    if (m.quantityChange !== undefined) issue("quantityChange", "is only used by an ADJUSTMENT");
  }

  if (m.type === "RECEIPT") {
    if (m.unitCost === undefined) issue("unitCost", "is required for a RECEIPT");
  } else {
    if (m.unitCost !== undefined) issue("unitCost", "is only accepted on a RECEIPT (others use the average cost)");
    if (m.vendorId) issue("vendorId", "is only accepted on a RECEIPT");
  }

  if (m.type === "ISSUE" && !m.issuedToUserId && !m.issuedTo) {
    issue("issuedTo", "is required for an ISSUE (send issuedToUserId or issuedTo)");
  }
  if (!["ISSUE", "RETURN"].includes(m.type)) {
    if (m.issuedToUserId) issue("issuedToUserId", "is only used by an ISSUE or a RETURN");
    if (m.issuedTo) issue("issuedTo", "is only used by an ISSUE or a RETURN");
  }
};

const dateRange = {
  from: date().optional(),
  to: date().optional()
};
const ordered = q => !q.from || !q.to || q.to >= q.from;
const rangeRule = [ordered, { path: ["to"], message: "must be on or after from" }];

export const stockValidators = {
  record: {
    params: idParams("itemId"),
    body: z
      .object({
        type: z.enum(MOVEMENT_TYPES),
        /* RECEIPT, ISSUE, RETURN: always positive; the type decides the direction */
        quantity: positiveQuantity().optional(),
        /* ADJUSTMENT: signed, e.g. -2 for two damaged units */
        quantityChange: quantityValue().optional(),
        unitCost: moneyValue().optional(),
        vendorId: id().optional(),
        issuedToUserId: id().optional(),
        issuedTo: text(200).optional(),
        reason: text(500).optional(),
        reference: text(100).optional(),
        /* Defaults to today in the school's time zone */
        movementDate: date().optional()
      })
      .superRefine(checkShape)
  },
  itemLedger: {
    params: idParams("itemId"),
    query: listQuery({ type: z.enum(MOVEMENT_TYPES).optional(), ...dateRange }).refine(...rangeRule)
  },
  list: {
    query: listQuery({
      type: z.enum(MOVEMENT_TYPES).optional(),
      itemId: id().optional(),
      vendorId: id().optional(),
      issuedToUserId: id().optional(),
      ...dateRange
    }).refine(...rangeRule)
  },
  getById: { params: idParams("movementId") }
};
