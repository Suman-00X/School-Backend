import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { todayIn } from "../../src/common/utils/date.util.js";
import { annualFees, lateFeeFor, splitByShares } from "../../src/modules/finance/shared/utils/invoiceMath.util.js";
import { h, world, request, call, get, post, patch, del, person, settleJobs, tokenFor } from "../helpers/harness.js";
import { pdfText } from "../helpers/pdf.js";

/* Installment plans (D-17), concessions (D-18), late-fee slabs and waivers (D-19),
   each school's own Razorpay keys (D-20), partial online payments and overpayment (D-21).
   Runs on its own Class 3 so the counts of earlier suites stay as they are. */

const F = "/api/v1/finance";
const ME = "/api/v1/me";
const A = "/api/v1/academics";
const t = {};

const asAccountant = () => ({ as: h.tokens.accountant });
const webhookUrl = tenantId => `/api/v1/public/payments/razorpay/${tenantId}/webhook`;
const sign = (secret, data) => h.modules.gateway.gatewaySignature(secret, data);
const capturedBody = (orderId, paymentId, amountMinor) =>
  JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: amountMinor } } }
  });

/* A student's live invoices this year, earliest due first */
const live = async studentId =>
  (await get(`${F}/students/${studentId}/statement`)).data.invoices
    .filter(i => i.status !== "CANCELLED")
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.invoiceNumber.localeCompare(b.invoiceNumber));

/* Hold a row lock from another connection, fire the requests, check they all wait, release */
const whileLocked = async (lockSql, params, requests) => {
  const holder = await h.pool.connect();
  try {
    await holder.query("BEGIN");
    await holder.query(lockSql, params);
    let finished = 0;
    const pending = requests.map(fire => fire().finally(() => finished++));
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(finished, 0, "every request waits for the row lock");
    await holder.query("COMMIT");
    return await Promise.all(pending);
  } finally {
    holder.release();
  }
};

describe("finance arithmetic (unit)", () => {
  it("splits by share with the last installment absorbing rounding, never negative", () => {
    assert.deepEqual(splitByShares(1_000_000, [33.33, 33.33, 33.34]), [333_300, 333_300, 333_400]);
    assert.deepEqual(splitByShares(100_001, [50, 50]), [50_000, 50_001]);
    assert.deepEqual(splitByShares(2, [25, 25, 25, 25]), [0, 0, 0, 2]);
  });

  it("stacks concessions: percentages on the gross, then annual fixed amounts, never below zero", () => {
    const items = [
      { feeHeadId: "T", amount: 12000 },
      { feeHeadId: "B", amount: 6000 }
    ];
    const percent = { id: "p", concessionType: "PERCENT", value: 50, feeHeadIds: [] };
    const fixed = { id: "f", concessionType: "FIXED", value: 1200, feeHeadIds: ["T"] };
    const [tuition, bus] = annualFees(items, [fixed, percent]);
    assert.deepEqual(
      tuition.allocations.map(a => [a.concession.id, a.minor]),
      [
        ["p", 600_000],
        ["f", 120_000]
      ]
    );
    assert.deepEqual(
      bus.allocations.map(a => [a.concession.id, a.minor]),
      [["p", 300_000]]
    );
    const [capped] = annualFees(
      [{ feeHeadId: "T", amount: 100 }],
      [percent, { ...percent, id: "p2" }, { ...fixed, value: 999 }]
    );
    assert.deepEqual(
      capped.allocations.map(a => a.minor),
      [5_000, 5_000],
      "the fixed amount finds nothing left"
    );
  });

  it("charges late fees by slab: fixed steps, per-day tiers, grace days and a cap", () => {
    const slabs = {
      graceDays: 0,
      slabs: [
        { fromDay: 1, toDay: 7, chargeType: "FIXED", amount: 50 },
        { fromDay: 8, toDay: 30, chargeType: "FIXED", amount: 200 },
        { fromDay: 31, toDay: null, chargeType: "FIXED", amount: 500 }
      ]
    };
    const due = "2026-06-01";
    assert.deepEqual(
      ["2026-06-01", "2026-06-02", "2026-06-08", "2026-06-09", "2026-07-01", "2026-07-02", "2027-01-01"].map(day =>
        lateFeeFor(slabs, due, day)
      ),
      [0, 50, 50, 200, 200, 500, 500]
    );
    const perDay = {
      graceDays: 2,
      maxAmount: 300,
      slabs: [
        { fromDay: 1, toDay: 7, chargeType: "PER_DAY", amount: 10 },
        { fromDay: 8, toDay: null, chargeType: "PER_DAY", amount: 20 }
      ]
    };
    assert.deepEqual(
      ["2026-06-03", "2026-06-04", "2026-06-12", "2026-09-01"].map(day => lateFeeFor(perDay, due, day)),
      [0, 10, 110, 300],
      "grace, day 1, 7 x 10 + 2 x 20, capped"
    );
    const mixed = {
      slabs: [
        { fromDay: 1, toDay: 7, chargeType: "FIXED", amount: 50 },
        { fromDay: 8, toDay: null, chargeType: "PER_DAY", amount: 10 }
      ]
    };
    assert.equal(lateFeeFor(mixed, due, "2026-06-11"), 80, "50, then 10 a day from day 8");
    assert.equal(lateFeeFor(null, due, "2027-01-01"), 0);
  });
});

