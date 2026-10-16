import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import { UNITS } from "../../shared/constants/inventory.constants.js";
import { booleanQuery, quantityValue, readOnly, searchText } from "../../shared/utils/schemas.util.js";

const MAINTAINED_BY_MOVEMENTS = "is maintained by stock movements and cannot be set directly";

const fields = z.object({
  /* Stored upper-case: "wbm-blue" -> "WBM-BLUE" */
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9._/-]{0,39}$/, "must be 1-40 letters, digits, ., _, / or -"),
  name: text(150),
  categoryId: id(),
  unit: z.enum(UNITS),
  reorderLevel: quantityValue().min(0).default(0),
  location: optionalText(100),
  description: optionalText(1000),
  discontinued: z.boolean().default(false)
});

const readOnlyFields = {
  stockOnHand: readOnly(MAINTAINED_BY_MOVEMENTS),
  averageUnitCost: readOnly(MAINTAINED_BY_MOVEMENTS)
};

const params = idParams("itemId");

export const itemValidators = {
  create: { body: fields.extend(readOnlyFields) },
  list: {
    query: listQuery({
      q: searchText(),
      categoryId: id().optional(),
      /* stockOnHand <= reorderLevel */
      lowStock: booleanQuery(),
      discontinued: booleanQuery()
    })
  },
  getById: { params },
  update: {
    params,
    /* No defaults on PATCH: only what is sent changes */
    body: patchBody(
      fields.extend({ reorderLevel: quantityValue().min(0), discontinued: z.boolean() }).extend(readOnlyFields)
    )
  },
  remove: { params }
};
