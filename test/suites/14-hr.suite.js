import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, patch, uuid } from "../helpers/harness.js";

const HR = "/api/v1/hr";
const ME = `${HR}/me`;

/* Employees from earlier suites */
const teacherId = () => world.teacher.userId;
const teacher2Id = () => world.teacher2.userId;
const officeId = () => world.office.userId;

const mark = (date, records, as = h.tokens.hrManager) =>
  request("POST", `${HR}/staff-attendance`, { as, body: { date, records } });

const statuses = responses => responses.map(r => r.status).sort();

describe("hr: staff attendance", () => {
  it("records a day idempotently per employee and date", async () => {
    const first = await mark("2026-07-06", [
      { userId: teacherId(), status: "PRESENT", checkIn: "08:55", checkOut: "16:30" },
      { userId: teacher2Id(), status: "ABSENT", remarks: "No call" }
    ]);
    assert.equal(first.status, 201);
    assert.equal(first.body.message, "Staff attendance for 2026-07-06: 2 recorded");
    assert.deepEqual(first.body.data.counts, { PRESENT: 1, ABSENT: 1, HALF_DAY: 0, LEAVE: 0, ON_DUTY: 0 });

    const again = await mark("2026-07-06", [{ userId: teacher2Id(), status: "ON_DUTY" }], h.tokens.principal);
    assert.equal(again.status, 200);
    assert.equal(again.body.message, "Staff attendance for 2026-07-06: 1 updated");

    /* Two clerks marking the same person at once still leave one row */
    const racing = await Promise.all(
      ["PRESENT", "HALF_DAY"].map(status => mark("2026-07-07", [{ userId: officeId(), status }]))
    );
    assert.ok(racing.every(r => r.status === 200 || r.status === 201));
    const rows = await h.pool.query(
      "SELECT date::text, status FROM staff_attendance WHERE tenant_id = $1 AND date BETWEEN '2026-07-06' AND '2026-07-07' ORDER BY date",
      [h.tenant.id]
    );
    assert.equal(rows.rows.length, 3, "one row per (employee, date)");

    const register = await get(`${HR}/staff-attendance/register?date=2026-07-06`, { as: h.tokens.principal });
    assert.equal(register.message, `Staff register for 2026-07-06: 2 of ${register.data.employees.length} marked`);
    const byUser = new Map(register.data.employees.map(e => [e.userId, e]));
    assert.equal(byUser.get(teacherId()).status, "PRESENT");
    assert.equal(byUser.get(teacherId()).checkIn, "08:55:00");
    assert.equal(byUser.get(teacherId()).employeeCode, world.teacher.employeeCode);
    assert.equal(byUser.get(teacher2Id()).status, "ON_DUTY");
    assert.equal(byUser.get(world.principal.userId).status, null);
    assert.equal(byUser.get(world.principal.userId).designation, "Principal");
    assert.ok(!byUser.has(world.s1.userId), "students are not employees");
  });

  it("rejects future dates, closed days, non-employees and bad input", async () => {
    const tomorrow = addDays(todayIn("Asia/Kolkata"), 1);
    const future = await mark(tomorrow, [{ userId: teacherId(), status: "PRESENT" }]);
    assert.equal(future.status, 422);
    assert.equal(future.body.message, "Staff attendance cannot be recorded for a future date");

    const holiday = await mark("2026-07-08", [{ userId: teacherId(), status: "PRESENT" }]);
    assert.equal(holiday.status, 422);
    assert.equal(holiday.body.message, "Staff attendance cannot be recorded on 2026-07-08: it is a holiday");
    const sunday = await mark("2026-07-12", [{ userId: teacherId(), status: "PRESENT" }]);
    assert.match(sunday.body.message, /it is a weekly off day/);

    /* No academic year covers May 2026: the calendar does not apply */
    const gap = await mark("2026-05-15", [{ userId: teacherId(), status: "PRESENT" }]);
    assert.equal(gap.status, 201);

    const student = await mark("2026-07-09", [
      { userId: teacherId(), status: "PRESENT" },
      { userId: world.s1.userId, status: "PRESENT" }
    ]);
    assert.equal(student.status, 422);
    assert.equal(student.body.message, `1 user(s) are not active employees: ${world.s1.userId}`);
    assert.equal((await mark("2026-07-09", [{ userId: uuid(), status: "PRESENT" }])).status, 422);

    const timedAbsence = await mark("2026-07-09", [{ userId: teacherId(), status: "ABSENT", checkIn: "09:00" }]);
    assert.equal(timedAbsence.status, 400);
    assert.match(timedAbsence.body.message, /checkIn can only be given for PRESENT, HALF_DAY, ON_DUTY/);
    const backwards = await mark("2026-07-09", [
      { userId: teacherId(), status: "PRESENT", checkIn: "17:00", checkOut: "09:00" }
    ]);
    assert.match(backwards.body.message, /checkOut must not be before checkIn/);
    const twice = await mark("2026-07-09", [
      { userId: teacherId(), status: "PRESENT" },
      { userId: teacherId(), status: "ABSENT" }
    ]);
    assert.equal(twice.status, 400);
    assert.equal((await mark("2026-07-09", [{ userId: teacherId(), status: "LATE" }])).status, 400);

    assert.equal(
      (await mark("2026-07-09", [{ userId: teacherId(), status: "PRESENT" }], h.tokens.teacher)).status,
      403
    );
    assert.equal(
      (await mark("2026-07-09", [{ userId: teacherId(), status: "PRESENT" }], h.tokens.accountant)).status,
      403
    );
    await get(`${HR}/staff-attendance/register?date=2026-07-06`, { as: h.tokens.teacher }, 403);
    await get(`${HR}/staff-attendance/register?date=2026-07-06`, { as: h.tokens.student1 }, 403);
  });

  it("summarises per employee and shows employees their own record", async () => {
    const summary = await get(`${HR}/staff-attendance/summary?from=2026-07-01&to=2026-07-31&userId=${teacher2Id()}`, {
      as: h.tokens.hrManager
    });
    assert.equal(summary.data.workingDays, 26, "31 July days - 4 Sundays - 1 holiday");
    assert.equal(summary.data.employees.length, 1);
    assert.deepEqual(summary.data.employees[0].counts, { PRESENT: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0, ON_DUTY: 1 });
    assert.equal(summary.data.employees[0].daysPresent, 1);

    await get(`${HR}/staff-attendance/summary?userId=${world.s1.userId}`, {}, 404);
    await get(`${HR}/staff-attendance/summary?from=2026-07-10&to=2026-07-01`, {}, 400);

    const mine = await get(`${ME}/attendance?from=2026-07-01&to=2026-07-31`, { as: h.tokens.teacher });
    assert.deepEqual(
      mine.data.days.map(d => [d.date, d.status]),
      [["2026-07-06", "PRESENT"]]
    );
    assert.equal(mine.data.userId, teacherId());
    const accountant = await get(`${ME}/attendance`, { as: h.tokens.accountant });
    assert.equal(accountant.data.marked, 0);
    await get(`${ME}/attendance`, { as: h.tokens.mother }, 403);
  });
});