describe("finance: installment plans (D-17)", () => {
  it("sets up Class 3 with four students", async () => {
    t.c3 = (await post(`${A}/classes`, { className: "Class 3", classOrder: 3 })).data;
    t.s3A = (await post(`${A}/sections`, { classId: t.c3.id, sectionName: "A" })).data;
    const admit = async (key, parents) =>
      (
        await post("/api/v1/users/students", {
          user: person(key),
          profile: { admissionNumber: `ADM-${key}` },
          parents,
          enrollment: { academicYearId: world.y1.id, sectionId: t.s3A.id }
        })
      ).data;
    t.st31 = await admit("st31", [{ user: person("parent3"), relation: "FATHER", isPrimaryContact: true }]);
    const parentId = t.st31.parents[0].parentId;
    t.st32 = await admit("st32", [{ parentId, relation: "FATHER" }]);
    t.st33 = await admit("st33", []);
    t.st34 = await admit("st34", []);
    t.parent = tokenFor((await get(`/api/v1/users/parents/${parentId}`)).data.userId, "PARENT");
  });

  it("defines reusable plans for the year, with due dates in order", async () => {
    const months = ["06", "07", "08", "09", "10", "11", "12", "01", "02", "03"];
    const backwards = await request("POST", `${F}/installment-plans`, {
      body: {
        name: "Quarterly",
        installments: [
          { name: "Q1", dueDate: "2026-09-20", sharePercent: 50 },
          { name: "Q2", dueDate: "2026-06-20", sharePercent: 50 }
        ]
      }
    });
    assert.equal(backwards.status, 422);
    assert.equal(backwards.body.message, "Q2 must be due after Q1 (2026-09-20)");
    await post(
      `${F}/installment-plans`,
      { name: "x", installments: [{ name: "a", dueDate: "2026-07-01", sharePercent: 100 }] },
      { as: h.tokens.office },
      403
    );

    t.annual = (
      await post(`${F}/installment-plans`, {
        name: "Annual",
        installments: [{ name: "Year", dueDate: "2026-06-20", sharePercent: 100 }]
      })
    ).data;
    t.quarterly = (
      await post(`${F}/installment-plans`, {
        name: "Quarterly",
        installments: [
          { name: "Q1", dueDate: "2026-06-20", sharePercent: 25 },
          { name: "Q2", dueDate: "2026-09-20", sharePercent: 25 },
          { name: "Q3", dueDate: "2026-12-20", sharePercent: 25 },
          { name: "Q4", dueDate: "2027-03-10", sharePercent: 25 }
        ]
      })
    ).data;
    t.monthly = (
      await post(`${F}/installment-plans`, {
        name: "Monthly",
        installments: months.map((month, index) => ({
          name: `Month ${index + 1}`,
          dueDate: `${index < 7 ? 2026 : 2027}-${month}-20`,
          sharePercent: 10
        }))
      })
    ).data;
    assert.equal(t.monthly.installmentCount, 10);
    await post(
      `${F}/installment-plans`,
      { name: "Annual", installments: [{ name: "Year", dueDate: "2026-07-01", sharePercent: 100 }] },
      {},
      409
    );
    t.weekly = (
      await post(`${F}/installment-plans`, {
        name: "Weekly",
        installments: [{ name: "W1", dueDate: "2026-06-07", sharePercent: 100 }]
      })
    ).data;
    t.nextYearPlan = (
      await post(
        `${F}/installment-plans`,
        { name: "Annual", installments: [{ name: "Year", dueDate: "2027-07-01", sharePercent: 100 }] },
        { headers: { "x-academic-year-id": world.y2.id } }
      )
    ).data;
    const list = await get(`${F}/installment-plans`, { as: h.tokens.principal });
    assert.ok(["Annual", "Monthly", "Quarterly", "Weekly"].every(name => list.data.some(p => p.name === name)));
  });

  it("predefines late-fee rules with contiguous slabs", async () => {
    const gap = await request("POST", `${F}/late-fee-rules`, {
      body: {
        name: "Slabs",
        slabs: [
          { fromDay: 1, toDay: 7, chargeType: "FIXED", amount: 50 },
          { fromDay: 9, chargeType: "FIXED", amount: 200 }
        ]
      }
    });
    assert.equal(gap.status, 422);
    assert.equal(gap.body.message, "Slabs must follow each other: a slab should start at day 8, not 9");
    const open = await request("POST", `${F}/late-fee-rules`, {
      body: {
        name: "Slabs",
        slabs: [
          { fromDay: 1, chargeType: "FIXED", amount: 50 },
          { fromDay: 8, chargeType: "FIXED", amount: 200 }
        ]
      }
    });
    assert.equal(open.body.message, "Only the last slab can be open-ended (no toDay)");
    await post(`${F}/late-fee-rules`, { name: "x", slabs: [] }, {}, 400);

    t.slabRule = (
      await post(`${F}/late-fee-rules`, {
        name: "Slabs",
        slabs: [
          { fromDay: 1, toDay: 7, chargeType: "FIXED", amount: 50 },
          { fromDay: 8, toDay: 30, chargeType: "FIXED", amount: 200 },
          { fromDay: 31, chargeType: "FIXED", amount: 500 }
        ]
      })
    ).data;
    assert.deepEqual(
      t.slabRule.slabs.map(s => [s.fromDay, s.toDay, s.amount]),
      [
        [1, 7, 50],
        [8, 30, 200],
        [31, null, 500]
      ]
    );
    assert.equal(t.slabRule.isDefault, false);
  });

  it("lets a fee structure offer some plans, with a default and its own late-fee rule", async () => {
    const base = {
      name: "Class 3 Fees",
      classId: t.c3.id,
      items: [
        { feeHeadId: world.tuition.id, amount: 12000 },
        { feeHeadId: world.transport.id, amount: 6000 }
      ],
      installmentPlanIds: [t.annual.id, t.quarterly.id, t.monthly.id],
      defaultInstallmentPlanId: t.quarterly.id,
      lateFeeRuleId: t.slabRule.id
    };
    await post(`${F}/fee-structures`, { ...base, defaultInstallmentPlanId: t.weekly.id }, {}, 400);
    const otherYear = await request("POST", `${F}/fee-structures`, {
      body: { ...base, installmentPlanIds: [t.nextYearPlan.id], defaultInstallmentPlanId: t.nextYearPlan.id }
    });
    assert.equal(otherYear.status, 422);
    assert.equal(otherYear.body.message, "installmentPlanIds must refer to installment plans of 2026-27");
    const noRule = await request("POST", `${F}/fee-structures`, { body: { ...base, chargesLateFee: false } });
    assert.equal(noRule.body.message, "A structure that charges no late fee cannot have a late fee rule");

    t.structure = (await post(`${F}/fee-structures`, base)).data;
    assert.deepEqual(
      t.structure.installmentPlans.map(p => [p.name, p.isDefault]),
      [
        ["Quarterly", true],
        ["Annual", false],
        ["Monthly", false]
      ]
    );
    assert.equal(t.structure.lateFeeRule.name, "Slabs");

    /* Annual-only extras that never charge late fees */
    const extra = async (name, code) => {
      const head = (await post(`${F}/fee-heads`, { name, code })).data;
      return (
        await post(`${F}/fee-structures`, {
          name: `${name} fee`,
          classId: t.c3.id,
          items: [{ feeHeadId: head.id, amount: 8000 }],
          installmentPlanIds: [t.annual.id],
          defaultInstallmentPlanId: t.annual.id,
          chargesLateFee: false
        })
      ).data;
    };
    t.examFee = await extra("Exam", "EXAM");
    t.activityFee = await extra("Activity", "ACTIVITY");
  });

  it("assigns one plan per student and year, singly or for a whole section", async () => {
    const bulk = await post(
      `${F}/plan-assignments/bulk`,
      { installmentPlanId: t.monthly.id, sectionId: t.s3A.id },
      {},
      200
    );
    assert.equal(bulk.message, "Monthly plan (10 installments) assigned to 4 students of Class 3-A (4 changed)");
    await post(
      `${F}/plan-assignments/bulk`,
      { installmentPlanId: t.monthly.id, sectionId: t.s3A.id, classId: t.c3.id },
      {},
      400
    );

    const one = await post(`${F}/plan-assignments`, { studentId: t.st31.id, installmentPlanId: t.annual.id }, {}, 200);
    assert.equal(one.message, "Annual plan (1 installment) assigned to Fst31 Lst31");
    await post(
      `${F}/plan-assignments`,
      { studentId: t.st32.id, installmentPlanId: t.quarterly.id },
      asAccountant(),
      200
    );
    const reset = await post(`${F}/plan-assignments`, { studentId: t.st34.id, installmentPlanId: null }, {}, 200);
    assert.equal(reset.message, "Fst34 Lst34 now pays by each fee structure's default plan");

    const notOffered = await request("POST", `${F}/plan-assignments`, {
      body: { studentId: t.st33.id, installmentPlanId: t.weekly.id }
    });
    assert.equal(notOffered.status, 422);
    assert.equal(notOffered.body.message, "The Weekly plan is not offered by any fee structure of Class 3");
    const notThisYear = await request("POST", `${F}/plan-assignments`, {
      body: { studentId: t.st33.id, installmentPlanId: t.nextYearPlan.id }
    });
    assert.equal(notThisYear.body.message, "installmentPlanId does not refer to an installment plan of 2026-27");
    await post(
      `${F}/plan-assignments`,
      { studentId: t.st33.id, installmentPlanId: t.annual.id },
      { as: h.tokens.office },
      403
    );

    const monthly = await get(`${F}/plan-assignments?installmentPlanId=${t.monthly.id}`);
    assert.deepEqual(
      monthly.data.map(a => a.studentId),
      [t.st33.id]
    );
    assert.equal(monthly.data[0].plan.name, "Monthly");
  });
});

