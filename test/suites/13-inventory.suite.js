import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, patch, del, count, settleJobs, uuid } from "../helpers/harness.js";

const I = "/api/v1/inventory";
const today = todayIn("Asia/Kolkata");

/* Low-stock events published by the module, captured by a test subscriber
   (events.js is imported lazily: it reads the environment the harness sets up) */
const lowStockEvents = [];
const captureLowStockEvents = async () => {
  const { subscribe } = await import("../../src/common/events/events.js");
  subscribe("inventory.item.lowStock", "test.inventory", async payload => {
    lowStockEvents.push(payload);
  });
};

const move = (itemId, body, as = h.tokens.inventoryManager) =>
  request("POST", `${I}/items/${itemId}/movements`, { body, as });

const stockOf = async itemId => (await get(`${I}/items/${itemId}`)).data;

describe("inventory: catalogue", () => {
  it("manages categories with case-insensitive unique names", async () => {
    world.stationery = (await post(`${I}/categories`, { name: "Stationery" }, { as: h.tokens.inventoryManager })).data;
    world.lab = (await post(`${I}/categories`, { name: "Lab supplies", description: "Chemicals and glassware" })).data;

    const duplicate = await request("POST", `${I}/categories`, { body: { name: " stationery " } });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.message, "A category named Stationery already exists");
    await patch(`${I}/categories/${world.lab.id}`, { name: "STATIONERY" }, {}, 409);

    const found = await get(`${I}/categories?q=stat`, { as: h.tokens.accountant });
    assert.deepEqual(
      found.data.map(c => c.name),
      ["Stationery"]
    );

    await post(`${I}/categories`, { name: "Sports" }, { as: h.tokens.accountant }, 403);
    await post(`${I}/categories`, { name: "Sports" }, { as: h.tokens.teacher }, 403);
    await get(`${I}/categories`, { as: h.tokens.teacher }, 403);
    await post(`${I}/categories`, { name: "" }, {}, 400);
  });

  it("manages vendors with GSTIN validation and search", async () => {
    const bad = await request("POST", `${I}/vendors`, { body: { name: "Bad Tax Co", taxId: "ABC123" } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.message, "Invalid request: taxId must be a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5)");
    assert.equal(bad.body.error.details[0].field, "taxId");

    const vendor = await post(
      `${I}/vendors`,
      {
        name: "Sharma Stationers",
        contactPerson: "Ravi Sharma",
        phone: "+91 98450 12345",
        email: "Orders@Sharma.example",
        taxId: "29abcde1234f1z5",
        address: "12 MG Road, Bengaluru"
      },
      { as: h.tokens.inventoryManager }
    );
    assert.equal(vendor.data.taxId, "29ABCDE1234F1Z5");
    assert.equal(vendor.data.email, "orders@sharma.example");
    world.vendor = vendor.data;
    world.labVendor = (await post(`${I}/vendors`, { name: "LabChem Supplies" })).data;

    const taken = await request("POST", `${I}/vendors`, { body: { name: "Copycat", taxId: "29ABCDE1234F1Z5" } });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.message, "Sharma Stationers is already registered with tax id 29ABCDE1234F1Z5");
    await post(`${I}/vendors`, { name: "No Mail", email: "not-an-email" }, {}, 400);

    const byContact = await get(`${I}/vendors?q=ravi`);
    assert.deepEqual(
      byContact.data.map(v => v.name),
      ["Sharma Stationers"]
    );
    assert.equal((await get(`${I}/vendors?q=${encodeURIComponent("%")}`)).meta.total, 0, "LIKE wildcards are literal");
    const renamed = await patch(`${I}/vendors/${world.labVendor.id}`, { notes: "Delivers on Mondays" });
    assert.equal(renamed.data.notes, "Delivers on Mondays");
    await post(`${I}/vendors`, { name: "X" }, { as: h.tokens.teacher }, 403);
  });

  it("creates items with normalised, unique SKUs", async () => {
    const marker = await post(
      `${I}/items`,
      {
        sku: " wbm-blue ",
        name: "Whiteboard marker",
        categoryId: world.stationery.id,
        unit: "PCS",
        reorderLevel: 5,
        location: "Store room, shelf B2"
      },
      { as: h.tokens.inventoryManager }
    );
    assert.equal(marker.data.sku, "WBM-BLUE");
    assert.deepEqual([marker.data.stockOnHand, marker.data.averageUnitCost, marker.data.stockValue], [0, 0, 0]);
    assert.equal(marker.data.category.name, "Stationery");
    world.marker = marker.data;

    const dup = await request("POST", `${I}/items`, {
      body: { sku: "Wbm-Blue", name: "Another marker", categoryId: world.stationery.id, unit: "PCS" }
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.message, "SKU WBM-BLUE is already used by Whiteboard marker");

    const item = (sku, name, categoryId, unit, reorderLevel) =>
      post(`${I}/items`, { sku, name, categoryId, unit, reorderLevel });
    world.glue = (await item("glu-01", "Glue stick", world.stationery.id, "PCS", 0)).data;
    world.paper = (await item("A4-80GSM", "A4 paper 80 gsm", world.stationery.id, "REAM", 2)).data;
    world.chalk = (await item("CHK-WHITE", "White chalk", world.stationery.id, "BOX", 10)).data;
    world.copper = (await item("CUSO4", "Copper sulphate", world.lab.id, "KG", 1)).data;

    /* Another school may use the same SKU */
    const otherCategory = await post(`${I}/categories`, { name: "Stationery" }, { as: h.tokens.otherAdmin });
    await post(
      `${I}/items`,
      { sku: "WBM-BLUE", name: "Marker", categoryId: otherCategory.data.id, unit: "PCS" },
      { as: h.tokens.otherAdmin }
    );
    await get(`${I}/items/${world.marker.id}`, { as: h.tokens.otherAdmin }, 404);
    await post(
      `${I}/items`,
      { sku: "X-1", name: "Cross-school", categoryId: world.stationery.id, unit: "PCS" },
      { as: h.tokens.otherAdmin },
      422
    );
  });

  it("rejects invalid items and never lets stock be written directly", async () => {
    const base = { sku: "BAD-1", name: "Bad", categoryId: world.stationery.id, unit: "PCS" };
    const missingCategory = await request("POST", `${I}/items`, { body: { ...base, categoryId: uuid() } });
    assert.equal(missingCategory.status, 422);
    assert.equal(missingCategory.body.message, "categoryId does not refer to an existing category");
    await post(`${I}/items`, { ...base, unit: "DOZEN" }, {}, 400);
    await post(`${I}/items`, { ...base, sku: "has space" }, {}, 400);
    await post(`${I}/items`, { ...base, reorderLevel: -1 }, {}, 400);
    const fractional = await request("POST", `${I}/items`, { body: { ...base, reorderLevel: 2.5 } });
    assert.equal(fractional.status, 422);
    assert.equal(fractional.body.message, "reorderLevel must be a whole number of PCS");

    const seeded = await request("POST", `${I}/items`, { body: { ...base, stockOnHand: 100 } });
    assert.equal(seeded.status, 400);
    assert.equal(seeded.body.error.details[0].field, "stockOnHand");

    const direct = await request("PATCH", `${I}/items/${world.marker.id}`, { body: { stockOnHand: 100 } });
    assert.equal(direct.status, 400);
    assert.equal(
      direct.body.message,
      "Invalid request: stockOnHand is maintained by stock movements and cannot be set directly"
    );
    await patch(`${I}/items/${world.marker.id}`, { name: "Marker", averageUnitCost: 1 }, {}, 400);
    assert.equal((await stockOf(world.marker.id)).stockOnHand, 0);

    const renamed = await patch(`${I}/items/${world.glue.id}`, { sku: "glu-stick", location: "Shelf A1" });
    assert.equal(renamed.data.sku, "GLU-STICK");
    assert.equal(renamed.data.reorderLevel, 0, "PATCH does not reset defaults");
    await patch(`${I}/items/${world.glue.id}`, { sku: "wbm-blue" }, {}, 409);
    await patch(`${I}/items/${world.marker.id}`, { name: "X" }, { as: h.tokens.accountant }, 403);

    /* Removing an item: only with nothing in stock */
    const temp = await post(`${I}/items`, { ...base, sku: "TEMP-1" });
    await del(`${I}/items/${temp.data.id}`);
    await get(`${I}/items/${temp.data.id}`, {}, 404);
    await post(`${I}/items`, { ...base, sku: "TEMP-1", name: "Reused SKU" }).then(r => del(`${I}/items/${r.data.id}`));

    const inUse = await request("DELETE", `${I}/categories/${world.lab.id}`);
    assert.equal(inUse.status, 422);
    assert.equal(inUse.body.message, "Lab supplies still has 1 item. Move or remove them first.");
  });
});

