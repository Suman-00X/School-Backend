import { listModules } from "../../../../common/auth/catalogue.js";
import { z } from "../../../../common/validation/zod.js";
import { date, id, idParams, listQuery, name, optionalText, patchBody } from "../../../../common/validation/schemas.js";
import {
  ACCESS_MODULE_KEYS,
  ASSIGNMENT_KINDS,
  ASSIGNMENT_STATUSES,
  MAX_ROLE_PERMISSIONS
} from "../../shared/constants/access.constants.js";

/* Any module in the catalogue (read when the request arrives: every module has registered by then) */
const catalogueModule = () =>
  z
    .string()
    .refine(module => listModules().includes(module), { error: () => `must be one of: ${listModules().join(", ")}` });

const accessModule = () => z.enum(ACCESS_MODULE_KEYS);

const flag = () =>
  z
    .enum(["true", "false"])
    .transform(value => value === "true")
    .optional();

const permissionKey = () =>
  z.string().regex(/^[a-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*){2,}$/, "must be a permission key");

const roleFields = z.object({
  module: accessModule(),
  name: name(100),
  description: optionalText(500),
  permissions: z.array(permissionKey()).min(1).max(MAX_ROLE_PERMISSIONS)
});

const ordered = [
  body => !body.validFrom || !body.validTo || body.validTo >= body.validFrom,
  { message: "cannot be before validFrom", path: ["validTo"] }
];

const roleParams = idParams("operatorRoleId");
const assignmentParams = idParams("assignmentId");

export const accessValidators = {
  catalogue: { query: z.object({ module: catalogueModule().optional(), grantable: flag() }) },

  operatorRoles: {
    list: { query: listQuery({ module: accessModule().optional(), search: z.string().trim().max(100).optional() }) },
    getById: { params: roleParams },
    create: { body: roleFields },
    /* The module of a role never changes */
    update: { params: roleParams, body: patchBody(roleFields.omit({ module: true })) },
    remove: { params: roleParams }
  },

  assignments: {
    list: {
      query: listQuery({
        module: accessModule().optional(),
        kind: z.enum(ASSIGNMENT_KINDS).optional(),
        userId: id().optional(),
        operatorRoleId: id().optional(),
        status: z.enum(ASSIGNMENT_STATUSES).optional()
      })
    },
    getById: { params: assignmentParams },
    /* OPERATOR (default): operatorRoleId. OWNER: module. Dates are inclusive; omit for no limit. */
    create: {
      body: z
        .object({
          kind: z.enum(ASSIGNMENT_KINDS).default("OPERATOR"),
          operatorRoleId: id().optional(),
          module: accessModule().optional(),
          userId: id(),
          validFrom: date().optional(),
          validTo: date().optional(),
          note: optionalText(500)
        })
        .refine(body => body.kind !== "OPERATOR" || body.operatorRoleId, {
          message: "is required for an OPERATOR assignment",
          path: ["operatorRoleId"]
        })
        .refine(body => body.kind !== "OPERATOR" || !body.module, {
          message: "comes from the operator role; leave it out",
          path: ["module"]
        })
        .refine(body => body.kind !== "OWNER" || body.module, {
          message: "is required for an OWNER assignment",
          path: ["module"]
        })
        .refine(body => body.kind !== "OWNER" || !body.operatorRoleId, {
          message: "is only for OPERATOR assignments",
          path: ["operatorRoleId"]
        })
        .refine(...ordered)
    },
    /* null: from the start / no end date */
    update: {
      params: assignmentParams,
      body: patchBody(
        z.object({ validFrom: date().nullable(), validTo: date().nullable(), note: optionalText(500).nullable() })
      ).refine(...ordered)
    },
    revoke: { params: assignmentParams }
  },

  /* includeOwnership: also hand over fromUser's ownership of the module (ADMIN only) */
  handovers: {
    create: {
      body: z
        .object({
          module: accessModule(),
          fromUserId: id(),
          toUserId: id(),
          note: optionalText(500),
          includeOwnership: z.boolean().default(false)
        })
        .refine(body => body.fromUserId !== body.toUserId, {
          message: "must be someone other than fromUserId; a handover passes work to another person",
          path: ["toUserId"]
        })
    }
  },

  userAccess: { params: idParams("userId"), query: z.object({ module: catalogueModule().optional() }) },
  myAccess: { query: z.object({ module: catalogueModule().optional() }) }
};