describe("finance: concessions on invoices (D-18)", () => {
  it("defines categorised concession templates and grants them", async () => {
    t.sibling3 = (
      await post(`${F}/concessions`, { name: "Sibling 3", category: "SIBLING", concessionType: "PERCENT", value: 10 })
    ).data;
    t.staffWard = (
      await post(`${F}/concessions`, {
        name: "Staff ward",
        category: "STAFF_WARD",
        concessionType: "PERCENT",
        value: 50
      })
    ).data;
    t.merit = (
      await post(`${F}/concessions`, {
        name: "Merit",
        category: "MERIT",
        concessionType: "FIXED",
        value: 1200,
        feeHeadIds: [world.tuition.id]
      })
    ).data;
    await post(`${F}/concessions`, { name: "Bad", concessionType: "FIXED", value: 10, category: "LUCKY" }, {}, 400);
    const sibling = await get(`${F}/concessions?category=SIBLING`);
    assert.ok(sibling.data.every(c => c.category === "SIBLING"));

    await post(`${F}/concession-grants`, { studentId: t.st31.id, concessionId: t.sibling3.id });
    await post(`${F}/concession-grants`, { studentId: t.st33.id, concessionId: t.staffWard.id });
    const merit = await post(`${F}/concession-grants`, { studentId: t.st33.id, concessionId: t.merit.id });
    assert.equal(merit.message, "Merit (1,200.00 a year) granted to Fst33 Lst33");
    await post(
      `${F}/concession-grants`,
      { studentId: t.st34.id, concessionId: t.merit.id },
      { as: h.tokens.office },
      403
    );

    const changeValue = await request("PATCH", `${F}/concessions/${t.merit.id}`, { body: { value: 2000 } });
    assert.equal(changeValue.status, 409);
    assert.match(
      changeValue.body.message,
      /^Merit has been granted; its type, value and fee heads can no longer change/
    );
    await patch(`${F}/concessions/${t.merit.id}`, { description: "Top 3 in class" });
    await del(`${F}/concessions/${t.merit.id}`, {}, 409);
  });

  it("schedules each student's invoices by their own plan, with gross, concession and net", async () => {
    const issued = await post(`${F}/invoices/generation`, {
      feeStructureId: t.structure.id,
      throughDate: "2026-09-30"
    });
    /* st31 Annual 1, st32 Quarterly 2, st33 Monthly 4 (Jun-Sep), st34 the default (Quarterly) 2 */
    assert.equal(issued.data.created, 9);
    assert.deepEqual(
      issued.data.byPlan.map(p => [p.name, p.invoices]),
      [
        ["Quarterly", 4],
        ["Annual", 1],
        ["Monthly", 4]
      ]
    );
    const again = await post(`${F}/invoices/generation`, { feeStructureId: t.structure.id, throughDate: "2026-09-30" });
    assert.deepEqual([again.data.created, again.data.skipped], [0, 9]);

    /* Annual: 18000 less 10% */
    const [year] = await live(t.st31.id);
    assert.deepEqual([year.subtotal, year.discount, year.total, year.dueDate], [18000, 1800, 16200, "2026-06-20"]);
    t.st31Year = year;

    /* Monthly, each month: tuition 1200 - 50% staff ward - a tenth of the 1200-a-year merit; transport 600 - 50% */
    const months = await live(t.st33.id);
    assert.equal(months.length, 4);
    const july = (await get(`${F}/invoices/${months.find(i => i.dueDate === "2026-07-20").id}`)).data;
    assert.deepEqual(
      july.lines.map(l => [
        l.description,
        l.amount,
        l.discount,
        l.netAmount,
        l.concessions.map(c => [c.name, c.amount]).sort()
      ]),
      [
        [
          "Tuition (Month 2)",
          1200,
          720,
          480,
          [
            ["Merit", 120],
            ["Staff ward", 600]
          ]
        ],
        ["Transport (Month 2)", 600, 300, 300, [["Staff ward", 300]]]
      ]
    );
    assert.equal(july.total, 780);
    assert.deepEqual(july.concessions.map(c => [c.name, c.amount]).sort(), [
      ["Merit", 120],
      ["Staff ward", 900]
    ]);
    t.st33Months = months;

    const statement = (await get(`${F}/students/${t.st33.id}/statement`)).data;
    assert.equal(statement.installmentPlan.name, "Monthly");
    assert.deepEqual(statement.concessions.map(c => [c.name, c.category, c.amount]).sort(), [
      ["Merit", "MERIT", 480],
      ["Staff ward", "STAFF_WARD", 3600]
    ]);
    assert.deepEqual(
      [statement.totals.gross, statement.totals.concessions, statement.totals.billed],
      [7200, 4080, 3120]
    );

    /* Plans in use keep their schedule; offered plans with invoices stay offered */
    await patch(
      `${F}/installment-plans/${t.monthly.id}`,
      { installments: [{ name: "All", dueDate: "2026-06-20", sharePercent: 100 }] },
      {},
      409
    );
    await patch(`${F}/installment-plans/${t.monthly.id}`, { description: "Ten instalments, June to March" });
    const removing = await request("PATCH", `${F}/fee-structures/${t.structure.id}`, {
      body: { installmentPlanIds: [t.quarterly.id, t.annual.id] }
    });
    assert.equal(removing.status, 409);
    assert.equal(
      removing.body.message,
      "Invoices have been issued under the Monthly plan from this structure; it must stay offered"
    );
    const offered = await request("DELETE", `${F}/installment-plans/${t.quarterly.id}`);
    assert.equal(offered.status, 409);
    assert.match(offered.body.message, /^The Quarterly plan is offered by Class 3 Fees/);
  });

  it("recalculates unpaid invoices when a concession is granted or revoked; paid ones are untouched", async () => {
    const [q1, q2] = await live(t.st32.id);
    await post(`${F}/invoices/${q1.id}/payments`, { amount: 1000, method: "CASH" }, { as: h.tokens.office });

    const granted = await post(`${F}/concession-grants`, { studentId: t.st32.id, concessionId: t.sibling3.id });
    assert.equal(
      granted.message,
      `Sibling 3 (10%) granted to Fst32 Lst32. 1 unpaid invoice(s) recalculated: ${q2.invoiceNumber}`
    );
    let [paid, unpaid] = await live(t.st32.id);
    assert.deepEqual([paid.total, paid.status, unpaid.total, unpaid.discount], [4500, "PARTIALLY_PAID", 4050, 450]);
    assert.deepEqual(
      (await get(`${F}/invoices/${unpaid.id}`)).data.concessions.map(c => c.name),
      ["Sibling 3"]
    );

    const revoked = await del(`${F}/concession-grants/${granted.data.id}`);
    assert.equal(
      revoked.message,
      `Sibling 3 revoked for Fst32 Lst32. 1 unpaid invoice(s) recalculated: ${q2.invoiceNumber}`
    );
    [paid, unpaid] = await live(t.st32.id);
    assert.deepEqual([paid.total, unpaid.total, unpaid.discount], [4500, 4500, 0]);
    t.st32Q1 = paid;
    t.st32Q2 = unpaid;
  });

  it("changes a student's plan only while nothing of the year is paid, re-issuing unpaid invoices", async () => {
    const refused = await request("POST", `${F}/plan-assignments`, {
      body: { studentId: t.st32.id, installmentPlanId: t.monthly.id }
    });
    assert.equal(refused.status, 409);
    assert.equal(
      refused.body.message,
      `Fst32 Lst32 has already paid towards 2026-27 invoices (${t.st32Q1.invoiceNumber}); the installment plan can no longer change`
    );

    const before = await live(t.st34.id);
    assert.deepEqual(
      before.map(i => i.installment.name),
      ["Q1", "Q2"]
    );
    const changed = await post(
      `${F}/plan-assignments`,
      { studentId: t.st34.id, installmentPlanId: t.monthly.id },
      {},
      200
    );
    assert.equal(
      changed.message,
      "Monthly plan (10 installments) assigned to Fst34 Lst34. 2 unpaid invoices cancelled and 4 re-issued under the new plan"
    );
    assert.deepEqual(
      changed.data.invoicesCancelled,
      before.map(i => i.invoiceNumber)
    );
    const after = await live(t.st34.id);
    assert.deepEqual(
      after.map(i => [i.installment.name, i.dueDate, i.total]),
      [
        ["Month 1", "2026-06-20", 1800],
        ["Month 2", "2026-07-20", 1800],
        ["Month 3", "2026-08-20", 1800],
        ["Month 4", "2026-09-20", 1800]
      ]
    );
    const cancelled = (await get(`${F}/invoices/${before[0].id}`)).data;
    assert.deepEqual([cancelled.status, cancelled.cancelReason], ["CANCELLED", "Installment plan changed to Monthly"]);

    const same = await post(
      `${F}/plan-assignments`,
      { studentId: t.st34.id, installmentPlanId: t.monthly.id },
      {},
      200
    );
    assert.equal(same.message, "Fst34 Lst34 already pays by the Monthly plan (10 installments)");
    assert.equal(same.data.changed, 0);
    const regenerate = await post(`${F}/invoices/generation`, {
      feeStructureId: t.structure.id,
      throughDate: "2026-09-30"
    });
    assert.deepEqual([regenerate.data.created, regenerate.data.skipped], [0, 11]);
  });

  it("serialises a plan change with a payment on the same invoice: exactly one wins", async () => {
    const june = t.st33Months.find(i => i.dueDate === "2026-06-20");
    const [payment, change] = await whileLocked(
      "SELECT id FROM invoices WHERE id = $1 FOR UPDATE",
      [june.id],
      [
        () =>
          request("POST", `${F}/invoices/${june.id}/payments`, {
            as: h.tokens.office,
            body: { amount: 100, method: "CASH" }
          }),
        () =>
          request("POST", `${F}/plan-assignments`, { body: { studentId: t.st33.id, installmentPlanId: t.annual.id } })
      ]
    );
    const outcome = [payment.status, change.status];
    assert.ok(
      (outcome[0] === 201 && outcome[1] === 409) || (outcome[0] === 422 && outcome[1] === 200),
      `one wins: ${JSON.stringify(outcome)}`
    );
    if (payment.status === 422) assert.equal(payment.body.message, "This invoice is cancelled");
    else assert.match(change.body.message, /has already paid towards 2026-27 invoices/);

    const paidButCancelled = await h.pool.query(
      `SELECT count(*) FROM payments p JOIN invoices i ON i.id = p.invoice_id
       WHERE i.student_id = $1 AND i.status = 'CANCELLED' AND p.status = 'SUCCEEDED'`,
      [t.st33.id]
    );
    assert.equal(Number(paidButCancelled.rows[0].count), 0, "no money on a cancelled invoice");
  });
});

