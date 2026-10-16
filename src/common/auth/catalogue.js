/* The permission catalogue: every permission declared with definePermissions(), by key.
   Role editors are built from it, and grants are checked against it.
   A key is "<module>.<resource>.<action>"; the resource may itself contain dots. */

const entries = new Map();

/* "resourceAssignments" -> "resource assignments" */
const words = name =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\./g, " ")
    .toLowerCase();

const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);

const VERBS = { read: "View", readOwn: "View own", manage: "Manage" };

/* "transport.routes" + "read" -> "View routes" (modules override it with a label of their own) */
export const defaultLabel = (resource, action) => `${VERBS[action] ?? capitalize(words(action))} ${words(resource)}`;

/* "staffAttendance" -> "Staff attendance" */
export const titleOf = name => capitalize(words(name));

export const registerPermission = entry => {
  if (entries.has(entry.key)) throw new Error(`Permission ${entry.key} is declared twice`);
  entries.set(entry.key, entry);
};

/* -> the entry, or undefined */
export const findPermission = key => entries.get(key);

export const listPermissions = () => [...entries.values()];

export const listModules = () => [...new Set(listPermissions().map(entry => entry.module))].sort();
