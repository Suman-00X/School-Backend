import { z } from "../../../../common/validation/zod.js";
import { idParams, listQuery, name, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import { searchText } from "../../shared/utils/schemas.util.js";

const fields = z.object({
  name: name(100),
  description: optionalText(500)
});

const params = idParams("categoryId");

export const categoryValidators = {
  create: { body: fields },
  list: { query: listQuery({ q: searchText() }) },
  getById: { params },
  update: { params, body: patchBody(fields) },
  remove: { params }
};