describe("finance: late-fee slabs and waivers (D-19)", () => {
  it("applies each structure's rule by days overdue, idempotently", async () => {
    for (let run = 0; run < 2; run++) {
      await h.modules.jobs.enqueue("finance.applyLateFees", { tenantId: h.tenant.id });
      await settleJobs();
    }
    const today = todayIn("Asia/Kolkata");
    const rule = (await get(`${F}/late-fee-rules/${t.slabRule.id}`)).data;
    const open = [...(await live(t.st31.id)), ...(await live(t.st32.id)), ...(await live(t.st34.id))];
    assert.ok(open.length >= 7);
    for (const invoice of open) {
      assert.equal(invoice.lateFee, lateFeeFor(rule, invoice.dueDate, today), `${invoice.installment.name}`);
      assert.equal(invoice.total, invoice.subtotal - invoice.discount + invoice.lateFee);
    }
    assert.equal(open.find(i => i.id === t.st32Q1.id).lateFee, 500, "over 30 days late");
  });

  it("waives the late fee on one invoice, with a reason, and can undo it", async () => {
    const url = `${F}/invoices/${t.st32Q1.id}/late-fee-waiver`;
    await post(url, {}, asAccountant(), 400);
    await post(url, { reason: "Hospitalised" }, { as: h.tokens.office }, 403);
    const waived = await post(url, { reason: "Hospitalised in July" }, asAccountant(), 200);
    assert.equal(
      waived.message,
      `Late fee of 500.00 waived on ${t.st32Q1.invoiceNumber}; no late fee will be charged on it`
    );
    assert.deepEqual([waived.data.lateFee, waived.data.total, waived.data.balance], [0, 4500, 3500]);
    assert.equal(waived.data.lateFeeWaiver.amount, 500);
    assert.equal(waived.data.lateFeeWaiver.reason, "Hospitalised in July");

    await h.modules.jobs.enqueue("finance.applyLateFees", { tenantId: h.tenant.id });
    await settleJobs();
    assert.equal((await get(`${F}/invoices/${t.st32Q1.id}`)).data.lateFee, 0, "the daily job leaves it alone");
    const twice = await request("POST", url, { body: { reason: "again" } });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.message, `The late fee on ${t.st32Q1.invoiceNumber} is already waived`);

    const undone = await del(url, asAccountant());
    assert.equal(undone.message, `Late fee reinstated on ${t.st32Q1.invoiceNumber} (now 500.00)`);
    assert.deepEqual([undone.data.lateFee, undone.data.lateFeeWaiver], [500, null]);
    await del(url, {}, 409);
  });

  it("refuses a waiver once part of the late fee is paid, or the invoice is paid", async () => {
    const url = `${F}/invoices/${t.st32Q1.id}`;
    /* 1000 + 3600 paid of 4500 + 500 late fee: 100 of the late fee is paid */
    await post(`${url}/payments`, { amount: 3600, method: "CASH" }, { as: h.tokens.office });
    const partly = await request("POST", `${url}/late-fee-waiver`, { body: { reason: "x" } });
    assert.equal(partly.status, 422);
    assert.equal(
      partly.body.message,
      `100.00 of the late fee on ${t.st32Q1.invoiceNumber} is already paid; it can no longer be waived`
    );
    await post(`${url}/payments`, { amount: 400, method: "CASH" }, { as: h.tokens.office });
    const paid = await request("POST", `${url}/late-fee-waiver`, { body: { reason: "x" } });
    assert.equal(paid.status, 409);
    assert.equal(paid.body.message, `${t.st32Q1.invoiceNumber} is fully paid`);
  });
});