describe("inventory: stock movements", () => {
  it("receives stock and keeps an exact weighted average cost", async () => {
    await captureLowStockEvents();
    const first = await move(world.marker.id, {
      type: "RECEIPT",
      quantity: 10,
      unitCost: 12,
      vendorId: world.vendor.id,
      reference: "INV-4471"
    });
    assert.equal(first.status, 201);
    assert.match(
      first.body.message,
      /^Received 10 PCS of Whiteboard marker from Sharma Stationers\. 10 PCS in stock \(STK-0{5}1\)$/
    );
    assert.equal(first.body.data.quantityChange, 10);
    assert.equal(first.body.data.balanceAfter, 10);
    assert.equal(first.body.data.totalValue, 120);
    assert.equal(first.body.data.movementDate, today);
    assert.equal(first.body.data.creator.id, world.inventoryManager.userId);

    const second = await move(world.marker.id, {
      type: "RECEIPT",
      quantity: 5,
      unitCost: 13.5,
      vendorId: world.vendor.id
    });
    assert.equal(second.body.data.movementNumber, "STK-000002");
    assert.equal(second.body.data.averageCostAfter, 12.5);
    const marker = await stockOf(world.marker.id);
    assert.deepEqual([marker.stockOnHand, marker.averageUnitCost, marker.stockValue], [15, 12.5, 187.5]);

    /* (1 x 12.50 + 1 x 10.37) / 2 = 11.435 -> 11.44 (floating point would give 11.43) */
    await move(world.glue.id, { type: "RECEIPT", quantity: 1, unitCost: 12.5 });
    await move(world.glue.id, { type: "RECEIPT", quantity: 1, unitCost: 10.37 });
    assert.equal((await stockOf(world.glue.id)).averageUnitCost, 11.44);

    /* Fractional quantities for measured units */
    const copper = await move(world.copper.id, {
      type: "RECEIPT",
      quantity: 2.5,
      unitCost: 400,
      vendorId: world.labVendor.id
    });
    assert.equal(copper.body.data.totalValue, 1000);
    await move(world.paper.id, { type: "RECEIPT", quantity: 5, unitCost: 250, vendorId: world.vendor.id });
  });

  it("validates movements by type", async () => {
    const expect = async (body, status, message, as) => {
      const res = await move(world.marker.id, body, as);
      assert.equal(res.status, status, JSON.stringify(res.body));
      if (message) assert.equal(res.body.message, message);
    };
    await expect({ type: "RECEIPT", quantity: 1 }, 400, "Invalid request: unitCost is required for a RECEIPT");
    await expect({ type: "RECEIPT", quantity: 0, unitCost: 1 }, 400);
    await expect({ type: "RECEIPT", quantity: 1, unitCost: 1.234 }, 400);
    await expect({ type: "TRANSFER", quantity: 1 }, 400);
    await expect(
      { type: "RECEIPT", quantity: 2.5, unitCost: 1 },
      422,
      "Whiteboard marker is counted in PCS: the quantity must be a whole number"
    );
    await expect(
      { type: "RECEIPT", quantity: 1, unitCost: 1, vendorId: uuid() },
      422,
      "vendorId does not refer to an existing vendor"
    );
    await expect(
      { type: "ISSUE", quantity: 1 },
      400,
      "Invalid request: issuedTo is required for an ISSUE (send issuedToUserId or issuedTo)"
    );
    await expect({ type: "ISSUE", quantity: 1, issuedTo: "Lab", unitCost: 5 }, 400);
    await expect({ type: "ISSUE", quantity: 1, issuedTo: "Lab", vendorId: world.vendor.id }, 400);
    await expect(
      { type: "ISSUE", quantity: 1, issuedToUserId: uuid() },
      422,
      "issuedToUserId does not refer to an active user"
    );
    await expect(
      { type: "ISSUE", quantity: 1, issuedTo: "Lab", movementDate: addDays(today, 2) },
      422,
      `movementDate cannot be in the future (today is ${today})`
    );
    await expect({ type: "ISSUE", quantity: 1, issuedTo: "Lab" }, 403, undefined, h.tokens.teacher);
    await expect({ type: "ISSUE", quantity: 1, issuedTo: "Lab" }, 403, undefined, h.tokens.accountant);
    await post(`${I}/items/${uuid()}/movements`, { type: "RETURN", quantity: 1 }, {}, 404);

    /* Discontinued items take no new stock */
    await patch(`${I}/items/${world.glue.id}`, { discontinued: true });
    const discontinued = await move(world.glue.id, { type: "RECEIPT", quantity: 1, unitCost: 10 });
    assert.equal(discontinued.status, 422);
    assert.equal(discontinued.body.message, "Glue stick is discontinued and cannot receive new stock");
    await patch(`${I}/items/${world.glue.id}`, { discontinued: false });
    assert.equal((await stockOf(world.marker.id)).stockOnHand, 15, "nothing moved");
  });

  it("issues and returns stock at the average cost, never beyond what is on hand", async () => {
    const issued = await move(world.marker.id, { type: "ISSUE", quantity: 2, issuedTo: "Science lab" });
    assert.equal(issued.status, 201);
    assert.match(
      issued.body.message,
      /^Issued 2 PCS of Whiteboard marker to Science lab\. 13 PCS in stock \(STK-\d{6}\)$/
    );
    assert.deepEqual(
      [issued.body.data.quantityChange, issued.body.data.unitCost, issued.body.data.totalValue],
      [-2, 12.5, 25]
    );

    const tooMany = await move(world.marker.id, { type: "ISSUE", quantity: 20, issuedTo: "Sports day" });
    assert.equal(tooMany.status, 422);
    assert.equal(tooMany.body.message, "Only 13 PCS of Whiteboard marker in stock");

    const toTeacher = await move(world.marker.id, {
      type: "ISSUE",
      quantity: 3,
      issuedToUserId: world.teacher.userId,
      reference: "REQ-12"
    });
    assert.match(toTeacher.body.message, /^Issued 3 PCS of Whiteboard marker to Fteacher Lteacher\. 10 PCS in stock/);
    assert.equal(toTeacher.body.data.issuedToUser.id, world.teacher.userId);

    const returned = await move(world.marker.id, { type: "RETURN", quantity: 1, issuedToUserId: world.teacher.userId });
    assert.match(
      returned.body.message,
      /^Returned 1 PCS of Whiteboard marker from Fteacher Lteacher\. 11 PCS in stock/
    );
    assert.deepEqual([returned.body.data.unitCost, returned.body.data.averageCostAfter], [12.5, 12.5]);

    await move(world.copper.id, { type: "ISSUE", quantity: 0.75, issuedTo: "Chemistry lab" });
    assert.equal((await stockOf(world.copper.id)).stockOnHand, 1.75);

    const empty = await move(world.chalk.id, { type: "ISSUE", quantity: 1, issuedTo: "Class 1-A" });
    assert.equal(empty.body.message, "White chalk is out of stock");
  });

  it("lets only the store's administrators adjust stock, never below zero", async () => {
    const adjust = (body, as = h.tokens.admin) => move(world.marker.id, { type: "ADJUSTMENT", ...body }, as);

    assert.equal((await adjust({ quantityChange: -1, reason: "Damaged" }, h.tokens.accountant)).status, 403);
    const noReason = await adjust({ quantityChange: -1 });
    assert.equal(noReason.status, 400);
    assert.equal(noReason.body.message, "Invalid request: reason is required for an ADJUSTMENT");
    assert.equal((await adjust({ quantityChange: 0, reason: "Count" })).status, 400);
    assert.equal((await adjust({ quantity: 1, reason: "Count" })).status, 400);

    const belowZero = await adjust({ quantityChange: -12, reason: "Stock count" });
    assert.equal(belowZero.status, 422);
    assert.equal(
      belowZero.body.message,
      "The adjustment would take Whiteboard marker below zero: only 11 PCS in stock"
    );

    const damaged = await adjust({ quantityChange: -1, reason: "Dried out" });
    assert.equal(damaged.status, 201);
    assert.match(damaged.body.message, /^Adjusted Whiteboard marker by -1 PCS\. 10 PCS in stock/);
    assert.equal((await stockOf(world.marker.id)).stockOnHand, 10);
  });

  it("applies concurrent issues one at a time: exactly one of two over-committing issues wins", async () => {
    /* Hold the item's row while both requests start, so both are in flight at once.
       With the row lock they queue and the second sees the first's result; without it
       both would read 5 in stock and both would succeed. */
    const client = await h.pool.connect();
    let results;
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM inventory_items WHERE id = $1 FOR UPDATE", [world.paper.id]);
      const issue = () => move(world.paper.id, { type: "ISSUE", quantity: 3, issuedTo: "Exam cell" });
      const both = Promise.all([issue(), issue()]);
      const early = await Promise.race([
        both.then(() => "finished"),
        new Promise(resolve => setTimeout(() => resolve("waiting"), 300))
      ]);
      assert.equal(early, "waiting", "movements wait while another transaction holds the item");
      await client.query("ROLLBACK");
      results = await both;
    } finally {
      client.release();
    }
    assert.deepEqual(results.map(r => r.status).sort(), [201, 422]);
    assert.equal(results.find(r => r.status === 422).body.message, "Only 2 REAM of A4 paper 80 gsm in stock");

    const paper = await stockOf(world.paper.id);
    assert.equal(paper.stockOnHand, 2);
    assert.equal(paper.isLowStock, true);
    assert.equal((await get(`${I}/items/${world.paper.id}/movements`)).meta.total, 2);

    /* 5 -> 2 crossed the reorder level of 2: one event */
    await settleJobs();
    assert.equal(lowStockEvents.length, 1);
    assert.deepEqual(
      {
        tenantId: lowStockEvents[0].tenantId,
        itemId: lowStockEvents[0].itemId,
        stockOnHand: lowStockEvents[0].stockOnHand,
        reorderLevel: lowStockEvents[0].reorderLevel
      },
      { tenantId: h.tenant.id, itemId: world.paper.id, stockOnHand: 2, reorderLevel: 2 }
    );

    /* The office is told in-app */
    const inbox = await get("/api/v1/me/notifications?limit=50", { as: h.tokens.inventoryManager });
    const notice = inbox.data.find(n => n.title === "Low stock: A4 paper 80 gsm");
    assert.equal(notice?.body, "Only 2 REAM of A4 paper 80 gsm left (reorder level 2). Time to restock.");
  });

  it("keeps an immutable ledger with a running balance", async () => {
    const ledger = await get(`${I}/items/${world.marker.id}/movements`, { as: h.tokens.accountant });
    assert.deepEqual(
      ledger.data.map(m => [m.type, m.quantityChange, m.balanceAfter]),
      [
        ["ADJUSTMENT", -1, 10],
        ["RETURN", 1, 11],
        ["ISSUE", -3, 10],
        ["ISSUE", -2, 13],
        ["RECEIPT", 5, 15],
        ["RECEIPT", 10, 10]
      ]
    );
    /* Every row's balance = the previous balance + its change */
    const oldestFirst = [...ledger.data].reverse();
    oldestFirst.reduce((balance, m) => {
      assert.equal(balance + m.quantityChange, m.balanceAfter);
      return m.balanceAfter;
    }, 0);
    assert.equal(ledger.meta.total, 6);
    assert.equal((await get(`${I}/items/${world.marker.id}/movements?type=ISSUE`)).meta.total, 2);
    const page2 = await get(`${I}/items/${world.marker.id}/movements?limit=4&page=2`);
    assert.deepEqual(
      page2.data.map(m => m.balanceAfter),
      [15, 10]
    );

    const receipts = await get(`${I}/movements?type=RECEIPT&vendorId=${world.vendor.id}&from=2000-01-01&to=${today}`);
    assert.equal(receipts.meta.total, 3);
    assert.ok(receipts.data.every(m => m.vendor.name === "Sharma Stationers"));
    assert.equal((await get(`${I}/movements?from=2000-01-01&to=2000-12-31`)).meta.total, 0);
    await get(`${I}/movements?from=2026-05-01&to=2026-04-01`, {}, 400);
    await get(`${I}/items/${world.marker.id}/movements`, { as: h.tokens.teacher }, 403);
    await get(`${I}/items/${uuid()}/movements`, {}, 404);

    const one = await get(`${I}/movements/${ledger.data[0].id}`);
    assert.equal(one.data.reason, "Dried out");
    assert.equal((await request("PATCH", `${I}/movements/${one.data.id}`, { body: { reason: "x" } })).status, 404);
    assert.equal((await request("DELETE", `${I}/movements/${one.data.id}`)).status, 404);
    assert.equal(await count("stock_movements"), 12);

    const removeStocked = await request("DELETE", `${I}/items/${world.marker.id}`);
    assert.equal(removeStocked.status, 422);
    assert.equal(
      removeStocked.body.message,
      "Whiteboard marker still has 10 PCS in stock. Issue or adjust it to zero first."
    );
    const unitChange = await request("PATCH", `${I}/items/${world.marker.id}`, { body: { unit: "BOX" } });
    assert.equal(unitChange.status, 422);
  });
});

