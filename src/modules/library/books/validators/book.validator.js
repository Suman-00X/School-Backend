import { z } from "../../../../common/validation/zod.js";
import { id, idParams, listQuery, optionalText, patchBody, text } from "../../../../common/validation/schemas.js";
import { booleanQuery, isbn } from "../../shared/utils/schemas.util.js";

const fields = z.object({
  title: text(300),
  subtitle: optionalText(300),
  authors: z.array(text(200)).max(20).default([]),
  /* Hyphens and spaces are accepted and removed; null clears it */
  isbn: isbn().nullable().optional(),
  publisher: optionalText(200),
  publishedYear: z
    .number()
    .int()
    .min(1000)
    .refine(year => year <= new Date().getFullYear() + 1, { message: "must not be in the future" })
    .optional(),
  edition: optionalText(50),
  language: optionalText(50),
  category: optionalText(100),
  subjectId: id().nullable().optional(),
  shelfLocation: optionalText(50),
  description: optionalText(2000)
});

const params = idParams("bookId");

export const bookValidators = {
  create: { body: fields },
  list: {
    query: listQuery({
      q: z.string().trim().min(1).max(100).optional(),
      category: z.string().trim().min(1).max(100).optional(),
      subjectId: id().optional(),
      available: booleanQuery()
    })
  },
  getById: { params },
  /* `authors` has a default; drop it so a PATCH never resets the authors */
  update: { params, body: patchBody(fields.extend({ authors: z.array(text(200)).max(20) })) },
  remove: { params }
};