describe("finance: each school's own Razorpay keys (D-20)", () => {
  it("stores the keys encrypted, write-only, for administrators only", async () => {
    const { keySecret, webhookSecret } = world.gatewayKeys;
    await get(`${F}/payment-settings`, asAccountant(), 403);
    await get(`${F}/payment-settings`, { as: h.tokens.principal }, 403);
    await call("PUT", `${F}/payment-settings`, { body: { ...world.gatewayKeys, keyId: "sk_live_123" } }, 400);

    const settings = await get(`${F}/payment-settings`);
    assert.equal(settings.data.keyId, "rzp_test_School1Key");
    assert.equal(settings.data.keySecret, `****${keySecret.slice(-4)}`);
    assert.equal(settings.data.webhookUrl.endsWith(webhookUrl(h.tenant.id)), true);
    assert.equal(settings.data.simulated, true);
    const body = JSON.stringify(settings);
    assert.ok(!body.includes(keySecret) && !body.includes(webhookSecret), "secrets are never returned");

    const [row] = (
      await h.pool.query("SELECT key_secret, webhook_secret FROM payment_gateway_accounts WHERE tenant_id = $1", [
        h.tenant.id
      ])
    ).rows;
    assert.match(row.key_secret, /^enc:v1:/);
    assert.ok(!row.key_secret.includes(keySecret) && !row.webhook_secret.includes(webhookSecret));

    await new Promise(resolve => setTimeout(resolve, 200));
    const audit = await h.modules.AuditLog.findOne({ permission: "finance.paymentSettings.manage" }).lean();
    assert.equal(audit.payload.keyId, "rzp_test_School1Key");
    assert.ok(!("keySecret" in audit.payload) && !("webhookSecret" in audit.payload), "not in the audit trail");

    const tested = await post(`${F}/payment-settings/connection-test`, {}, {}, 200);
    assert.equal(tested.message, "Connected to Razorpay (test mode)");
    assert.ok(tested.data.verifiedAt);
    await post(`${F}/payment-settings/connection-test`, {}, asAccountant(), 403);
  });

  it("verifies each school's webhooks with that school's secret only", async () => {
    const other = {
      keyId: "rzp_live_OtherSchool9",
      keySecret: "other-key-secret-1",
      webhookSecret: "other-hook-secret-2"
    };
    const unset = await request("POST", webhookUrl(h.otherTenant.id), {
      as: null,
      raw: "{}",
      headers: { "x-razorpay-signature": sign(other.webhookSecret, "{}") }
    });
    assert.equal(unset.status, 422);
    assert.equal(unset.body.message, "Online payments are not set up for this school");
    const saved = await call("PUT", `${F}/payment-settings`, { body: other, as: h.tokens.otherAdmin });
    assert.equal(saved.data.mode, "live");

    /* A real pending order of school 1 */
    const order = (await post(`${F}/invoices/${t.st32Q2.id}/payment-orders`, { amount: 100 }, { as: h.tokens.office }))
      .data;
    const body = capturedBody(order.orderId, "pay_cross", order.amountMinor);
    const toOtherSchool = await request("POST", webhookUrl(h.otherTenant.id), {
      as: null,
      raw: body,
      headers: { "x-razorpay-signature": sign(other.webhookSecret, body) }
    });
    assert.equal(toOtherSchool.status, 200);
    assert.equal(toOtherSchool.body.message, "Webhook ignored", "school 2 cannot settle school 1's order");
    const wrongSecret = await request("POST", webhookUrl(h.tenant.id), {
      as: null,
      raw: body,
      headers: { "x-razorpay-signature": sign(other.webhookSecret, body) }
    });
    assert.equal(wrongSecret.status, 422);
    assert.equal((await get(`${F}/invoices/${t.st32Q2.id}`)).data.amountPaid, 0);
    /* The old shared webhook is gone: it could not tell which school's secret to use */
    await call("POST", "/api/v1/public/payments/webhook", { body: {} }, 404);

    const removed = await call("DELETE", `${F}/payment-settings`, { as: h.tokens.otherAdmin });
    assert.equal(removed.message, "Razorpay keys removed. Online payments are off");
    assert.equal(removed.data.configured, false);
  });

  it("calls Razorpay with the school's keys per call, never from the environment", async () => {
    const env = (await import("../../src/common/config/env.config.js")).default;
    assert.deepEqual(env.payments, { provider: "mock" });

    const { razorpayGateway } = h.modules.gateway;
    const credentials = { keyId: "rzp_test_Abc123", keySecret: "s3cret", webhookSecret: "hook" };
    const realFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      if (!String(url).startsWith("https://api.razorpay.com")) return realFetch(url, init);
      calls.push({ url: String(url), init });
      if (String(url).endsWith("/orders")) {
        return new Response(JSON.stringify({ id: "order_rzp_1", amount: 12345, currency: "INR" }), { status: 200 });
      }
      return new Response("{}", {
        status: init.headers.authorization.includes(Buffer.from("rzp_test_Abc123:s3cret").toString("base64"))
          ? 200
          : 401
      });
    };
    try {
      const order = await razorpayGateway.createOrder(credentials, {
        amountMinor: 12345,
        currency: "INR",
        receipt: "INV"
      });
      assert.deepEqual(order, {
        orderId: "order_rzp_1",
        amountMinor: 12345,
        currency: "INR",
        keyId: "rzp_test_Abc123"
      });
      assert.equal(
        calls[0].init.headers.authorization,
        `Basic ${Buffer.from("rzp_test_Abc123:s3cret").toString("base64")}`
      );
      assert.equal(JSON.parse(calls[0].init.body).amount, 12345);
      assert.deepEqual(await razorpayGateway.testConnection(credentials), { ok: true, status: 200 });
      assert.deepEqual(await razorpayGateway.testConnection({ ...credentials, keySecret: "wrong" }), {
        ok: false,
        status: 401
      });
      await assert.rejects(() => razorpayGateway.createOrder({}, { amountMinor: 1 }), /credentials/);
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.equal(
      razorpayGateway.verifyPayment(credentials, { orderId: "o", paymentId: "p", signature: sign("s3cret", "o|p") }),
      true
    );
    assert.equal(razorpayGateway.verifyWebhook(credentials, Buffer.from("{}"), sign("hook", "{}")), true);
    assert.equal(
      razorpayGateway.verifyWebhook({ ...credentials, webhookSecret: "" }, Buffer.from("{}"), sign("", "{}")),
      false
    );
  });
});

