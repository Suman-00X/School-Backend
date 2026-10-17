import { definePermissions } from "../../../../common/auth/authorize.middleware.js";
import { ALL_ROLES, ROLE_GROUPS, ROLES } from "../../../../common/auth/roles.js";
import { ACCESS_MODULES } from "../../shared/constants/access.constants.js";

const OWNERS = [ROLES.ADMIN, ...ROLE_GROUPS.MODULE_MANAGERS];

/* Why someone without manageOwners is refused */
export const MANAGE_OWNERS_REFUSAL = "Only an administrator can make someone a module owner or change their ownership";

/* The access endpoints. Module owners reach them for their own modules only (the service
   narrows by MODULE_ACCESS_PERMISSIONS); owners by assignment hold read, manage and handOver too. */
export const ACCESS_PERMISSIONS = definePermissions("administration.access", {
  read: { roles: OWNERS, label: "View the permission catalogue, operator roles and assignments" },
  manage: { roles: OWNERS, label: "Manage operator roles and operators of owned modules" },
  /* Passing one person's operator access and duties in a module to another */
  handOver: { roles: OWNERS, label: "Hand over an operator's access and duties in owned modules" },
  /* Owners never hold it, not even through ownership (grants.service.js) */
  manageOwners: { roles: [ROLES.ADMIN], label: "Make staff members owners of a module" },
  /* Anyone's access in every module (others see the modules they own) */
  readAll: { roles: [ROLES.ADMIN], label: "View anyone's access in every module" },
  readOwn: { roles: ALL_ROLES, selfService: true, label: "View own access" }
});

/* "<module>.access.manage" per add-on module: managing that module's operator roles and
   operators. Held by ADMIN and the module's owners, never by an operator. */
export const MODULE_ACCESS_PERMISSIONS = Object.freeze(
  Object.fromEntries(
    Object.entries(ACCESS_MODULES).map(([module, { label, ownerRole }]) => [
      module,
      definePermissions(`${module}.access`, {
        manage: {
          roles: [ROLES.ADMIN, ownerRole],
          ownerOnly: true,
          label: `Manage ${label} operator roles and operators`
        }
      }).manage
    ])
  )
);

/* What an owner by assignment also holds, to reach the access endpoints */
export const OWNER_ACCESS_KEYS = [
  ACCESS_PERMISSIONS.read.key,
  ACCESS_PERMISSIONS.manage.key,
  ACCESS_PERMISSIONS.handOver.key
];