describe("inventory: reports", () => {
  it("lists low-stock items with their shortfall", async () => {
    const report = await get(`${I}/reports/low-stock`, { as: h.tokens.principal });
    assert.equal(report.message, "2 items are at or below the reorder level");
    assert.deepEqual(
      report.data.items.map(i => [i.sku, i.stockOnHand, i.reorderLevel, i.shortfall]),
      [
        ["CHK-WHITE", 0, 10, 10],
        ["A4-80GSM", 2, 2, 0]
      ]
    );
    assert.equal(report.data.items[1].lastVendor, "Sharma Stationers");
    assert.equal(report.data.items[1].lastUnitCost, 250);

    const filtered = await get(`${I}/items?lowStock=true`);
    assert.deepEqual(filtered.data.map(i => i.sku).sort(), ["A4-80GSM", "CHK-WHITE"]);
    assert.equal((await get(`${I}/items?lowStock=false`)).meta.total, 3);
    assert.deepEqual(
      (await get(`${I}/items?q=wbm`)).data.map(i => i.sku),
      ["WBM-BLUE"]
    );
    assert.deepEqual(
      (await get(`${I}/items?categoryId=${world.lab.id}`)).data.map(i => i.sku),
      ["CUSO4"]
    );

    const xlsx = await request("GET", `${I}/reports/low-stock?format=xlsx`);
    assert.equal(xlsx.status, 200);
    assert.equal(xlsx.buffer.subarray(0, 2).toString(), "PK");
  });

  it("values stock by category", async () => {
    const { data } = await get(`${I}/reports/valuation`, { as: h.tokens.accountant });
    /* Stationery: marker 10 x 12.50 + glue 2 x 11.44 + paper 2 x 250 + chalk 0; Lab: copper 1.75 x 400 */
    assert.deepEqual(
      data.categories.map(c => [c.categoryName, c.itemCount, c.itemsInStock, c.stockValue]),
      [
        ["Lab supplies", 1, 1, 700],
        ["Stationery", 4, 3, 647.88]
      ]
    );
    assert.equal(data.totalValue, 1347.88);
    assert.equal(data.currency, "INR");

    const csv = await request("GET", `${I}/reports/valuation?format=csv`);
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type"), /^text\/csv/);
    assert.match(csv.headers.get("content-disposition"), /stock-valuation-\d{4}-\d{2}-\d{2}\.csv/);
    const text = csv.buffer.toString();
    assert.ok(text.startsWith("\uFEFF"));
    assert.deepEqual(text.slice(1).trim().split("\r\n"), [
      "Category,Items,Items in stock,Stock value",
      "Lab supplies,1,1,700",
      "Stationery,4,3,647.88",
      "Total,5,,1347.88"
    ]);
  });

  it("reports consumption per item, net of returns", async () => {
    const { data } = await get(`${I}/reports/consumption?from=2000-01-01&to=${today}`, {
      as: h.tokens.inventoryManager
    });
    assert.deepEqual(
      data.items.map(i => [i.sku, i.issuedQuantity, i.issuedValue, i.returnedQuantity, i.netQuantity, i.netValue]),
      [
        ["A4-80GSM", 3, 750, 0, 3, 750],
        ["CUSO4", 0.75, 300, 0, 0.75, 300],
        ["WBM-BLUE", 5, 62.5, 1, 4, 50]
      ]
    );
    assert.deepEqual(data.totals, { issuedValue: 1112.5, returnedValue: 12.5, netValue: 1100 });

    const csv = (
      await request("GET", `${I}/reports/consumption?from=2000-01-01&to=${today}&format=csv`)
    ).buffer.toString();
    assert.match(
      csv,
      /^\uFEFFSKU,Item,Category,Unit,Issued,Issued value,Returned,Returned value,Net consumed,Net value\r\n/
    );
    assert.match(csv, /\r\nWBM-BLUE,Whiteboard marker,Stationery,PCS,5,62.5,1,12.5,4,50\r\n/);

    await get(`${I}/reports/consumption`, {}, 400);
    await get(`${I}/reports/consumption?from=2026-05-01&to=2026-04-01`, {}, 400);
    await get(`${I}/reports/consumption?from=2000-01-01&to=${today}&format=pdf`, {}, 400);
  });

  it("denies teachers every inventory report", async () => {
    for (const path of ["low-stock", "valuation", `consumption?from=2000-01-01&to=${today}`]) {
      await get(`${I}/reports/${path}`, { as: h.tokens.teacher }, 403);
    }
    await get(`${I}/items`, { as: h.tokens.teacher }, 403);
    await get(`${I}/reports/valuation`, { as: h.tokens.mother }, 403);
  });
});

describe("inventory: ledger integrity", () => {
  it("keeps the stock ledger append-only in the database", async () => {
    await assert.rejects(h.pool.query("UPDATE stock_movements SET quantity_change = 1000"), { code: "ZA409" });
    await assert.rejects(h.pool.query("DELETE FROM stock_movements"), { code: "ZA409" });
  });
});
