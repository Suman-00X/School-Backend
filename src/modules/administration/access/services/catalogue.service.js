import { listPermissions, titleOf } from "../../../../common/auth/catalogue.js";
import { ACCESS_MODULES } from "../../shared/constants/access.constants.js";
import { operatorGrantable } from "./grants.service.js";

export const moduleLabel = module => ACCESS_MODULES[module]?.label ?? titleOf(module);

export const describePermission = entry => ({
  key: entry.key,
  resource: entry.resource,
  action: entry.action,
  label: entry.label,
  roles: entry.roles,
  ownerOnly: entry.ownerOnly,
  selfService: entry.selfService,
  /* May be put in an operator role */
  grantable: operatorGrantable(entry, entry.module)
});

/* Entries grouped by module, then resource (in declaration order) */
export const groupByModule = (entries, describe = describePermission) => {
  const modules = new Map();
  for (const entry of entries) {
    if (!modules.has(entry.module)) modules.set(entry.module, new Map());
    const resources = modules.get(entry.module);
    if (!resources.has(entry.resource)) resources.set(entry.resource, []);
    resources.get(entry.resource).push(describe(entry));
  }
  return [...modules.keys()].sort().map(module => ({
    module,
    label: moduleLabel(module),
    /* Has owners and operator roles */
    operatorRoles: Boolean(ACCESS_MODULES[module]),
    ownerRole: ACCESS_MODULES[module]?.ownerRole ?? null,
    resources: [...modules.get(module)].map(([resource, permissions]) => ({
      resource,
      label: titleOf(resource),
      permissions
    }))
  }));
};

export const catalogueService = {
  /* The permission catalogue for role editors: ?module=, ?grantable=true (what an operator role may hold) */
  list: (ctx, { module, grantable } = {}) => {
    const entries = listPermissions().filter(
      entry =>
        (!module || entry.module === module) &&
        (grantable === undefined || operatorGrantable(entry, entry.module) === grantable)
    );
    return { total: entries.length, modules: groupByModule(entries) };
  }
};
