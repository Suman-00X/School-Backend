import { z } from "./zod.js";

/* Building blocks shared by every module's validators */

export const id = () => z.uuid();

export const text = (max = 255) => z.string().trim().min(1).max(max);

export const optionalText = (max = 1000) => z.string().trim().max(max).optional();

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

/* Bulk bodies: { [key]: [item, ...] } */
export const bulkBody = (key, itemSchema, max = 200) => z.object({ [key]: z.array(itemSchema).min(1).max(max) });