describe("finance: partial online payments and overpayment (D-21)", () => {
  it("lets the payer choose an amount up to the balance, above a minimum", async () => {
    const { keySecret } = world.gatewayKeys;
    const invoice = (await get(`${F}/invoices/${t.st31Year.id}`)).data;
    t.st31Total = invoice.total;
    const orders = `${ME}/students/${t.st31.id}/invoices/${invoice.id}/payment-orders`;

    const tooMuch = await request("POST", orders, { as: t.parent, body: { amount: invoice.balance + 1 } });
    assert.equal(tooMuch.status, 422);
    assert.equal(tooMuch.body.message, `The amount exceeds the invoice balance of ${invoice.balance}`);
    const tooLittle = await request("POST", orders, { as: t.parent, body: { amount: 50 } });
    assert.equal(tooLittle.status, 422);
    assert.equal(
      tooLittle.body.message,
      `The minimum online payment is 100.00, or the full balance of ${invoice.balance.toFixed(2)}`
    );
    await post(orders, { amount: 10.005 }, { as: t.parent }, 400);

    const order = await post(orders, { amount: 5000 }, { as: t.parent });
    assert.equal(order.message, `Payment order created for 5000.00 of ${invoice.invoiceNumber}`);
    assert.deepEqual([order.data.amount, order.data.amountMinor], [5000, 500000]);
    const confirmed = await post(
      `${ME}/payments/confirmations`,
      {
        orderId: order.data.orderId,
        paymentId: "pay_part",
        signature: sign(keySecret, `${order.data.orderId}|pay_part`)
      },
      { as: t.parent },
      200
    );
    assert.equal(confirmed.data.invoice.status, "PARTIALLY_PAID");
    assert.equal(confirmed.data.invoice.balance, invoice.balance - 5000);
    assert.equal(confirmed.data.excessAmount, 0);
    t.partPayment = confirmed.data;
  });

  it("keeps the excess of two payments in flight as the student's credit, under the invoice lock", async () => {
    const { keySecret, webhookSecret } = world.gatewayKeys;
    const balance = (await get(`${F}/invoices/${t.st31Year.id}`)).data.balance;
    const first = (
      await post(`${ME}/students/${t.st31.id}/invoices/${t.st31Year.id}/payment-orders`, {}, { as: t.parent })
    ).data;
    const second = (await post(`${F}/invoices/${t.st31Year.id}/payment-orders`, {}, { as: h.tokens.office })).data;
    assert.deepEqual([first.amount, second.amount], [balance, balance]);

    const hook = capturedBody(second.orderId, "pay_two", second.amountMinor);
    const results = await whileLocked(
      "SELECT id FROM invoices WHERE id = $1 FOR UPDATE",
      [t.st31Year.id],
      [
        () =>
          request("POST", `${ME}/payments/confirmations`, {
            as: t.parent,
            body: {
              orderId: first.orderId,
              paymentId: "pay_one",
              signature: sign(keySecret, `${first.orderId}|pay_one`)
            }
          }),
        () =>
          request("POST", webhookUrl(h.tenant.id), {
            as: null,
            raw: hook,
            headers: { "x-razorpay-signature": sign(webhookSecret, hook) }
          })
      ]
    );
    assert.deepEqual(
      results.map(r => r.status),
      [200, 200]
    );

    const payments = await Promise.all(
      [first.paymentId, second.paymentId].map(async id => (await get(`${F}/payments/${id}`)).data)
    );
    assert.deepEqual(
      payments.map(p => p.excessAmount).sort((a, b) => a - b),
      [0, balance],
      "one payment pays the invoice, the other is kept whole as credit"
    );
    const invoice = (await get(`${F}/invoices/${t.st31Year.id}`)).data;
    assert.deepEqual([invoice.status, invoice.amountPaid, invoice.balance], ["PAID", t.st31Total, 0]);

    const credits = (await get(`${F}/students/${t.st31.id}/credits`, asAccountant())).data;
    assert.equal(credits.balance, balance);
    const excess = payments.find(p => p.excessAmount > 0);
    assert.deepEqual(
      credits.entries.map(e => [e.entryType, e.amount, e.paymentId]),
      [["OVERPAYMENT", balance, excess.id]]
    );
    /* The second to get the lock found the invoice already paid by the first */
    assert.equal(credits.entries[0].notes, `${invoice.invoiceNumber} was already paid`);
    t.credit = balance;
    t.excessPayment = excess;

    if (results[0].body.data.id === excess.id) {
      assert.equal(
        results[0].body.message,
        `Payment confirmed. Receipt ${excess.receiptNumber}. ${balance.toFixed(2)} more than the balance is kept as credit`
      );
    }
    await settleJobs();
  });

  it("prints the concessions, late fee and any credit on the receipt", async () => {
    const part = pdfText((await request("GET", `${F}/payments/${t.partPayment.id}/receipt`)).buffer);
    for (const text of ["Fee Receipt", "Tuition (Year)", "Concessions applied", "Sibling 3", "Late fee", "₹5,000.00"]) {
      assert.ok(part.includes(text), `receipt shows "${text}"`);
    }
    const excess = (await request("GET", `${ME}/payments/${t.excessPayment.id}/receipt`, { as: t.parent })).buffer;
    assert.ok(pdfText(excess).includes("Kept as credit for later fees"));
  });

  it("applies credit to later invoices, one spender at a time, and records refunds", async () => {
    await post(`${F}/invoices/generation`, { feeStructureId: t.examFee.id });
    await post(`${F}/invoices/generation`, { feeStructureId: t.activityFee.id });
    const extras = (await live(t.st31.id)).filter(i => i.id !== t.st31Year.id);
    assert.deepEqual(
      extras.map(i => i.total),
      [7200, 7200],
      "8000 less the 10% sibling concession"
    );

    const st32Exam = (await live(t.st32.id)).find(i => i.feeStructureId === t.examFee.id);
    const none = await request("POST", `${F}/invoices/${st32Exam.id}/credit-application`, {
      as: h.tokens.accountant,
      body: {}
    });
    assert.equal(none.status, 422);
    assert.equal(none.body.message, "The student has no credit to apply");
    await post(`${F}/invoices/${extras[0].id}/credit-application`, {}, { as: h.tokens.office }, 403);

    const [balanceRow] = (
      await h.pool.query("SELECT id FROM student_credit_balances WHERE student_id = $1", [t.st31.id])
    ).rows;
    const results = await whileLocked(
      "SELECT id FROM student_credit_balances WHERE id = $1 FOR UPDATE",
      [balanceRow.id],
      extras.map(
        invoice => () =>
          request("POST", `${F}/invoices/${invoice.id}/credit-application`, {
            as: h.tokens.accountant,
            body: { amount: 7000 }
          })
      )
    );
    assert.deepEqual(results.map(r => r.status).sort(), [200, 422]);
    const left = t.credit - 7000;
    assert.equal(
      results.find(r => r.status === 422).body.message,
      `The amount exceeds the available credit of ${left.toFixed(2)}`
    );
    const winner = results.find(r => r.status === 200).body;
    assert.match(
      winner.message,
      new RegExp(`^Credit of 7000\\.00 applied to INV26-\\d+\\. Remaining credit ${left.toFixed(2)}$`)
    );
    assert.deepEqual([winner.data.invoice.amountPaid, winner.data.invoice.creditApplications.length], [7000, 1]);

    await post(
      `/api/v1/finance/students/${t.st31.id}/credit-refunds`,
      { amount: 10, method: "CHEQUE" },
      asAccountant(),
      400
    );
    const refund = await post(
      `${F}/students/${t.st31.id}/credit-refunds`,
      { amount: 200, method: "BANK_TRANSFER", reference: "NEFT-778" },
      asAccountant()
    );
    assert.equal(refund.message, `Refund of 200.00 recorded. Remaining credit ${(left - 200).toFixed(2)}`);
    const tooMuch = await request("POST", `${F}/students/${t.st31.id}/credit-refunds`, {
      as: h.tokens.accountant,
      body: { amount: 100000, method: "CASH" }
    });
    assert.equal(tooMuch.body.message, `The amount exceeds the available credit of ${(left - 200).toFixed(2)}`);

    const loser = extras.find(i => i.id !== winner.data.invoice.id);
    const rest = await post(`${F}/invoices/${loser.id}/credit-application`, {}, asAccountant(), 200);
    assert.equal(rest.data.applied, left - 200, "default: as much as there is");
    assert.equal(rest.data.remainingCredit, 0);

    const statement = (await get(`${ME}/students/${t.st31.id}/fees`, { as: t.parent })).data;
    assert.equal(statement.credit.balance, 0);
    assert.deepEqual(statement.creditEntries.map(e => e.entryType).sort(), [
      "APPLIED",
      "APPLIED",
      "OVERPAYMENT",
      "REFUNDED"
    ]);
  });

  it("credits only the part beyond the balance when a counter payment lands during an online payment", async () => {
    const { keySecret } = world.gatewayKeys;
    const [month1] = await live(t.st34.id);
    const order = (await post(`${F}/invoices/${month1.id}/payment-orders`, {}, { as: h.tokens.office })).data;
    await post(`${F}/invoices/${month1.id}/payments`, { amount: 300, method: "CASH" }, { as: h.tokens.office });
    const confirmed = await post(
      `${F}/payments/confirmations`,
      { orderId: order.orderId, paymentId: "pay_late", signature: sign(keySecret, `${order.orderId}|pay_late`) },
      { as: h.tokens.office },
      200
    );
    assert.equal(
      confirmed.message,
      `Payment confirmed. Receipt ${confirmed.data.receiptNumber}. 300.00 more than the balance is kept as credit`
    );
    assert.deepEqual(
      [confirmed.data.excessAmount, confirmed.data.balanceAfter, confirmed.data.invoice.status],
      [300, 0, "PAID"]
    );
    const credits = (await get(`${F}/students/${t.st34.id}/credits`)).data;
    assert.equal(credits.balance, 300);
    assert.equal(credits.entries[0].notes, `300.00 more than the balance of ${month1.invoiceNumber}`);
    await settleJobs();
  });

  it("shows concessions, late fees and credit in the dashboards and exports", async () => {
    const fees = (await get("/api/v1/reports/dashboards/fees?from=2026-01-01&to=2027-12-31", asAccountant())).data;
    const categories = fees.concessions.byCategory.map(c => c.category);
    assert.ok(["SIBLING", "STAFF_WARD", "MERIT"].every(c => categories.includes(c)));
    const classThree = fees.byClass.find(c => c.className === "Class 3");
    assert.ok(classThree.concessions > 0);

    const overview = (await get("/api/v1/reports/dashboards/overview")).data;
    assert.equal(overview.fees.creditHeld, 300, "st34's credit");
    assert.ok(overview.fees.concessions > 0 && overview.fees.lateFees > 0);

    const csv = (
      await request(
        "GET",
        "/api/v1/reports/exports/fee-collections?format=csv&from=2026-01-01&to=2027-12-31",
        asAccountant()
      )
    ).buffer.toString();
    assert.match(csv.split("\r\n")[0], /Kept as credit/);
  });
});