describe("hr: leave", () => {
  it("manages leave types (managers write, every employee reads)", async () => {
    world.cl = (await post(`${HR}/leave-types`, { name: "Casual Leave", code: "cl", annualQuotaDays: 3 })).data;
    assert.equal(world.cl.code, "CL");
    assert.equal(world.cl.isPaid, true);
    assert.equal(world.cl.requiresApproval, true);
    world.sl = (
      await post(
        `${HR}/leave-types`,
        { name: "Sick Leave", code: "SL", annualQuotaDays: 6, requiresApproval: false },
        { as: h.tokens.principal }
      )
    ).data;
    world.lwp = (
      await post(`${HR}/leave-types`, { name: "Leave Without Pay", code: "LWP", annualQuotaDays: 30, isPaid: false })
    ).data;

    await post(`${HR}/leave-types`, { name: "Casual 2", code: "CL", annualQuotaDays: 1 }, {}, 409);
    await post(`${HR}/leave-types`, { name: "Odd", code: "ODD", annualQuotaDays: 1.25 }, {}, 400);
    await post(`${HR}/leave-types`, { name: "Mine", code: "MINE", annualQuotaDays: 1 }, { as: h.tokens.teacher }, 403);
    const updated = await patch(`${HR}/leave-types/${world.sl.id}`, { description: "With a certificate" });
    assert.equal(updated.data.requiresApproval, false, "PATCH does not reset defaults");

    const visible = await get(`${HR}/leave-types`, { as: h.tokens.teacher });
    assert.deepEqual(
      visible.data.map(t => t.code),
      ["CL", "LWP", "SL"]
    );
    await get(`${HR}/leave-types`, { as: h.tokens.student1 }, 403);
  });

  it("counts working days and refuses overlaps and exceeded quotas", async () => {
    const apply = (body, as = h.tokens.teacher) => request("POST", `${HR}/leave-requests`, { as, body });

    /* Fri 6 .. Mon 9 November: Sunday 8 is a weekly off -> 3 days */
    const first = await apply({
      leaveTypeId: world.cl.id,
      fromDate: "2026-11-06",
      toDate: "2026-11-09",
      reason: "Wedding"
    });
    assert.equal(first.status, 201);
    assert.equal(
      first.body.message,
      "Leave request submitted for approval: Casual Leave, 2026-11-06 to 2026-11-09 (3 days)"
    );
    assert.equal(first.body.data.days, 3);
    assert.equal(first.body.data.status, "PENDING");
    world.teacherLeave = first.body.data;

    const overlap = await apply({
      leaveTypeId: world.sl.id,
      fromDate: "2026-11-09",
      toDate: "2026-11-10",
      reason: "x"
    });
    assert.equal(overlap.status, 409);
    assert.equal(
      overlap.body.message,
      "You already have a pending leave request from 2026-11-06 to 2026-11-09 that overlaps these dates"
    );

    const tooMuch = await apply({
      leaveTypeId: world.cl.id,
      fromDate: "2026-11-12",
      toDate: "2026-11-12",
      reason: "x"
    });
    assert.equal(tooMuch.status, 422);
    assert.equal(
      tooMuch.body.message,
      "Not enough Casual Leave balance for 2026: requested 1 day, remaining 0 days (quota 3, used 0, pending 3)"
    );

    const sunday = await apply({ leaveTypeId: world.sl.id, fromDate: "2026-11-15", toDate: "2026-11-15", reason: "x" });
    assert.equal(sunday.status, 422);
    assert.match(sunday.body.message, /There are no working days between 2026-11-15 and 2026-11-15/);

    const halfSpan = await apply({
      leaveTypeId: world.cl.id,
      fromDate: "2026-11-16",
      toDate: "2026-11-17",
      halfDay: true,
      reason: "x"
    });
    assert.equal(halfSpan.status, 400);
    assert.match(halfSpan.body.message, /halfDay is only allowed when fromDate and toDate are the same day/);
    const twoYears = await apply({
      leaveTypeId: world.cl.id,
      fromDate: "2026-12-31",
      toDate: "2027-01-01",
      reason: "x"
    });
    assert.equal(twoYears.status, 400);
    assert.equal(
      (await apply({ leaveTypeId: uuid(), fromDate: "2026-11-16", toDate: "2026-11-16", reason: "x" })).status,
      422
    );
    assert.equal(
      (
        await apply(
          { leaveTypeId: world.cl.id, fromDate: "2026-11-16", toDate: "2026-11-16", reason: "x" },
          h.tokens.student1
        )
      ).status,
      403
    );

    const balances = await get(`${ME}/leave-balances?year=2026`, { as: h.tokens.teacher });
    assert.deepEqual(
      balances.data.balances.find(b => b.code === "CL"),
      {
        leaveTypeId: world.cl.id,
        code: "CL",
        name: "Casual Leave",
        isPaid: true,
        quota: 3,
        used: 0,
        pending: 3,
        remaining: 0
      }
    );

    /* Two overlapping applications at the same moment: exactly one wins */
    const racing = await Promise.all([
      apply({ leaveTypeId: world.cl.id, fromDate: "2026-11-16", toDate: "2026-11-16", reason: "a" }, h.tokens.teacher2),
      apply({ leaveTypeId: world.cl.id, fromDate: "2026-11-16", toDate: "2026-11-17", reason: "b" }, h.tokens.teacher2)
    ]);
    assert.deepEqual(statuses(racing), [201, 409]);
    world.teacher2Pending = racing.find(r => r.status === 201).body.data;
  });

  it("approves into LEAVE marks, refuses self-decisions and controls cancellation", async () => {
    const decide = (id, body, as = h.tokens.principal) =>
      request("POST", `${HR}/leave-requests/${id}/decision`, { as, body });
    const cancel = (id, as, body = {}) => request("POST", `${HR}/leave-requests/${id}/cancellation`, { as, body });

    assert.equal((await decide(world.teacherLeave.id, { decision: "APPROVED" }, h.tokens.teacher)).status, 403);
    assert.equal((await decide(world.teacherLeave.id, { decision: "APPROVED" }, h.tokens.accountant)).status, 403);
    assert.equal((await decide(world.teacherLeave.id, { decision: "REJECTED" })).status, 400, "rejecting needs a note");

    const approved = await decide(world.teacherLeave.id, { decision: "APPROVED", note: "Enjoy" });
    assert.equal(approved.status, 200);
    assert.equal(
      approved.body.message,
      "Leave request approved: Casual Leave, 2026-11-06 to 2026-11-09 (3 days); 3 days marked on the register"
    );
    assert.deepEqual(approved.body.data.markedDates, ["2026-11-06", "2026-11-07", "2026-11-09"]);
    const register = await get(`${HR}/staff-attendance/register?date=2026-11-09`);
    const teacherMark = register.data.employees.find(e => e.userId === teacherId());
    assert.equal(teacherMark.status, "LEAVE");
    assert.equal(teacherMark.leaveRequestId, world.teacherLeave.id);
    const twice = await decide(world.teacherLeave.id, { decision: "REJECTED", note: "No" });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.message, "This leave request is already approved");

    const own = await post(
      `${HR}/leave-requests`,
      { leaveTypeId: world.cl.id, fromDate: "2026-11-20", toDate: "2026-11-20", reason: "Conference" },
      { as: h.tokens.principal }
    );
    const self = await decide(own.data.id, { decision: "APPROVED" });
    assert.equal(self.status, 422);
    assert.equal(self.body.message, "You cannot decide on your own leave request");
    const rejected = await decide(own.data.id, { decision: "REJECTED", note: "Exams that week" }, h.tokens.admin);
    assert.equal(rejected.body.data.status, "REJECTED");
    assert.equal(rejected.body.data.decisionNote, "Exams that week");

    const byApplicant = await cancel(world.teacherLeave.id, h.tokens.teacher);
    assert.equal(byApplicant.status, 409);
    assert.equal(byApplicant.body.message, "Approved leave can only be cancelled by an HR administrator");
    assert.equal((await cancel(world.teacherLeave.id, h.tokens.teacher2)).status, 404, "others cannot see it");
    assert.equal((await cancel(world.teacherLeave.id, h.tokens.principal)).status, 403);
    const byAdmin = await cancel(world.teacherLeave.id, h.tokens.admin, { reason: "Plans changed" });
    assert.equal(byAdmin.status, 200);
    assert.deepEqual(byAdmin.body.data.clearedDates, ["2026-11-06", "2026-11-07", "2026-11-09"]);
    const cleared = await get(`${HR}/staff-attendance/register?date=2026-11-09`);
    assert.equal(cleared.data.employees.find(e => e.userId === teacherId()).status, null);
    assert.equal((await cancel(world.teacherLeave.id, h.tokens.admin)).status, 409);

    const pending = await cancel(world.teacher2Pending.id, h.tokens.teacher2);
    assert.equal(pending.body.data.status, "CANCELLED");

    const balances = await get(`${HR}/leave-balances?userId=${teacherId()}&year=2026`, { as: h.tokens.principal });
    assert.deepEqual(
      [balances.data.balances.find(b => b.code === "CL")].map(b => [b.used, b.pending, b.remaining]),
      [[0, 0, 3]]
    );
    await get(`${HR}/leave-balances?userId=${world.s1.userId}`, {}, 404);
    await get(`${HR}/leave-balances?userId=${teacherId()}`, { as: h.tokens.teacher }, 403);

    const cancelled = await get(`${HR}/leave-requests?userId=${teacherId()}&status=CANCELLED`, {
      as: h.tokens.principal
    });
    assert.equal(cancelled.meta.total, 1);
    assert.equal(cancelled.data[0].leaveType.code, "CL");
    await get(`${HR}/leave-requests`, { as: h.tokens.teacher }, 403);
    const mine = await get(`${ME}/leave-requests`, { as: h.tokens.teacher2 });
    assert.ok(mine.data.length >= 1 && mine.data.every(r => r.userId === teacher2Id()));

    const detail = await get(`${HR}/leave-requests/${world.teacherLeave.id}`, { as: h.tokens.principal });
    assert.deepEqual([detail.data.status, detail.data.cancelReason], ["CANCELLED", "Plans changed"]);
    await get(`${HR}/leave-requests/${world.teacherLeave.id}`, { as: h.tokens.teacher }, 403);
    await get(`${HR}/leave-requests/${uuid()}`, {}, 404);
  });

  it("keeps a leave type while requests for it are pending", async () => {
    const temp = (await post(`${HR}/leave-types`, { name: "Study Leave", code: "STUDY", annualQuotaDays: 5 })).data;
    const pending = await post(
      `${HR}/leave-requests`,
      { leaveTypeId: temp.id, fromDate: "2026-12-01", toDate: "2026-12-01", reason: "Exam" },
      { as: h.tokens.hrManager }
    );
    const blocked = await request("DELETE", `${HR}/leave-types/${temp.id}`);
    assert.equal(blocked.status, 409);
    assert.equal(
      blocked.body.message,
      "Study Leave has 1 pending request(s); decide or cancel them before removing it"
    );
    await post(`${HR}/leave-requests/${pending.data.id}/cancellation`, {}, { as: h.tokens.hrManager }, 200);
    const removed = await request("DELETE", `${HR}/leave-types/${temp.id}`);
    assert.equal(removed.body.message, "Leave type removed successfully");
    await post(`${HR}/leave-types`, { name: "Study Leave", code: "STUDY", annualQuotaDays: 5 }, {}, 201);
  });
});

