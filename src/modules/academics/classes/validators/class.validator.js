import { z } from "../../../../common/validation/zod.js";
import { bulkBody, idParams, listQuery, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import { CLASS_LEVEL_KEYS } from "../../shared/constants/academic.constants.js";
import { LEVEL_NAMES, levelFromName } from "../utils/classLevel.util.js";

/* A class is one of the fixed levels: send `level` (NURSERY, LKG, UKG, GRADE_1 … GRADE_12).
   Older clients may send `className` instead ("Class 1", "grade 1", "LKG"…), which must
   name a level; classOrder is derived and ignored when sent. */
const levelOrName = {
  level: z.enum(CLASS_LEVEL_KEYS).optional(),
  className: z.string().trim().max(50).optional()
};

const toLevel = ({ className, ...body }, ctx) => {
  if (className === undefined) return body;
  const named = levelFromName(className);
  if (!named) {
    ctx.addIssue({ code: "custom", path: ["className"], message: `must be one of ${LEVEL_NAMES}` });
    return z.NEVER;
  }
  if (body.level && body.level !== named) {
    ctx.addIssue({ code: "custom", path: ["className"], message: `names a different level than ${body.level}` });
    return z.NEVER;
  }
  return { ...body, level: named };
};

const required = [body => body.level !== undefined, { path: ["level"], message: "is required" }];

const fields = z.object({ ...levelOrName, description: optionalText() });
const create = fields.transform(toLevel).refine(...required);

const params = idParams("classId");

export const classValidators = {
  create: { body: create },
  createMany: { body: bulkBody("classes", create, { unique: [{ field: "level", key: c => c.level }] }) },
  list: { query: listQuery() },
  getById: { params },
  update: { params, body: patchBody(fields).transform(toLevel) }
};
