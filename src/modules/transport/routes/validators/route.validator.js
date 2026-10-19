import { z } from "../../../../common/validation/zod.js";
import { code, id, idParams, listQuery, name, optionalText, patchBody } from "../../../../common/validation/schemas.js";

const time = () => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "must be a time like 07:30");

const routeCode = () => code(/^[A-Z0-9_-]{1,20}$/, "must be 1-20 letters, digits, - or _");

/* `id` keeps an existing stop (and its assignments); stops without one are new */
const stop = z.object({
  id: id().optional(),
  name: name(100),
  /* Omit on every stop to number them in the order sent */
  sequence: z.number().int().positive().max(500).optional(),
  pickupTime: time().optional(),
  dropTime: time().optional(),
  landmark: optionalText(200),
  monthlyFee: z.number().min(0).max(1_000_000).multipleOf(0.01).default(0)
});

const unique = (list, key) => {
  const values = list.map(key).filter(value => value !== undefined);
  return new Set(values).size === values.length;
};

/* The full, ordered list of a route's stops */
const stops = z
  .array(stop)
  .min(1)
  .max(100)
  .refine(list => list.every(s => s.sequence === undefined) || list.every(s => s.sequence !== undefined), {
    message: "must give a sequence on every stop or on none"
  })
  .refine(list => unique(list, s => s.sequence), { message: "must not repeat a sequence" })
  .refine(list => unique(list, s => s.name.toLowerCase()), { message: "must not repeat a stop name" })
  .refine(list => unique(list, s => s.id), { message: "must not repeat a stop id" });

const fields = {
  name: name(100),
  code: routeCode(),
  vehicleId: id().nullable(),
  description: optionalText(),
  stops
};

const params = idParams("routeId");

export const routeValidators = {
  create: {
    body: z.object({
      ...fields,
      /* Generated (RT-001) when omitted */
      code: routeCode().optional(),
      vehicleId: id().nullable().optional(),
      stops: stops.refine(list => list.every(s => !s.id), { message: "must not include ids when creating a route" })
    })
  },
  list: { query: listQuery({ vehicleId: id().optional() }) },
  getById: { params },
  update: { params, body: patchBody(z.object(fields)) },
  remove: { params }
};
