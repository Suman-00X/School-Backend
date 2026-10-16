import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, post, person, tokenFor } from "../helpers/harness.js";

/* One administrator per non-academic module (D-51); suites 10–14 act as them */
const MANAGERS = [
  ["librarian", "LIBRARIAN"],
  ["transportManager", "TRANSPORT_MANAGER"],
  ["hostelManager", "HOSTEL_MANAGER"],
  ["hrManager", "HR_MANAGER"],
  ["inventoryManager", "INVENTORY_MANAGER"]
];

describe("module administrators", () => {
  it("creates an administrator account for each non-academic module", async () => {
    for (const [key, role] of MANAGERS) {
      const staff = await post("/api/v1/users/staff", { role, user: person(key) });
      assert.equal(staff.data.user.role, role);
      world[key] = staff.data;
      h.tokens[key] = tokenFor(staff.data.userId, role);
    }
    /* Only an administrator creates module administrators */
    await post("/api/v1/users/staff", { role: "LIBRARIAN", user: person("x2") }, { as: h.tokens.principal }, 403);
  });
});