describe("hr: payroll", () => {
  const P = HR;

  it("defines salary components", async () => {
    const add = (body, as = h.tokens.accountant) => post(`${P}/salary-components`, body, { as });
    world.hra = (
      await add({ code: "hra", name: "House Rent", kind: "EARNING", calculation: "PERCENT_OF_BASIC", defaultValue: 40 })
    ).data;
    world.ta = (
      await add({ code: "TA", name: "Transport", kind: "EARNING", calculation: "FIXED", defaultValue: 1600 })
    ).data;
    world.pf = (
      await add({
        code: "PF",
        name: "Provident Fund",
        kind: "DEDUCTION",
        calculation: "PERCENT_OF_BASIC",
        defaultValue: 12
      })
    ).data;
    world.pt = (
      await add({ code: "PT", name: "Professional Tax", kind: "DEDUCTION", calculation: "FIXED", defaultValue: 200 })
    ).data;
    world.loan = (await add({ code: "LOAN", name: "Loan recovery", kind: "DEDUCTION", calculation: "FIXED" })).data;
    assert.equal(world.hra.code, "HRA");
    assert.equal(world.loan.defaultValue, 0);

    await post(
      `${P}/salary-components`,
      { code: "BIG", name: "Big", kind: "EARNING", calculation: "PERCENT_OF_BASIC", defaultValue: 120 },
      {},
      400
    );
    await post(
      `${P}/salary-components`,
      { code: "HRA", name: "Again", kind: "EARNING", calculation: "FIXED" },
      {},
      409
    );
    await post(
      `${P}/salary-components`,
      { code: "X1", name: "X", kind: "EARNING", calculation: "FIXED" },
      { as: h.tokens.office },
      403
    );
    await get(`${P}/salary-components`, { as: h.tokens.principal }, 403);
    const earnings = await get(`${P}/salary-components?kind=EARNING`);
    assert.deepEqual(
      earnings.data.map(c => c.code),
      ["HRA", "TA"]
    );
  });

  it("stores salary revisions and returns bank account and PAN masked", async () => {
    const lines = [
      { componentId: world.hra.id },
      { componentId: world.ta.id },
      { componentId: world.pf.id },
      { componentId: world.pt.id }
    ];
    const teacher = await post(
      `${P}/employee-salaries`,
      {
        userId: teacherId(),
        effectiveFrom: "2026-06-01",
        monthlyBasic: 30000,
        lines,
        bankAccountNumber: "123456789012",
        bankIfsc: "hdfc0001234",
        panNumber: "abcde1234f"
      },
      { as: h.tokens.accountant }
    );
    assert.equal(teacher.message, "Salary revision for Fteacher Lteacher effective 2026-06-01: basic 30000");
    assert.equal(teacher.data.bankAccountNumber, "XXXXXXXX9012");
    assert.equal(teacher.data.panNumber, "XXXXXX234F");
    assert.equal(teacher.data.bankIfsc, "HDFC0001234");
    assert.deepEqual(teacher.data.lines.map(l => [l.component.code, l.value]).sort(), [
      ["HRA", 40],
      ["PF", 12],
      ["PT", 200],
      ["TA", 1600]
    ]);
    const stored = await h.pool.query("SELECT bank_account_number, pan_number FROM employee_salaries WHERE id = $1", [
      teacher.data.id
    ]);
    /* Encrypted at rest (the masked API values above prove they decrypt) */
    assert.match(stored.rows[0].bank_account_number, /^enc:v1:/);
    assert.match(stored.rows[0].pan_number, /^enc:v1:/);
    assert.doesNotMatch(JSON.stringify(stored.rows[0]), /123456789012|ABCDE1234F/i);

    await post(
      `${P}/employee-salaries`,
      { userId: teacherId(), effectiveFrom: "2026-06-01", monthlyBasic: 1 },
      {},
      409
    );
    await post(
      `${P}/employee-salaries`,
      { userId: teacherId(), effectiveFrom: "2026-06-15", monthlyBasic: 1 },
      {},
      400
    );
    await post(
      `${P}/employee-salaries`,
      { userId: world.s1.userId, effectiveFrom: "2026-06-01", monthlyBasic: 1 },
      {},
      422
    );
    await post(
      `${P}/employee-salaries`,
      { userId: teacherId(), effectiveFrom: "2026-07-01", monthlyBasic: 1, panNumber: "123" },
      {},
      400
    );
    await post(
      `${P}/employee-salaries`,
      {
        userId: teacherId(),
        effectiveFrom: "2026-07-01",
        monthlyBasic: 1,
        lines: [{ componentId: world.hra.id, value: 150 }]
      },
      {},
      422
    );

    await post(`${P}/employee-salaries`, {
      userId: teacher2Id(),
      effectiveFrom: "2026-04-01",
      monthlyBasic: 25000.5,
      lines,
      bankAccountNumber: "5550001111",
      panNumber: "PQRSX6789K"
    });
    /* A raise from October must not affect September; bank details carry over */
    const raise = await post(`${P}/employee-salaries`, {
      userId: teacher2Id(),
      effectiveFrom: "2026-10-01",
      monthlyBasic: 99999,
      lines
    });
    assert.equal(raise.data.bankAccountNumber, "XXXXXX1111");
    assert.equal(raise.data.panNumber, "XXXXXX789K");
    await post(`${P}/employee-salaries`, {
      userId: officeId(),
      effectiveFrom: "2026-09-01",
      monthlyBasic: 2000,
      lines: [{ componentId: world.loan.id, value: 5000 }]
    });

    const history = await get(`${P}/employee-salaries?userId=${teacher2Id()}`);
    assert.deepEqual(
      history.data.map(s => [s.effectiveFrom, s.bankAccountNumber]),
      [
        ["2026-10-01", "XXXXXX1111"],
        ["2026-04-01", "XXXXXX1111"]
      ]
    );
    await get(`${P}/employee-salaries`, { as: h.tokens.teacher }, 403);

    /* Components in use keep their meaning */
    await patch(`${P}/salary-components/${world.hra.id}`, { calculation: "FIXED" }, {}, 409);
    const removal = await request("DELETE", `${P}/salary-components/${world.pt.id}`);
    assert.equal(removal.status, 409);
    assert.equal(removal.body.message, "Professional Tax is used in 3 salary revision(s); it cannot be removed");
    await patch(`${P}/salary-components/${world.hra.id}`, { name: "House Rent Allowance" });
  });

  it("computes a month with exact loss of pay, leave and net pay", async () => {
    /* teacher: absent 1, 2 and 4 September, half day on 3, present on 7; paid casual leave covers the 4th */
    assert.equal(
      (
        await mark("2026-09-01", [
          { userId: teacherId(), status: "ABSENT" },
          { userId: teacher2Id(), status: "PRESENT" }
        ])
      ).status,
      201
    );
    await mark("2026-09-02", [{ userId: teacherId(), status: "ABSENT" }]);
    await mark("2026-09-03", [{ userId: teacherId(), status: "HALF_DAY" }]);
    await mark("2026-09-04", [{ userId: teacherId(), status: "ABSENT" }]);
    await mark("2026-09-07", [{ userId: teacherId(), status: "PRESENT" }]);
    const cl = await post(
      `${HR}/leave-requests`,
      { leaveTypeId: world.cl.id, fromDate: "2026-09-04", toDate: "2026-09-04", reason: "Fever" },
      { as: h.tokens.teacher }
    );
    const approvedCl = await post(
      `${HR}/leave-requests/${cl.data.id}/decision`,
      { decision: "APPROVED" },
      { as: h.tokens.principal },
      200
    );
    assert.deepEqual(approvedCl.data.markedDates, [], "the existing ABSENT mark is kept");

    /* teacher2: unpaid leave on the 8th, auto-approved half-day sick leave on the 9th, absent on the 10th */
    const lwp = await post(
      `${HR}/leave-requests`,
      { leaveTypeId: world.lwp.id, fromDate: "2026-09-08", toDate: "2026-09-08", reason: "Personal" },
      { as: h.tokens.teacher2 }
    );
    const approvedLwp = await post(`${HR}/leave-requests/${lwp.data.id}/decision`, { decision: "APPROVED" }, {}, 200);
    assert.deepEqual(approvedLwp.data.markedDates, ["2026-09-08"]);
    const sick = await post(
      `${HR}/leave-requests`,
      { leaveTypeId: world.sl.id, fromDate: "2026-09-09", toDate: "2026-09-09", halfDay: true, reason: "Dentist" },
      { as: h.tokens.teacher2 }
    );
    assert.equal(sick.message, "Leave request approved: Sick Leave, 2026-09-09 (0.5 days)");
    assert.equal(sick.data.days, 0.5);
    await mark("2026-09-10", [{ userId: teacher2Id(), status: "ABSENT" }]);
    const halfDay = await get(`${HR}/staff-attendance/register?date=2026-09-09`);
    const sickMark = halfDay.data.employees.find(e => e.userId === teacher2Id());
    assert.deepEqual([sickMark.status, sickMark.remarks], ["HALF_DAY", "Sick Leave (half day)"]);

    const run = await post(`${P}/payroll-runs`, { month: "2026-09" }, { as: h.tokens.accountant });
    assert.equal(run.data.status, "DRAFT");
    assert.equal(run.data.employeeCount, 3);
    assert.ok(run.data.withoutSalary.some(e => e.userId === world.principal.userId));
    assert.match(
      run.message,
      /^Draft payroll for September 2026 created: 3 payslip\(s\), net pay 67127\.26; \d+ employee\(s\) without a salary skipped$/
    );
    world.run = run.data;

    const slips = await get(`${P}/payroll-runs/${world.run.id}/payslips`, { as: h.tokens.accountant });
    const slipOf = userId => slips.data.find(s => s.userId === userId);

    /* 43600 earnings; LOP 2.5 days (2 absent + half day; the 4th is paid leave) = 43600 / 30 × 2.5 */
    const t1 = slipOf(teacherId());
    assert.deepEqual(
      t1.earnings.map(l => [l.code, l.amount]),
      [
        ["BASIC", 30000],
        ["HRA", 12000],
        ["TA", 1600]
      ]
    );
    assert.deepEqual(
      [t1.totalEarnings, t1.lopDays, t1.lopAmount, t1.grossPay, t1.totalDeductions, t1.netPay, t1.paidDays],
      [43600, 2.5, 3633.33, 39966.67, 3800, 36166.67, 27.5]
    );
    assert.deepEqual(t1.attendance, { PRESENT: 1, ABSENT: 3, HALF_DAY: 1, LEAVE: 0, ON_DUTY: 0 });
    assert.equal(t1.bankAccountMasked, "XXXXXXXX9012");
    assert.equal(t1.panMasked, "XXXXXX234F");
    assert.equal(t1.employeeName, "Fteacher Lteacher");

    /* 25000.50 basic: HRA 10000.20, TA 1600 = 36600.70; LOP 2 days (unpaid leave + absent) = 2440.05;
       PF 3000.06 + PT 200 */
    const t2 = slipOf(teacher2Id());
    assert.deepEqual(
      [t2.totalEarnings, t2.lopDays, t2.lopAmount, t2.grossPay, t2.totalDeductions, t2.netPay],
      [36600.7, 2, 2440.05, 34160.65, 3200.06, 30960.59]
    );
    assert.equal(t2.monthlyBasic, 25000.5, "the October raise does not apply to September");

    /* Deductions beyond gross pay never make net pay negative */
    const office = slipOf(officeId());
    assert.deepEqual([office.grossPay, office.totalDeductions, office.netPay], [2000, 5000, 0]);

    const duplicate = await request("POST", `${P}/payroll-runs`, {
      as: h.tokens.accountant,
      body: { month: "2026-09" }
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.message, "A payroll run for September 2026 already exists");
    await post(`${P}/payroll-runs`, { month: "2099-01" }, {}, 422);
    await post(`${P}/payroll-runs`, { month: "2026-13" }, {}, 400);
    await post(`${P}/payroll-runs`, { month: "2026-08" }, { as: h.tokens.principal }, 403);

    /* Two runs for the same month at once: exactly one is created */
    const racing = await Promise.all(
      [1, 2].map(() => request("POST", `${P}/payroll-runs`, { body: { month: "2026-08" } }))
    );
    assert.deepEqual(statuses(racing), [201, 409]);
    world.augustRun = racing.find(r => r.status === 201).body.data;
  });

  it("recalculates a draft in place", async () => {
    const before = (await get(`${P}/payroll-runs/${world.run.id}/payslips`)).data.find(s => s.userId === teacherId());
    await mark("2026-09-07", [{ userId: teacherId(), status: "ABSENT" }]);
    const recalculated = await post(
      `${P}/payroll-runs/${world.run.id}/recalculation`,
      {},
      { as: h.tokens.accountant },
      200
    );
    assert.match(recalculated.message, /^Payroll for September 2026 recalculated: 3 payslip\(s\)/);
    const after = (await get(`${P}/payroll-runs/${world.run.id}/payslips`)).data.find(s => s.userId === teacherId());
    assert.equal(after.id, before.id, "payslip ids are stable across recalculations");
    /* 3.5 LOP days: 43600 / 30 × 3.5 = 5086.666… */
    assert.deepEqual([after.lopDays, after.lopAmount, after.netPay], [3.5, 5086.67, 34713.33]);
  });

  it("finalizes once, then locks the run, its month and its payslips", async () => {
    const finalize = () =>
      request("POST", `${P}/payroll-runs/${world.run.id}/finalization`, { as: h.tokens.accountant });
    const racing = await Promise.all([finalize(), finalize()]);
    assert.deepEqual(statuses(racing), [200, 409]);
    const done = racing.find(r => r.status === 200).body;
    assert.equal(done.data.status, "FINALIZED");
    assert.match(done.message, /^Payroll for September 2026 finalized: 3 payslip\(s\), net pay 65673\.92$/);

    const recalc = await request("POST", `${P}/payroll-runs/${world.run.id}/recalculation`);
    assert.equal(recalc.status, 409);
    assert.equal(recalc.body.message, "Payroll for September 2026 is finalized; it can no longer be recalculated");

    const late = await mark("2026-09-11", [{ userId: teacherId(), status: "ABSENT" }]);
    assert.equal(late.status, 422);
    assert.equal(
      late.body.message,
      "Payroll for September 2026 is finalized; attendance and leave in that month can no longer change"
    );
    await post(
      `${HR}/leave-requests`,
      { leaveTypeId: world.sl.id, fromDate: "2026-09-14", toDate: "2026-09-14", reason: "x" },
      { as: h.tokens.teacher },
      422
    );

    const slips = (await get(`${P}/payroll-runs/${world.run.id}/payslips`)).data;
    assert.deepEqual(slips.map(s => s.payslipNumber).sort(), ["PSL-202609-0001", "PSL-202609-0002", "PSL-202609-0003"]);
    world.teacherSlip = slips.find(s => s.userId === teacherId());
    world.teacher2Slip = slips.find(s => s.userId === teacher2Id());

    /* A later salary revision for September leaves the finalized payslip untouched */
    await post(`${P}/employee-salaries`, { userId: teacherId(), effectiveFrom: "2026-09-01", monthlyBasic: 50000 });
    const snapshot = await get(`${P}/payslips/${world.teacherSlip.id}`, { as: h.tokens.accountant });
    assert.equal(snapshot.data.monthlyBasic, 30000);
    assert.equal(snapshot.data.netPay, 34713.33);
    assert.equal(snapshot.data.run.status, "FINALIZED");
  });

  it("shows employees only their own finalized payslips (also as PDF)", async () => {
    const mine = await get(`${ME}/payslips`, { as: h.tokens.teacher });
    assert.deepEqual(
      mine.data.map(s => [s.id, s.month]),
      [[world.teacherSlip.id, "2026-09"]],
      "the August draft is not visible"
    );
    const own = await get(`${ME}/payslips/${world.teacherSlip.id}`, { as: h.tokens.teacher });
    assert.equal(own.data.netPay, 34713.33);
    await get(`${ME}/payslips/${world.teacher2Slip.id}`, { as: h.tokens.teacher }, 404);
    await get(`${ME}/payslips/${world.teacher2Slip.id}/pdf`, { as: h.tokens.teacher }, 404);
    const draft = (await get(`${P}/payroll-runs/${world.augustRun.id}/payslips`)).data.find(
      s => s.userId === teacherId()
    );
    await get(`${ME}/payslips/${draft.id}`, { as: h.tokens.teacher }, 404);

    const pdf = await request("GET", `${ME}/payslips/${world.teacherSlip.id}/pdf`, { as: h.tokens.teacher });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.equal(pdf.buffer.subarray(0, 4).toString(), "%PDF");
    assert.match(pdf.headers.get("content-disposition"), /payslip-PSL-202609-000\d/);
    const staffPdf = await request("GET", `${P}/payslips/${world.teacher2Slip.id}/pdf`, { as: h.tokens.accountant });
    assert.equal(staffPdf.buffer.subarray(0, 4).toString(), "%PDF");

    await get(`${P}/payslips/${world.teacherSlip.id}`, { as: h.tokens.teacher }, 403);
    await get(`${P}/payslips/${world.teacherSlip.id}`, { as: h.tokens.otherAdmin }, 404);
    await get(`${ME}/payslips`, { as: h.tokens.student1 }, 403);
    await get(`${ME}/payslips`, { as: h.tokens.mother }, 403);
    await get(`${P}/payroll-runs`, { as: h.tokens.mother }, 403);
    const runs = await get(`${P}/payroll-runs?status=FINALIZED`, { as: h.tokens.accountant });
    assert.deepEqual(
      runs.data.map(r => r.month),
      ["2026-09"]
    );
  });
});
