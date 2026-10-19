import { z } from "./zod.js";

/* Building blocks shared by every module's validators */

export const id = () => z.uuid();

export const text = (max = 255) => z.string().trim().min(1).max(max);

export const optionalText = (max = 1000) => z.string().trim().max(max).optional();

/* The name of a record people pick from a list ("Class 1", "Tuition", "Boys Hostel"):
   trimmed, inner runs of spaces collapsed to one. Pair it with a unique index on
   lower(column) so names that differ only in case or spacing cannot both exist. */
export const name = (max = 100) =>
  z
    .string()
    .trim()
    .overwrite(value => value.replace(/\s+/g, " "))
    .min(1)
    .max(max);

/* A short identifier ("MA01", "TUITION", "RT-01"): trimmed and upper-cased, then checked
   against `pattern` (by default 2-20 letters, digits, - or _, starting with a letter or digit) */
export const code = (
  pattern = /^[A-Z0-9][A-Z0-9_-]{1,19}$/,
  message = "must be 2-20 letters, digits, - or _, starting with a letter or digit"
) => z.string().trim().toUpperCase().regex(pattern, message);

export const email = () => z.string().trim().toLowerCase().pipe(z.email());

export const phone = () =>
  z
    .string()
    .trim()
    .regex(/^[+0-9 ()-]{5,20}$/, "must be a valid phone number");

/* "2026-06-01" */
export const date = () => z.iso.date();

export const positiveInt = () => z.coerce.number().int().positive();

export const nonNegativeInt = () => z.coerce.number().int().min(0);

/* Path params: idParams("classId") -> { classId: uuid } */
export const idParams = (...names) => z.object(Object.fromEntries(names.map(name => [name, id()])));

/* ?page=&limit= on every list endpoint */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

/* List query with extra filters */
export const listQuery = (filters = {}) => paginationQuery.extend(filters);

/* PATCH bodies: all fields optional, but at least one must be sent */
export const patchBody = schema =>
  schema.partial().refine(body => Object.keys(body).length > 0, {
    message: "must include at least one field to update"
  });

/* Bulk bodies: { [key]: [item, ...] }. `unique`: items that must not repeat within the
   request, e.g. [{ field: "sectionName", key: s => `${s.classId}|${s.sectionName}` }];
   a repeat is reported on that item's field ("sections.1.sectionName repeats sections.0"). */
export const bulkBody = (key, itemSchema, { max = 200, unique = [] } = {}) =>
  z.object({
    [key]: z
      .array(itemSchema)
      .min(1)
      .max(max)
      .superRefine((items, ctx) => {
        for (const rule of unique) {
          const seen = new Map();
          items.forEach((item, index) => {
            const value = rule.key(item);
            if (value === undefined || value === null) return;
            if (seen.has(value)) {
              ctx.addIssue({
                code: "custom",
                path: [index, rule.field],
                message: `repeats ${key}.${seen.get(value)} in this request`
              });
            } else seen.set(value, index);
          });
        }
      })
  });
