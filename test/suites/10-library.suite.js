import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, patch, del, settleJobs, tokenFor, uuid } from "../helpers/harness.js";

const L = "/api/v1/library";
const lib = {};

const today = () => todayIn("Asia/Kolkata");
const issue = (body, as = h.tokens.office, status = 201) => post(`${L}/loans`, body, { as }, status);
const copyByAccession = async accessionNumber =>
  (await get(`${L}/copies?accessionNumber=${accessionNumber}`, { as: h.tokens.office })).data[0];

describe("library: policy and catalogue", () => {
  it("creates the default policy on first read, once, and lets librarians change it", async () => {
    const policy = await get(`${L}/policy`, { as: h.tokens.student1 });
    assert.deepEqual(
      [
        policy.data.studentLoanDays,
        policy.data.staffLoanDays,
        policy.data.maxActiveLoansStudent,
        policy.data.maxActiveLoansStaff,
        policy.data.maxRenewals,
        policy.data.finePerDay,
        policy.data.fineGraceDays
      ],
      [14, 30, 3, 10, 2, 2, 0]
    );

    /* Concurrent first reads in a school without a policy create exactly one row */
    const reads = await Promise.all([1, 2, 3].map(() => request("GET", `${L}/policy`, { as: h.tokens.otherAdmin })));
    assert.deepEqual(
      reads.map(r => r.status),
      [200, 200, 200]
    );
    const rows = await h.pool.query("SELECT count(*) FROM library_policies WHERE tenant_id = $1", [h.otherTenant.id]);
    assert.equal(Number(rows.rows[0].count), 1);

    await patch(`${L}/policy`, { fineGraceDays: 1 }, { as: h.tokens.teacher }, 403);
    await patch(`${L}/policy`, {}, { as: h.tokens.office }, 400);
    await patch(`${L}/policy`, { finePerDay: 1.234 }, { as: h.tokens.office }, 400);
    await patch(`${L}/policy`, { studentLoanDays: 0 }, { as: h.tokens.office }, 400);
    const updated = await patch(`${L}/policy`, { finePerDay: 2.5, fineGraceDays: 2 }, { as: h.tokens.office });
    assert.equal(updated.data.finePerDay, 2.5);
    assert.equal(updated.data.fineGraceDays, 2);
    assert.equal(updated.message, "Library policy updated successfully");
  });

  it("validates ISBN-10/13 checksums and keeps ISBNs unique per school", async () => {
    const hobbit = await post(
      `${L}/books`,
      {
        title: "The Hobbit",
        authors: ["J. R. R. Tolkien"],
        isbn: "978-0-306-40615-7",
        category: "Fiction",
        shelfLocation: "F-12"
      },
      { as: h.tokens.office }
    );
    assert.equal(hobbit.data.isbn, "9780306406157");
    assert.deepEqual(hobbit.data.copies, { total: 0, available: 0, issued: 0, lost: 0, damaged: 0, withdrawn: 0 });
    lib.hobbit = hobbit.data;

    lib.maths = (
      await post(
        `${L}/books`,
        { title: "Mathematics Made Easy", authors: ["K. Rao"], isbn: "0 306 40615 2", subjectId: world.math.id },
        { as: h.tokens.office }
      )
    ).data;
    assert.equal(lib.maths.isbn, "0306406152");
    assert.equal(lib.maths.subject.subjectCode, world.math.subjectCode);

    /* ISBN-10 whose check digit is X */
    lib.wings = (
      await post(
        `${L}/books`,
        { title: "Wings of Fire", authors: ["A. P. J. Abdul Kalam", "Arun Tiwari"], isbn: "0-8044-2957-x" },
        { as: h.tokens.office }
      )
    ).data;
    assert.equal(lib.wings.isbn, "080442957X");

    const badChecksum = await request("POST", `${L}/books`, {
      as: h.tokens.office,
      body: { title: "Bad", isbn: "978-0-306-40615-8" }
    });
    assert.equal(badChecksum.status, 400);
    assert.equal(badChecksum.body.message, "Invalid request: isbn must be a valid ISBN-10 or ISBN-13");
    await post(`${L}/books`, { title: "Bad", isbn: "12345" }, { as: h.tokens.office }, 400);
    await post(`${L}/books`, { title: "Bad", isbn: "0306406153" }, { as: h.tokens.office }, 400);

    const duplicate = await request("POST", `${L}/books`, {
      as: h.tokens.office,
      body: { title: "Another Hobbit", isbn: "9780306406157" }
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.message, "A book with ISBN 9780306406157 is already in the catalogue: The Hobbit");
    await patch(`${L}/books/${lib.wings.id}`, { isbn: "9780306406157" }, { as: h.tokens.office }, 409);

    await post(`${L}/books`, { title: "No subject", subjectId: uuid() }, { as: h.tokens.office }, 422);
    await post(`${L}/books`, { title: "Teacher's book" }, { as: h.tokens.teacher }, 403);
    await post(`${L}/books`, { authors: ["Nobody"] }, { as: h.tokens.office }, 400);
  });

  it("lets every role search the catalogue", async () => {
    const byTitle = await get(`${L}/books?q=hobbit`, { as: h.tokens.student1 });
    assert.deepEqual(
      byTitle.data.map(b => b.title),
      ["The Hobbit"]
    );
    const byAuthor = await get(`${L}/books?q=kalam`, { as: h.tokens.mother });
    assert.deepEqual(
      byAuthor.data.map(b => b.title),
      ["Wings of Fire"]
    );
    const byIsbn = await get(`${L}/books?q=978-0-306`, { as: h.tokens.teacher });
    assert.deepEqual(
      byIsbn.data.map(b => b.title),
      ["The Hobbit"]
    );
    assert.equal((await get(`${L}/books?q=%25`, { as: h.tokens.accountant })).meta.total, 0, "% matches literally");
    assert.equal((await get(`${L}/books?category=Fiction`)).meta.total, 1);
    assert.equal((await get(`${L}/books?subjectId=${world.math.id}`)).data[0].id, lib.maths.id);
    assert.equal((await get(`${L}/books?available=true`)).meta.total, 0, "no copies yet");
    await get(`${L}/books?available=maybe`, {}, 400);

    /* Other schools see nothing */
    await get(`${L}/books/${lib.hobbit.id}`, { as: h.tokens.otherAdmin }, 404);
  });

  it("adds copies in bulk with sequential accession numbers", async () => {
    const added = await post(
      `${L}/books/${lib.hobbit.id}/copies`,
      { count: 3, price: 350, acquiredOn: "2026-06-01" },
      { as: h.tokens.office }
    );
    assert.equal(added.message, "3 copies of The Hobbit added (ACC-000001 to ACC-000003)");
    assert.deepEqual(
      added.data.map(c => [c.accessionNumber, c.status, c.price]),
      [
        ["ACC-000001", "AVAILABLE", 350],
        ["ACC-000002", "AVAILABLE", 350],
        ["ACC-000003", "AVAILABLE", 350]
      ]
    );
    const maths = await post(`${L}/books/${lib.maths.id}/copies`, { count: 2, price: 200 }, { as: h.tokens.office });
    assert.deepEqual(
      maths.data.map(c => c.accessionNumber),
      ["ACC-000004", "ACC-000005"]
    );
    const wings = await post(`${L}/books/${lib.wings.id}/copies`, { count: 3 }, { as: h.tokens.office });
    assert.deepEqual(
      wings.data.map(c => [c.accessionNumber, c.price]),
      [
        ["ACC-000006", null],
        ["ACC-000007", null],
        ["ACC-000008", null]
      ]
    );

    await post(`${L}/books/${lib.hobbit.id}/copies`, { count: 0 }, { as: h.tokens.office }, 400);
    await post(`${L}/books/${lib.hobbit.id}/copies`, { count: 101 }, { as: h.tokens.office }, 400);
    await post(`${L}/books/${lib.hobbit.id}/copies`, { count: 1, price: -5 }, { as: h.tokens.office }, 400);
    await post(`${L}/books/${uuid()}/copies`, { count: 1 }, { as: h.tokens.office }, 404);
    await post(`${L}/books/${lib.hobbit.id}/copies`, { count: 1 }, { as: h.tokens.teacher }, 403);

    const detail = await get(`${L}/books/${lib.hobbit.id}`, { as: h.tokens.student1 });
    assert.deepEqual(detail.data.copies, { total: 3, available: 3, issued: 0, lost: 0, damaged: 0, withdrawn: 0 });
    assert.equal((await get(`${L}/books?available=true`)).meta.total, 3);

    const listed = await get(`${L}/books/${lib.hobbit.id}/copies`, { as: h.tokens.student1 });
    assert.equal(listed.meta.total, 3);
    const found = await get(`${L}/copies?accessionNumber=acc-000002`, { as: h.tokens.office });
    assert.equal(found.meta.total, 1);
    assert.equal(found.data[0].book.title, "The Hobbit");
    await get(`${L}/copies?accessionNumber=12`, { as: h.tokens.office }, 400);
  });

  it("edits copies: barcodes are unique, ISSUED is not set by hand", async () => {
    const acc1 = await copyByAccession("ACC-000001");
    const acc3 = await copyByAccession("ACC-000003");
    lib.acc = { 1: acc1 };
    const tagged = await patch(`${L}/copies/${acc1.id}`, { barcode: "LIB-0001" }, { as: h.tokens.office });
    assert.equal(tagged.message, "Copy ACC-000001 updated successfully");
    const clash = await request("PATCH", `${L}/copies/${acc3.id}`, {
      as: h.tokens.office,
      body: { barcode: "LIB-0001" }
    });
    assert.equal(clash.status, 409);
    assert.equal(clash.body.message, "Barcode LIB-0001 is already used by copy ACC-000001");
    assert.equal((await get(`${L}/copies?barcode=LIB-0001`, { as: h.tokens.office })).data[0].id, acc1.id);

    await patch(`${L}/copies/${acc3.id}`, { status: "ISSUED" }, { as: h.tokens.office }, 400);
    await patch(`${L}/copies/${acc3.id}`, { status: "DAMAGED" }, { as: h.tokens.teacher }, 403);

    const acc8 = await copyByAccession("ACC-000008");
    lib.acc[8] = acc8;
    await patch(
      `${L}/copies/${acc8.id}`,
      { status: "WITHDRAWN", conditionNotes: "Water damage" },
      { as: h.tokens.office }
    );
    const wings = await get(`${L}/books/${lib.wings.id}`);
    assert.deepEqual(wings.data.copies, { total: 2, available: 2, issued: 0, lost: 0, damaged: 0, withdrawn: 1 });
  });
});

describe("library: circulation", () => {
  it("issues a book for the policy's loan period", async () => {
    const loan = await issue({ copyId: lib.acc[1].id, borrowerUserId: world.s1.userId });
    assert.equal(loan.message, `The Hobbit (ACC-000001) issued to Fstudent1 Lstudent1. Due ${addDays(today(), 14)}`);
    assert.equal(loan.data.status, "ISSUED");
    assert.equal(loan.data.issuedOn, today());
    assert.equal(loan.data.borrowerRole, "STUDENT");
    assert.equal(loan.data.copy.status, "ISSUED");
    assert.equal(loan.data.isOverdue, false);
    lib.s1Hobbit = loan.data;

    /* Staff borrow for longer; the copy can be scanned by accession number */
    const staffLoan = await issue({ accessionNumber: "acc-000006", borrowerUserId: world.teacher.userId });
    assert.equal(staffLoan.data.dueDate, addDays(today(), 30));
    assert.equal(staffLoan.data.borrower.name, "Fteacher Lteacher");
    lib.teacherWings = staffLoan.data;

    const detail = await get(`${L}/books/${lib.hobbit.id}`);
    assert.deepEqual([detail.data.copies.available, detail.data.copies.issued], [2, 1]);
  });

  it("refuses issues that break the rules", async () => {
    /* Teachers cannot issue books */
    await issue({ copyId: lib.acc[1].id, borrowerUserId: world.s2.userId }, h.tokens.teacher, 403);
    await issue({ copyId: lib.acc[1].id, borrowerUserId: world.s2.userId }, h.tokens.student1, 403);

    const onLoan = await request("POST", `${L}/loans`, {
      as: h.tokens.office,
      body: { copyId: lib.acc[1].id, borrowerUserId: world.s2.userId }
    });
    assert.equal(onLoan.status, 409);
    assert.equal(onLoan.body.message, "Copy ACC-000001 is already on loan");

    const sameBook = await request("POST", `${L}/loans`, {
      as: h.tokens.office,
      body: { accessionNumber: "ACC-000002", borrowerUserId: world.s1.userId }
    });
    assert.equal(sameBook.status, 422);
    assert.equal(sameBook.body.message, "Fstudent1 Lstudent1 already has a copy of this book on loan");

    const mother = await get(`/api/v1/users/parents/${world.motherId}`);
    lib.motherUserId = mother.data.userId;
    const parent = await request("POST", `${L}/loans`, {
      as: h.tokens.office,
      body: { accessionNumber: "ACC-000002", borrowerUserId: lib.motherUserId }
    });
    assert.equal(parent.status, 422);
    assert.equal(parent.body.message, "Parents cannot borrow books; issue them to the student instead");

    const withdrawn = await request("POST", `${L}/loans`, {
      as: h.tokens.office,
      body: { accessionNumber: "ACC-000008", borrowerUserId: world.s2.userId }
    });
    assert.equal(withdrawn.status, 422);
    assert.equal(withdrawn.body.message, "Copy ACC-000008 is withdrawn and cannot be issued");

    await issue({ accessionNumber: "ACC-000099", borrowerUserId: world.s2.userId }, h.tokens.office, 422);
    await issue({ accessionNumber: "ACC-000002", borrowerUserId: uuid() }, h.tokens.office, 422);
    await issue({ borrowerUserId: world.s2.userId }, h.tokens.office, 400);
    await issue(
      { copyId: lib.acc[1].id, accessionNumber: "ACC-000002", borrowerUserId: world.s2.userId },
      h.tokens.office,
      400
    );
    await issue(
      { accessionNumber: "ACC-000002", borrowerUserId: world.s2.userId, dueDate: addDays(today(), 400) },
      h.tokens.office,
      422
    );

    /* A copy on loan only changes status through a return */
    const busy = await request("PATCH", `${L}/copies/${lib.acc[1].id}`, {
      as: h.tokens.office,
      body: { status: "WITHDRAWN" }
    });
    assert.equal(busy.status, 422);
    assert.equal(busy.body.message, "Copy ACC-000001 is on loan; record its return instead");
  });

  it("issues a copy to exactly one of two concurrent requests", async () => {
    const acc4 = await copyByAccession("ACC-000004");
    const results = await Promise.all(
      [world.s2, world.s3].map(student =>
        request("POST", `${L}/loans`, {
          as: h.tokens.office,
          body: { copyId: acc4.id, borrowerUserId: student.userId }
        })
      )
    );
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    const open = await h.pool.query("SELECT count(*) FROM library_loans WHERE copy_id = $1 AND status = 'ISSUED'", [
      acc4.id
    ]);
    assert.equal(Number(open.rows[0].count), 1);
    assert.equal((await copyByAccession("ACC-000004")).status, "ISSUED");
  });

  it("enforces the active-loan limit, also under concurrency", async () => {
    await patch(`${L}/policy`, { maxActiveLoansStudent: 2 }, { as: h.tokens.office });
    /* s1 has one book; two concurrent issues may not take them past 2 */
    const results = await Promise.all(
      ["ACC-000005", "ACC-000007"].map(accessionNumber =>
        request("POST", `${L}/loans`, {
          as: h.tokens.office,
          body: { accessionNumber, borrowerUserId: world.s1.userId }
        })
      )
    );
    assert.deepEqual(results.map(r => r.status).sort(), [201, 422]);
    const refused = results.find(r => r.status === 422);
    assert.equal(
      refused.body.message,
      "Fstudent1 Lstudent1 already has 2 book(s) on loan, the limit for students is 2"
    );
    await patch(`${L}/policy`, { maxActiveLoansStudent: 3 }, { as: h.tokens.office });
  });

  it("renews up to the policy's limit", async () => {
    const short = await issue({
      accessionNumber: "ACC-000003",
      borrowerUserId: world.s2.userId,
      dueDate: addDays(today(), 1)
    });
    const url = `${L}/loans/${short.data.id}/renewal`;
    const renewed = await post(url, {}, { as: h.tokens.office }, 200);
    assert.equal(renewed.data.dueDate, addDays(today(), 14));
    assert.equal(renewed.data.renewalCount, 1);
    assert.equal(renewed.message, `Loan renewed. Due ${addDays(today(), 14)} (renewal 1)`);
    await post(url, {}, { as: h.tokens.teacher }, 403);

    await patch(`${L}/policy`, { maxRenewals: 1 }, { as: h.tokens.office });
    const limit = await request("POST", url, { as: h.tokens.office });
    assert.equal(limit.status, 422);
    assert.equal(limit.body.message, "This loan has already been renewed 1 time(s), the most the library allows");

    await patch(`${L}/policy`, { maxRenewals: 2 }, { as: h.tokens.office });
    const noGain = await request("POST", url, { as: h.tokens.office });
    assert.equal(noGain.status, 422);
    assert.equal(noGain.body.message, `Renewing today would not extend the due date (${addDays(today(), 14)})`);

    const back = await post(`${L}/loans/${short.data.id}/return`, {}, { as: h.tokens.office }, 200);
    assert.equal(back.data.status, "RETURNED");
    assert.equal(back.data.fineTotal, 0);
    assert.equal(back.message, "The Hobbit (ACC-000003) returned by Fstudent2 Lstudent2. No fine");
    await post(url, {}, { as: h.tokens.office }, 422);
  });

  it("charges late fines after the grace days, and does not renew overdue loans", async () => {
    /* A loan recorded with a past due date: 5 days late, 2 grace days, 2.50 a day */
    const late = await issue({
      accessionNumber: "ACC-000003",
      borrowerUserId: world.s2.userId,
      dueDate: addDays(today(), -5)
    });
    lib.lateLoan = late.data;
    assert.equal(late.data.isOverdue, true);
    assert.equal(late.data.daysOverdue, 5);
    assert.equal(late.data.fineAccrued, 7.5);
    assert.equal(late.data.fineOutstanding, 0, "assessed on return");

    const overdue = await get(`${L}/loans?overdue=true`, { as: h.tokens.office });
    assert.deepEqual(
      overdue.data.map(l => l.id),
      [late.data.id]
    );
    assert.equal(overdue.data[0].book.title, "The Hobbit");
    assert.equal(overdue.data[0].copy.accessionNumber, "ACC-000003");
    assert.equal(overdue.data[0].borrower.name, "Fstudent2 Lstudent2");

    const renewal = await request("POST", `${L}/loans/${late.data.id}/renewal`, { as: h.tokens.office });
    assert.equal(renewal.status, 422);
    assert.equal(
      renewal.body.message,
      `This loan is overdue (due ${addDays(today(), -5)}); the book must be returned, not renewed`
    );

    const returned = await post(`${L}/loans/${late.data.id}/return`, { condition: "OK" }, { as: h.tokens.office }, 200);
    assert.equal(returned.message, "The Hobbit (ACC-000003) returned by Fstudent2 Lstudent2. Fine due: 7.50");
    assert.equal(returned.data.returnedOn, today());
    assert.equal(returned.data.lateFine, 7.5);
    assert.equal(returned.data.fineOutstanding, 7.5);
    assert.equal(returned.data.isOverdue, false);
    assert.equal(returned.data.copy.status, "AVAILABLE");

    const again = await request("POST", `${L}/loans/${late.data.id}/return`, { as: h.tokens.office, body: {} });
    assert.equal(again.status, 409);
    assert.equal(again.body.message, `This loan was already closed on ${today()}`);
    await post(`${L}/loans/${uuid()}/return`, {}, { as: h.tokens.office }, 404);
    await post(`${L}/loans/${late.data.id}/return`, { condition: "BURNT" }, { as: h.tokens.office }, 400);
  });

  it("takes partial fine payments and lets management waive the rest", async () => {
    const url = `${L}/loans/${lib.lateLoan.id}`;
    const open = await request("POST", `${L}/loans/${lib.s1Hobbit.id}/fine-payment`, {
      as: h.tokens.office,
      body: { amount: 1, method: "CASH" }
    });
    assert.equal(open.status, 422);
    assert.equal(open.body.message, "The fine is assessed when the book is returned; record the return first");

    const paid = await post(`${url}/fine-payment`, { amount: 5, method: "CASH" }, { as: h.tokens.office });
    assert.equal(paid.message, "Fine payment of 5.00 received. Receipt LIBR-000001. Outstanding 2.50");
    assert.equal(paid.data.receiptNumber, "LIBR-000001");
    assert.equal(paid.data.loan.finePaid, 5);
    assert.equal(paid.data.loan.fineOutstanding, 2.5);

    const tooMuch = await request("POST", `${url}/fine-payment`, {
      as: h.tokens.office,
      body: { amount: 3, method: "UPI" }
    });
    assert.equal(tooMuch.status, 422);
    assert.equal(tooMuch.body.message, "The amount exceeds the outstanding fine of 2.50");
    await post(`${url}/fine-payment`, { amount: 0, method: "CASH" }, { as: h.tokens.office }, 400);
    await post(`${url}/fine-payment`, { amount: 1.005, method: "CASH" }, { as: h.tokens.office }, 400);
    await post(`${url}/fine-payment`, { amount: 1, method: "CHEQUE" }, { as: h.tokens.office }, 400);
    await post(`${url}/fine-payment`, { amount: 1, method: "CASH" }, { as: h.tokens.teacher }, 403);

    /* Waivers are for ADMIN and PRINCIPAL only */
    await post(`${url}/fine-waiver`, { reason: "Hardship" }, { as: h.tokens.office }, 403);
    await post(`${url}/fine-waiver`, {}, { as: h.tokens.principal }, 400);
    const waived = await post(`${url}/fine-waiver`, { reason: "Hardship" }, { as: h.tokens.principal }, 200);
    assert.equal(waived.message, "Fine of 2.50 waived for The Hobbit");
    assert.equal(waived.data.fineOutstanding, 0);
    assert.equal(waived.data.waiverReason, "Hardship");
    await post(`${url}/fine-waiver`, { reason: "Again" }, { as: h.tokens.principal }, 422);
    await post(`${url}/fine-payment`, { amount: 1, method: "CASH" }, { as: h.tokens.office }, 422);

    const detail = await get(url, { as: h.tokens.principal });
    assert.deepEqual(
      [detail.data.fineTotal, detail.data.finePaid, detail.data.fineWaived, detail.data.fineOutstanding],
      [7.5, 5, 2.5, 0]
    );
    assert.deepEqual(
      detail.data.payments.map(p => [p.amount, p.method, p.receiptNumber]),
      [[5, "CASH", "LIBR-000001"]]
    );
  });

  it("adds the copy's price to the fine when a book is lost", async () => {
    const loan = await issue({
      accessionNumber: "ACC-000002",
      borrowerUserId: world.s3.userId,
      dueDate: addDays(today(), -3)
    });
    const lost = await post(`${L}/loans/${loan.data.id}/return`, { condition: "LOST" }, { as: h.tokens.office }, 200);
    assert.equal(lost.data.status, "LOST");
    assert.equal(lost.data.lateFine, 2.5, "(3 - 2 grace days) x 2.50");
    assert.equal(lost.data.lostCharge, 350);
    assert.equal(lost.data.fineOutstanding, 352.5);
    assert.equal(lost.data.copy.status, "LOST");
    assert.equal(
      lost.message,
      "The Hobbit (ACC-000002) recorded as lost. Fine due: 352.50 (late 2.50 + replacement 350.00)"
    );

    const book = await get(`${L}/books/${lib.hobbit.id}`);
    assert.deepEqual(book.data.copies, { total: 3, available: 1, issued: 1, lost: 1, damaged: 0, withdrawn: 0 });
    assert.equal((await get(`${L}/loans?status=LOST&withFine=true`, { as: h.tokens.office })).meta.total, 1);

    /* A damaged return takes the copy off the shelf, without a fine when on time */
    const damaged = await post(
      `${L}/loans/${lib.teacherWings.id}/return`,
      { condition: "DAMAGED", notes: "Torn cover" },
      { as: h.tokens.office },
      200
    );
    assert.equal(damaged.message, "Wings of Fire (ACC-000006) returned damaged by Fteacher Lteacher. No fine");
    assert.equal(damaged.data.copy.status, "DAMAGED");
    assert.equal(damaged.data.fineOutstanding, 0);
  });

  it("lists loans with filters for librarians and the principal only", async () => {
    const s1 = await get(`${L}/loans?borrowerUserId=${world.s1.userId}&status=ISSUED`, { as: h.tokens.office });
    assert.equal(s1.meta.total, 2);
    const hobbit = await get(`${L}/loans?bookId=${lib.hobbit.id}`, { as: h.tokens.principal });
    assert.equal(hobbit.meta.total, 4);
    await get(`${L}/loans`, { as: h.tokens.teacher }, 403);
    await get(`${L}/loans`, { as: h.tokens.student1 }, 403);
    await get(`${L}/loans/${lib.lateLoan.id}`, { as: h.tokens.mother }, 403);
    await get(`${L}/loans?overdue=yes`, { as: h.tokens.office }, 400);
  });

  it("shows each person their own loans, and parents their children's only", async () => {
    const mine = await get(`${L}/my-loans`, { as: h.tokens.student1 });
    assert.equal(mine.meta.total, 2);
    assert.ok(mine.data.every(l => l.borrowerUserId === world.s1.userId));

    const family = await get(`${L}/my-loans?limit=100`, { as: h.tokens.mother });
    const borrowers = new Set(family.data.map(l => l.borrowerUserId));
    assert.ok(borrowers.has(world.s1.userId) && borrowers.has(world.s2.userId));
    assert.ok(!borrowers.has(world.s3.userId), "not someone else's child");
    assert.ok(family.data.some(l => l.fineTotal === 7.5));
    const familyOpen = await get(`${L}/my-loans?status=ISSUED&limit=100`, { as: h.tokens.mother });
    assert.ok(familyOpen.data.every(l => l.status === "ISSUED"));

    const teacher = await get(`${L}/my-loans`, { as: h.tokens.teacher });
    assert.deepEqual(
      teacher.data.map(l => l.id),
      [lib.teacherWings.id]
    );
    assert.equal((await get(`${L}/my-loans`, { as: h.tokens.office })).meta.total, 0);
  });

  it("reminds borrowers of overdue books once a day", async () => {
    await issue({ accessionNumber: "ACC-000003", borrowerUserId: world.s3.userId, dueDate: addDays(today(), -4) });
    const s3Token = tokenFor(world.s3.userId, "STUDENT");

    for (let run = 0; run < 2; run++) {
      await h.modules.jobs.enqueue("library.overdueReminders");
      await settleJobs();
    }
    const inbox = async token =>
      (await get("/api/v1/me/notifications?type=MESSAGE&limit=100", { as: token })).data.filter(n =>
        n.title.startsWith("Library book overdue")
      );
    const reminders = await inbox(s3Token);
    assert.equal(reminders.length, 1);
    assert.equal(reminders[0].title, "Library book overdue: The Hobbit");
    assert.equal(
      reminders[0].body,
      `The Hobbit (ACC-000003) was due on ${addDays(today(), -4)} and is 4 day(s) overdue. ` +
        "Please return it to the library. Fine so far: 5.00."
    );
    assert.equal((await inbox(h.tokens.student1)).length, 0, "s1's books are not overdue");
  });
});

describe("library: removing books", () => {
  it("removes a book and its copies, but not while copies are on loan", async () => {
    const busy = await request("DELETE", `${L}/books/${lib.hobbit.id}`, { as: h.tokens.office });
    assert.equal(busy.status, 409);
    assert.equal(
      busy.body.message,
      "2 copy(ies) of The Hobbit are on loan; they must be returned before the book is removed"
    );

    const draft = (await post(`${L}/books`, { title: "Duplicate entry" }, { as: h.tokens.office })).data;
    await post(`${L}/books/${draft.id}/copies`, { count: 2 }, { as: h.tokens.office });
    await del(`${L}/books/${draft.id}`, { as: h.tokens.teacher }, 403);
    assert.equal((await del(`${L}/books/${draft.id}`, { as: h.tokens.office })).message, "Book removed successfully");
    await get(`${L}/books/${draft.id}`, {}, 404);
    assert.equal((await get(`${L}/copies?bookId=${draft.id}`, { as: h.tokens.office })).meta.total, 0);
    /* Accession numbers are never reused */
    const next = await post(`${L}/books/${lib.maths.id}/copies`, { count: 1 }, { as: h.tokens.office });
    assert.equal(next.data[0].accessionNumber, "ACC-000011");
  });
});
