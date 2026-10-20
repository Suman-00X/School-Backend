import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, daysBetween, todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, patch, del, settleJobs, tokenFor, uuid } from "../helpers/harness.js";

const L = "/api/v1/library";
const lib = {};

const today = () => todayIn("Asia/Kolkata");
const issue = (body, as = h.tokens.librarian, status = 201) => post(`${L}/loans`, body, { as }, status);
const giveBack = (loanId, body = {}) => post(`${L}/loans/${loanId}/return`, body, { as: h.tokens.librarian }, 200);
const copyByAccession = async accessionNumber =>
  (await get(`${L}/copies?accessionNumber=${accessionNumber}`, { as: h.tokens.librarian })).data[0];
const policy = changes => patch(`${L}/policy`, changes, { as: h.tokens.librarian });
const rule = (ruleId, changes) => patch(`${L}/circulation-rules/${ruleId}`, changes, { as: h.tokens.librarian });
const hold = async holdId => (await get(`${L}/holds/${holdId}`, { as: h.tokens.librarian })).data;
const credit = async userId => (await get(`${L}/borrowers/${userId}/account`, { as: h.tokens.librarian })).data.credit;

/* The school calendar, as the academics module computes it */
const openDays = async (from, to) =>
  (await get(`/api/v1/academics/calendar/working-days?from=${from}&to=${to}`)).data.workingDays;
/* A due date on a closed day (Sunday, holiday) moves to the next open day */
const nextOpen = async date => (await openDays(date, addDays(date, 30)))[0];
const late = due => daysBetween(due, today());
const money = n => Math.round(n * 100) / 100;

const inbox = async (token, prefix) => {
  await settleJobs();
  return (await get("/api/v1/me/notifications?type=MESSAGE&limit=100", { as: token })).data.filter(n =>
    n.title.startsWith(prefix)
  );
};

const lockWaiters = async () =>
  Number(
    (
      await h.pool.query(
        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
      )
    ).rows[0].count
  );

/* Hold a lock from another connection, fire the requests, check both wait on it, release */
const whileLocked = async (lockSql, params, requests) => {
  const holder = await h.pool.connect();
  try {
    await holder.query("BEGIN");
    await holder.query(lockSql, params);
    const pending = Promise.all(requests.map(fire => fire()));
    for (let i = 0; i < 300 && (await lockWaiters()) < requests.length; i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(await lockWaiters(), requests.length, "every request waits for the lock");
    await holder.query("COMMIT");
    return await pending;
  } finally {
    /* Discard the connection, so a failed assertion cannot leave the lock held */
    holder.release(true);
  }
};

describe("library: policy, circulation rules and catalogue", () => {
  it("creates the policy and the default rules on first read, once, and lets librarians change it", async () => {
    const settings = await get(`${L}/policy`, { as: h.tokens.student1 });
    assert.deepEqual(
      [
        settings.data.fineBlockThreshold,
        settings.data.blockOnFines,
        settings.data.blockOnOverdue,
        settings.data.fineDayBasis,
        settings.data.lostFoundRefundDays,
        settings.data.holdPickupDays,
        settings.data.notifyParents
      ],
      [null, true, true, "ACADEMIC_DAYS", 30, 3, true]
    );
    /* Blocks are on, but the fine limit is each school's own: asked for until set */
    assert.deepEqual(settings.data.setupNeeded, ["fineBlockThreshold"]);
    assert.match(settings.message, /Set fineBlockThreshold: until the school sets its own limit, fines do not block/);

    /* Concurrent first reads in a school without a policy create exactly one policy and its rules */
    const reads = await Promise.all([1, 2, 3].map(() => request("GET", `${L}/policy`, { as: h.tokens.otherAdmin })));
    assert.deepEqual(
      reads.map(r => r.status),
      [200, 200, 200]
    );
    const count = async table =>
      Number(
        (await h.otherPool.query(`SELECT count(*) FROM ${table} WHERE tenant_id = $1`, [h.otherTenant.id])).rows[0]
          .count
      );
    assert.equal(await count("library_policies"), 1);
    assert.equal(await count("library_circulation_rules"), 2);

    await patch(`${L}/policy`, { holdPickupDays: 2 }, { as: h.tokens.teacher }, 403);
    await patch(`${L}/policy`, {}, { as: h.tokens.librarian }, 400);
    await patch(`${L}/policy`, { lostProcessingFee: 1.234 }, { as: h.tokens.librarian }, 400);
    await patch(`${L}/policy`, { holdPickupDays: 0 }, { as: h.tokens.librarian }, 400);
    /* Plain calendar days for fines until the closed-day rule is tested */
    await patch(`${L}/policy`, { fineDayBasis: "SCHOOL_DAYS" }, { as: h.tokens.librarian }, 400);
    const updated = await policy({
      fineBlockThreshold: 100,
      fineDayBasis: "CALENDAR_DAYS",
      lostProcessingFee: 50,
      lostMinimumCharge: 100
    });
    assert.deepEqual([updated.data.fineBlockThreshold, updated.data.setupNeeded], [100, []]);
    assert.equal(updated.data.fineDayBasis, "CALENDAR_DAYS");
    assert.equal(updated.data.lostProcessingFee, 50);
    assert.equal(updated.message, "Library policy updated successfully");
  });

  it("keeps circulation rules per borrower category and item type", async () => {
    const rules = await get(`${L}/circulation-rules`, { as: h.tokens.student1 });
    assert.deepEqual(
      rules.data.map(r => [r.appliesTo, r.loanDays, r.maxLoans, r.maxRenewals, r.finePerDay]),
      [
        ["everyone borrowing any item", 30, 10, 2, 2],
        ["students borrowing any item", 14, 3, 2, 2]
      ]
    );
    lib.studentRule = rules.data[1];

    const terms = { loanDays: 7, maxLoans: 1, maxRenewals: 0, finePerDay: 5 };
    await post(`${L}/circulation-rules`, { borrowerRole: "STUDENT", ...terms }, { as: h.tokens.teacher }, 403);
    const reference = await request("POST", `${L}/circulation-rules`, {
      as: h.tokens.librarian,
      body: { borrowerRole: "STUDENT", itemType: "REFERENCE", ...terms }
    });
    assert.equal(reference.status, 400, "reference items are never lent");
    const teacherClass = await request("POST", `${L}/circulation-rules`, {
      as: h.tokens.librarian,
      body: { borrowerRole: "TEACHER", classId: world.c1.id, ...terms }
    });
    assert.equal(teacherClass.status, 422);
    assert.equal(teacherClass.body.message, "A rule for a class applies to students; set borrowerRole to STUDENT");
    await post(
      `${L}/circulation-rules`,
      { borrowerRole: "STUDENT", classId: uuid(), ...terms },
      { as: h.tokens.librarian },
      422
    );
    const duplicate = await request("POST", `${L}/circulation-rules`, {
      as: h.tokens.librarian,
      body: { borrowerRole: "STUDENT", ...terms }
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.message, "A circulation rule for students borrowing any item already exists");

    const media = await post(
      `${L}/circulation-rules`,
      { borrowerRole: "STUDENT", itemType: "MEDIA", ...terms, maxFine: 50 },
      { as: h.tokens.librarian }
    );
    assert.equal(media.message, "Circulation rule for students borrowing media created: 7 days, 1 at a time");
    lib.mediaRule = media.data;

    const classRule = await post(
      `${L}/circulation-rules`,
      { borrowerRole: "STUDENT", classId: world.c2.id, loanDays: 21, maxLoans: 4, maxRenewals: 1, finePerDay: 1 },
      { as: h.tokens.librarian }
    );
    assert.equal(classRule.data.appliesTo, `${world.c2.className} students borrowing any item`);
    await patch(`${L}/circulation-rules/${classRule.data.id}`, { loanDays: 0 }, { as: h.tokens.librarian }, 400);
    assert.equal((await rule(classRule.data.id, { maxLoans: 3 })).data.maxLoans, 3);

    const temporary = await post(
      `${L}/circulation-rules`,
      { borrowerRole: "TEACHER", itemType: "PERIODICAL", loanDays: 3, maxLoans: 2, maxRenewals: 0, finePerDay: 1 },
      { as: h.tokens.librarian }
    );
    const removed = await del(`${L}/circulation-rules/${temporary.data.id}`, { as: h.tokens.librarian });
    assert.equal(removed.message, "Circulation rule for teachers borrowing periodicals removed");
    assert.equal((await get(`${L}/circulation-rules`, { as: h.tokens.librarian })).meta.total, 4);
  });

  it("validates ISBN-10/13 checksums and keeps ISBNs unique per school", async () => {
    const hobbit = await post(
      `${L}/books`,
      {
        title: "The Hobbit",
        authors: ["J. R. R. Tolkien"],
        isbn: "978-0-306-40615-7",
        category: "Fiction",
        shelfLocation: "F-12",
        internalNotes: "Donated by the PTA"
      },
      { as: h.tokens.librarian }
    );
    assert.equal(hobbit.data.isbn, "9780306406157");
    assert.equal(hobbit.data.itemType, "BOOK");
    assert.deepEqual(hobbit.data.copies, {
      total: 0,
      available: 0,
      issued: 0,
      onHold: 0,
      lost: 0,
      damaged: 0,
      withdrawn: 0,
      missing: 0
    });
    lib.hobbit = hobbit.data;

    lib.maths = (
      await post(
        `${L}/books`,
        { title: "Mathematics Made Easy", authors: ["K. Rao"], isbn: "0 306 40615 2", subjectId: world.math.id },
        { as: h.tokens.librarian }
      )
    ).data;
    assert.equal(lib.maths.isbn, "0306406152");
    assert.equal(lib.maths.subject.subjectCode, world.math.subjectCode);

    /* ISBN-10 whose check digit is X */
    lib.wings = (
      await post(
        `${L}/books`,
        { title: "Wings of Fire", authors: ["A. P. J. Abdul Kalam", "Arun Tiwari"], isbn: "0-8044-2957-x" },
        { as: h.tokens.librarian }
      )
    ).data;
    assert.equal(lib.wings.isbn, "080442957X");

    const badChecksum = await request("POST", `${L}/books`, {
      as: h.tokens.librarian,
      body: { title: "Bad", isbn: "978-0-306-40615-8" }
    });
    assert.equal(badChecksum.status, 400);
    assert.equal(badChecksum.body.message, "Invalid request: isbn must be a valid ISBN-10 or ISBN-13");
    await post(`${L}/books`, { title: "Bad", isbn: "12345" }, { as: h.tokens.librarian }, 400);
    await post(`${L}/books`, { title: "Bad", itemType: "COMIC" }, { as: h.tokens.librarian }, 400);

    const duplicate = await request("POST", `${L}/books`, {
      as: h.tokens.librarian,
      body: { title: "Another Hobbit", isbn: "9780306406157" }
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.message, "A book with ISBN 9780306406157 is already in the catalogue: The Hobbit");
    await patch(`${L}/books/${lib.wings.id}`, { isbn: "9780306406157" }, { as: h.tokens.librarian }, 409);

    await post(`${L}/books`, { title: "No subject", subjectId: uuid() }, { as: h.tokens.librarian }, 422);
    await post(`${L}/books`, { title: "Teacher's book" }, { as: h.tokens.teacher }, 403);
    await post(`${L}/books`, { authors: ["Nobody"] }, { as: h.tokens.librarian }, 400);
  });

  it("adds copies in bulk with sequential accession numbers", async () => {
    const added = await post(
      `${L}/books/${lib.hobbit.id}/copies`,
      { count: 3, price: 350, acquiredOn: "2026-06-01", source: "City Book House" },
      { as: h.tokens.librarian }
    );
    assert.equal(added.message, "3 copies of The Hobbit added (ACC-000001 to ACC-000003)");
    assert.deepEqual(
      added.data.map(c => [c.accessionNumber, c.status, c.price, c.source]),
      [
        ["ACC-000001", "AVAILABLE", 350, "City Book House"],
        ["ACC-000002", "AVAILABLE", 350, "City Book House"],
        ["ACC-000003", "AVAILABLE", 350, "City Book House"]
      ]
    );
    const maths = await post(`${L}/books/${lib.maths.id}/copies`, { count: 2, price: 200 }, { as: h.tokens.librarian });
    assert.deepEqual(
      maths.data.map(c => c.accessionNumber),
      ["ACC-000004", "ACC-000005"]
    );
    const wings = await post(`${L}/books/${lib.wings.id}/copies`, { count: 3 }, { as: h.tokens.librarian });
    assert.deepEqual(
      wings.data.map(c => [c.accessionNumber, c.price]),
      [
        ["ACC-000006", null],
        ["ACC-000007", null],
        ["ACC-000008", null]
      ]
    );

    await post(`${L}/books/${lib.hobbit.id}/copies`, { count: 0 }, { as: h.tokens.librarian }, 400);
    await post(`${L}/books/${lib.hobbit.id}/copies`, { count: 101 }, { as: h.tokens.librarian }, 400);
    await post(`${L}/books/${lib.hobbit.id}/copies`, { count: 1, price: -5 }, { as: h.tokens.librarian }, 400);
    await post(`${L}/books/${uuid()}/copies`, { count: 1 }, { as: h.tokens.librarian }, 404);
    await post(`${L}/books/${lib.hobbit.id}/copies`, { count: 1 }, { as: h.tokens.teacher }, 403);

    const detail = await get(`${L}/books/${lib.hobbit.id}`, { as: h.tokens.principal });
    assert.equal(detail.data.copies.available, 3);
    assert.equal(detail.data.internalNotes, "Donated by the PTA");
    assert.equal((await get(`${L}/books?available=true`, { as: h.tokens.librarian })).meta.total, 3);

    const found = await get(`${L}/copies?accessionNumber=acc-000002`, { as: h.tokens.librarian });
    assert.equal(found.meta.total, 1);
    assert.equal(found.data[0].book.title, "The Hobbit");
    await get(`${L}/copies?accessionNumber=12`, { as: h.tokens.librarian }, 400);
    /* Prices, sources and condition notes are for staff */
    await get(`${L}/copies`, { as: h.tokens.student1 }, 403);
    await get(`${L}/books/${lib.hobbit.id}/copies`, { as: h.tokens.teacher }, 403);
  });

  it("lets every role search the public catalogue, without staff-only fields", async () => {
    const byTitle = await get(`${L}/catalogue?q=hobbit`, { as: h.tokens.student1 });
    assert.deepEqual(
      byTitle.data.map(b => [b.title, b.availability.available, b.canBeBorrowed]),
      [["The Hobbit", 3, true]]
    );
    const byAuthor = await get(`${L}/catalogue?q=kalam`, { as: h.tokens.mother });
    assert.deepEqual(
      byAuthor.data.map(b => b.title),
      ["Wings of Fire"]
    );
    const byIsbn = await get(`${L}/catalogue?q=978-0-306`, { as: h.tokens.teacher });
    assert.deepEqual(
      byIsbn.data.map(b => b.title),
      ["The Hobbit"]
    );
    assert.equal((await get(`${L}/catalogue?q=%25`, { as: h.tokens.accountant })).meta.total, 0, "% matches literally");
    assert.equal((await get(`${L}/catalogue?category=Fiction`, { as: h.tokens.office })).meta.total, 1);
    assert.equal((await get(`${L}/catalogue?subjectId=${world.math.id}`)).data[0].id, lib.maths.id);
    await get(`${L}/catalogue?available=maybe`, {}, 400);

    const entry = await request("GET", `${L}/catalogue/${lib.hobbit.id}`, { as: h.tokens.student1 });
    assert.equal(entry.status, 200);
    assert.deepEqual(entry.body.data.availability, { total: 3, available: 3, onLoan: 0, onHold: 0, holdsWaiting: 0 });
    assert.deepEqual(
      entry.body.data.copies.map(c => [c.accessionNumber, c.status, c.dueDate]),
      [
        ["ACC-000001", "AVAILABLE", null],
        ["ACC-000002", "AVAILABLE", null],
        ["ACC-000003", "AVAILABLE", null]
      ]
    );
    const text = entry.buffer.toString();
    for (const field of ["price", "internalNotes", "conditionNotes", "source", "Donated by the PTA", "barcode"]) {
      assert.ok(!text.includes(field), `the catalogue does not show ${field}`);
    }

    /* The staff view is for librarians and the principal */
    await get(`${L}/books`, { as: h.tokens.student1 }, 403);
    await get(`${L}/books/${lib.hobbit.id}`, { as: h.tokens.teacher }, 403);
    await get(`${L}/books`, { as: h.tokens.principal });
    /* Other schools see nothing */
    await get(`${L}/catalogue/${lib.hobbit.id}`, { as: h.tokens.otherAdmin }, 404);
  });

  it("edits copies: barcodes are unique, ISSUED and ON_HOLD are not set by hand", async () => {
    const acc1 = await copyByAccession("ACC-000001");
    const acc3 = await copyByAccession("ACC-000003");
    lib.acc = { 1: acc1 };
    const tagged = await patch(`${L}/copies/${acc1.id}`, { barcode: "LIB-0001" }, { as: h.tokens.librarian });
    assert.equal(tagged.message, "Copy ACC-000001 updated successfully");
    const clash = await request("PATCH", `${L}/copies/${acc3.id}`, {
      as: h.tokens.librarian,
      body: { barcode: "LIB-0001" }
    });
    assert.equal(clash.status, 409);
    assert.equal(clash.body.message, "Barcode LIB-0001 is already used by copy ACC-000001");
    assert.equal((await get(`${L}/copies?barcode=LIB-0001`, { as: h.tokens.librarian })).data[0].id, acc1.id);

    await patch(`${L}/copies/${acc3.id}`, { status: "ISSUED" }, { as: h.tokens.librarian }, 400);
    await patch(`${L}/copies/${acc3.id}`, { status: "ON_HOLD" }, { as: h.tokens.librarian }, 400);
    await patch(`${L}/copies/${acc3.id}`, { status: "DAMAGED" }, { as: h.tokens.teacher }, 403);

    const acc8 = await copyByAccession("ACC-000008");
    await patch(
      `${L}/copies/${acc8.id}`,
      { status: "WITHDRAWN", conditionNotes: "Water damage" },
      { as: h.tokens.librarian }
    );
    const wings = await get(`${L}/books/${lib.wings.id}`, { as: h.tokens.librarian });
    assert.deepEqual([wings.data.copies.total, wings.data.copies.available, wings.data.copies.withdrawn], [2, 2, 1]);
  });
});

describe("library: circulation", () => {
  it("issues for the loan period of the borrower's rule, on an open day", async () => {
    const due = await nextOpen(addDays(today(), 14));
    const loan = await issue({ copyId: lib.acc[1].id, borrowerUserId: world.s1.userId });
    assert.equal(loan.message, `The Hobbit (ACC-000001) issued to Fstudent1 Lstudent1. Due ${due}`);
    assert.equal(loan.data.status, "ISSUED");
    assert.equal(loan.data.issuedOn, today());
    assert.deepEqual(
      [loan.data.borrowerRole, loan.data.itemType, loan.data.ruleId, loan.data.loanDays, loan.data.fineCap],
      ["STUDENT", "BOOK", lib.studentRule.id, 14, 350]
    );
    assert.equal(loan.data.copy.status, "ISSUED");
    assert.equal(loan.data.isOverdue, false);
    lib.s1Hobbit = loan.data;

    /* Staff fall under "everyone": 30 days; the copy can be scanned by accession number */
    const staffLoan = await issue({ accessionNumber: "acc-000006", borrowerUserId: world.teacher.userId });
    assert.equal(staffLoan.data.dueDate, await nextOpen(addDays(today(), 30)));
    assert.equal(staffLoan.data.borrower.name, "Fteacher Lteacher");
    assert.equal(staffLoan.data.fineCap, null, "no price, no maximum fine");
    lib.teacherWings = staffLoan.data;

    const detail = await get(`${L}/catalogue/${lib.hobbit.id}`, { as: h.tokens.student1 });
    assert.deepEqual([detail.data.availability.available, detail.data.availability.onLoan], [2, 1]);
    assert.equal(detail.data.copies[0].dueDate, due);
  });

  it("refuses issues that break the rules", async () => {
    await issue({ copyId: lib.acc[1].id, borrowerUserId: world.s2.userId }, h.tokens.teacher, 403);
    await issue({ copyId: lib.acc[1].id, borrowerUserId: world.s2.userId }, h.tokens.student1, 403);

    const onLoan = await request("POST", `${L}/loans`, {
      as: h.tokens.librarian,
      body: { copyId: lib.acc[1].id, borrowerUserId: world.s2.userId }
    });
    assert.equal(onLoan.status, 409);
    assert.equal(onLoan.body.message, "Copy ACC-000001 is already on loan");

    const sameBook = await request("POST", `${L}/loans`, {
      as: h.tokens.librarian,
      body: { accessionNumber: "ACC-000002", borrowerUserId: world.s1.userId }
    });
    assert.equal(sameBook.status, 422);
    assert.equal(sameBook.body.message, "Fstudent1 Lstudent1 already has a copy of this book on loan");

    const mother = await get(`/api/v1/users/parents/${world.motherId}`);
    lib.motherUserId = mother.data.userId;
    const parent = await request("POST", `${L}/loans`, {
      as: h.tokens.librarian,
      body: { accessionNumber: "ACC-000002", borrowerUserId: lib.motherUserId }
    });
    assert.equal(parent.status, 422);
    assert.equal(parent.body.message, "Parents cannot borrow books; issue them to the student instead");

    const withdrawn = await request("POST", `${L}/loans`, {
      as: h.tokens.librarian,
      body: { accessionNumber: "ACC-000008", borrowerUserId: world.s2.userId }
    });
    assert.equal(withdrawn.status, 422);
    assert.equal(withdrawn.body.message, "Copy ACC-000008 is withdrawn and cannot be issued");

    /* One copy of a lending title kept for reference */
    const refCopy = await post(
      `${L}/books/${lib.maths.id}/copies`,
      { count: 1, price: 200, itemType: "REFERENCE" },
      { as: h.tokens.librarian }
    );
    assert.equal(refCopy.data[0].accessionNumber, "ACC-000009");
    const reference = await request("POST", `${L}/loans`, {
      as: h.tokens.librarian,
      body: { accessionNumber: "ACC-000009", borrowerUserId: world.s2.userId }
    });
    assert.equal(reference.status, 422);
    assert.equal(
      reference.body.message,
      "Copy ACC-000009 of Mathematics Made Easy is for reference; it stays in the library"
    );

    await issue({ accessionNumber: "ACC-000099", borrowerUserId: world.s2.userId }, h.tokens.librarian, 422);
    await issue({ accessionNumber: "ACC-000002", borrowerUserId: uuid() }, h.tokens.librarian, 422);
    await issue({ borrowerUserId: world.s2.userId }, h.tokens.librarian, 400);
    await issue(
      { copyId: lib.acc[1].id, accessionNumber: "ACC-000002", borrowerUserId: world.s2.userId },
      h.tokens.librarian,
      400
    );

    /* Dates: issue defaults to today; a due date is never before the issue date, nor in the past */
    const dated = async (body, message) => {
      const res = await request("POST", `${L}/loans`, {
        as: h.tokens.librarian,
        body: { accessionNumber: "ACC-000002", borrowerUserId: world.s2.userId, ...body }
      });
      assert.equal(res.status, 422);
      assert.equal(res.body.message, message);
    };
    await dated({ issuedOn: addDays(today(), 1) }, "issuedOn cannot be in the future");
    await dated({ issuedOn: addDays(today(), -3) }, "Give a backdateReason when recording a loan issued before today");
    await dated(
      { issuedOn: addDays(today(), -400), backdateReason: "Old register" },
      "issuedOn must be within the last 365 days"
    );
    await dated(
      { issuedOn: addDays(today(), -3), backdateReason: "Desk was offline", dueDate: addDays(today(), -4) },
      `dueDate cannot be before the issue date (${addDays(today(), -3)})`
    );
    await dated({ dueDate: addDays(today(), -1) }, `dueDate cannot be before the issue date (${today()})`);
    await dated(
      { issuedOn: addDays(today(), -10), backdateReason: "Desk was offline", dueDate: addDays(today(), -2) },
      "dueDate cannot be in the past"
    );
    await dated({ dueDate: addDays(today(), 400) }, "dueDate must be within 365 days of issue");

    /* A copy on loan only changes status through a return */
    const busy = await request("PATCH", `${L}/copies/${lib.acc[1].id}`, {
      as: h.tokens.librarian,
      body: { status: "WITHDRAWN" }
    });
    assert.equal(busy.status, 422);
    assert.equal(busy.body.message, "Copy ACC-000001 is on loan; record its return instead");
  });

  it("hands a copy to exactly one of two concurrent issues (held copy lock)", async () => {
    const acc4 = await copyByAccession("ACC-000004");
    /* Both requests are inside their transactions, past the borrower lock, before
       either may look at the copy; the one that gets the copy second must see it issued */
    const results = await whileLocked(
      "SELECT id FROM library_copies WHERE id = $1 FOR UPDATE",
      [acc4.id],
      [
        () =>
          request("POST", `${L}/loans`, {
            as: h.tokens.librarian,
            body: { copyId: acc4.id, borrowerUserId: world.teacher2.userId }
          }),
        () =>
          request("POST", `${L}/loans`, {
            as: h.tokens.librarian,
            body: { copyId: acc4.id, borrowerUserId: world.office.userId }
          })
      ]
    );
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    assert.equal(results.find(r => r.status === 409).body.message, "Copy ACC-000004 is already on loan");
    const open = await h.pool.query("SELECT count(*) FROM library_loans WHERE copy_id = $1 AND status = 'ISSUED'", [
      acc4.id
    ]);
    assert.equal(Number(open.rows[0].count), 1);
    await giveBack(results.find(r => r.status === 201).body.data.id);
  });

  it("enforces the rule's loan limit under concurrency (held borrower lock)", async () => {
    await rule(lib.studentRule.id, { maxLoans: 2 });
    /* s1 has one book; two concurrent issues may not take them past 2 */
    const results = await whileLocked(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`library-borrower:${h.tenant.id}:${world.s1.userId}`],
      ["ACC-000005", "ACC-000007"].map(
        accessionNumber => () =>
          request("POST", `${L}/loans`, {
            as: h.tokens.librarian,
            body: { accessionNumber, borrowerUserId: world.s1.userId }
          })
      )
    );
    assert.deepEqual(results.map(r => r.status).sort(), [201, 422]);
    assert.equal(
      results.find(r => r.status === 422).body.message,
      "Fstudent1 Lstudent1 already has 2 items on loan; the limit for students borrowing any item is 2"
    );
    await rule(lib.studentRule.id, { maxLoans: 3 });
    await giveBack(results.find(r => r.status === 201).body.data.id);
  });

  it("applies item-type and class rules", async () => {
    const planet = (await post(`${L}/books`, { title: "Planet Earth", itemType: "MEDIA" }, { as: h.tokens.librarian }))
      .data;
    const cosmos = (await post(`${L}/books`, { title: "Cosmos", itemType: "MEDIA" }, { as: h.tokens.librarian })).data;
    await post(`${L}/books/${planet.id}/copies`, { count: 1, price: 500 }, { as: h.tokens.librarian });
    await post(`${L}/books/${cosmos.id}/copies`, { count: 1, price: 400 }, { as: h.tokens.librarian });

    /* Students borrowing media: 7 days, one at a time, 5 a day capped at 50 */
    const dvd = await issue({ accessionNumber: "ACC-000010", borrowerUserId: world.s2.userId });
    assert.deepEqual(
      [dvd.data.itemType, dvd.data.ruleId, dvd.data.dueDate, dvd.data.finePerDay, dvd.data.fineCap],
      ["MEDIA", lib.mediaRule.id, await nextOpen(addDays(today(), 7)), 5, 50]
    );
    const second = await request("POST", `${L}/loans`, {
      as: h.tokens.librarian,
      body: { accessionNumber: "ACC-000011", borrowerUserId: world.s2.userId }
    });
    assert.equal(second.status, 422);
    assert.equal(
      second.body.message,
      "Fstudent2 Lstudent2 already has 1 item on loan; the limit for students borrowing media is 1"
    );
    await giveBack(dvd.data.id);

    /* Class 2 students borrow for 21 days at 1 a day */
    const classLoan = await issue({ accessionNumber: "ACC-000007", borrowerUserId: world.s3.userId });
    assert.deepEqual(
      [classLoan.data.loanDays, classLoan.data.finePerDay, classLoan.data.dueDate],
      [21, 1, await nextOpen(addDays(today(), 21))]
    );
    lib.s3Wings = classLoan.data;
  });

  it("moves a due date that falls on a holiday to the next open day", async () => {
    const usual = await nextOpen(addDays(today(), 14));
    const holiday = await post("/api/v1/academics/calendar/events", {
      title: "Library inventory day",
      eventType: "HOLIDAY",
      category: "SCHOOL",
      startDate: usual
    });
    const shifted = await nextOpen(addDays(today(), 14));
    assert.ok(shifted > usual);
    const loan = await issue({ accessionNumber: "ACC-000002", borrowerUserId: world.s2.userId });
    assert.equal(loan.data.dueDate, shifted);
    await del(`/api/v1/academics/calendar/events/${holiday.data.id}`);
    await giveBack(loan.data.id);
  });

  it("renews up to the limit fixed at issue", async () => {
    await rule(lib.studentRule.id, { maxRenewals: 1 });
    const short = await issue({
      accessionNumber: "ACC-000003",
      borrowerUserId: world.s2.userId,
      dueDate: addDays(today(), 1)
    });
    assert.equal(short.data.dueDate, await nextOpen(addDays(today(), 1)));
    const url = `${L}/loans/${short.data.id}/renewal`;
    const renewedDue = await nextOpen(addDays(today(), 14));
    const renewed = await post(url, {}, { as: h.tokens.librarian }, 200);
    assert.equal(renewed.data.dueDate, renewedDue);
    assert.equal(renewed.data.renewalCount, 1);
    assert.equal(renewed.message, `Loan renewed. Due ${renewedDue} (renewal 1)`);
    await post(url, {}, { as: h.tokens.teacher }, 403);

    /* The loan keeps the terms it was issued on, even after the rule changes */
    await rule(lib.studentRule.id, { maxRenewals: 2 });
    const limit = await request("POST", url, { as: h.tokens.librarian });
    assert.equal(limit.status, 422);
    assert.equal(limit.body.message, "This loan has already been renewed 1 time(s), the most the library allows");

    const back = await giveBack(short.data.id);
    assert.equal(back.data.status, "RETURNED");
    assert.equal(back.data.fineTotal, 0);
    assert.equal(back.message, "The Hobbit (ACC-000003) returned by Fstudent2 Lstudent2. No fine due");
    await post(url, {}, { as: h.tokens.librarian }, 422);

    const long = await issue({
      accessionNumber: "ACC-000003",
      borrowerUserId: world.s2.userId,
      dueDate: addDays(today(), 20)
    });
    const noGain = await request("POST", `${L}/loans/${long.data.id}/renewal`, { as: h.tokens.librarian });
    assert.equal(noGain.status, 422);
    assert.equal(noGain.body.message, `Renewing today would not extend the due date (${long.data.dueDate})`);
    await giveBack(long.data.id);
  });

  it("records a back-dated loan with a reason, audited, and accrues its late fine daily", async () => {
    await rule(lib.studentRule.id, { finePerDay: 2.5, fineGraceDays: 2 });
    lib.gitanjali = (
      await post(`${L}/books`, { title: "Gitanjali", authors: ["Rabindranath Tagore"] }, { as: h.tokens.librarian })
    ).data;
    await post(`${L}/books/${lib.gitanjali.id}/copies`, { count: 3, price: 120 }, { as: h.tokens.librarian });

    const issuedOn = addDays(today(), -21);
    const due = await nextOpen(addDays(issuedOn, 14));
    lib.lateFine = money(Math.max(0, late(due) - 2) * 2.5);
    const loan = await issue({
      accessionNumber: "ACC-000012",
      borrowerUserId: world.s2.userId,
      issuedOn,
      backdateReason: "Desk was offline"
    });
    assert.equal(
      loan.message,
      `Gitanjali (ACC-000012) issued to Fstudent2 Lstudent2. Due ${due} (recorded late: issued on ${issuedOn})`
    );
    assert.deepEqual(
      [loan.data.issuedOn, loan.data.dueDate, loan.data.backdateReason, loan.data.isOverdue, loan.data.daysOverdue],
      [issuedOn, due, "Desk was offline", true, late(due)]
    );
    assert.equal(loan.data.lateFine, lib.lateFine, "(late days - 2 grace days) x 2.50, as of today");
    assert.equal(loan.data.fineOutstanding, lib.lateFine);
    assert.equal(loan.data.fineIsFinal, false);
    lib.lateLoan = loan.data;

    await new Promise(resolve => setTimeout(resolve, 50));
    const audit = await h.modules.AuditLog.findOne({ tenantId: h.tenant.id, entityId: loan.data.id }).lean();
    assert.equal(audit.permission, "library.loans.circulate");
    assert.deepEqual([audit.payload.issuedOn, audit.payload.backdateReason], [issuedOn, "Desk was offline"]);

    /* A copy cannot be lent before it last came back */
    const overlap = await request("POST", `${L}/loans`, {
      as: h.tokens.librarian,
      body: { accessionNumber: "ACC-000003", borrowerUserId: world.s3.userId, issuedOn, backdateReason: "Late entry" }
    });
    assert.equal(overlap.status, 422);
    assert.equal(overlap.body.message, `Copy ACC-000003 was returned on ${today()}; a loan cannot start before then`);

    const overdue = await get(`${L}/loans?overdue=true`, { as: h.tokens.librarian });
    assert.deepEqual(
      overdue.data.map(l => [l.id, l.book.title, l.copy.accessionNumber, l.borrower.name]),
      [[lib.lateLoan.id, "Gitanjali", "ACC-000012", "Fstudent2 Lstudent2"]]
    );

    const renewal = await request("POST", `${L}/loans/${lib.lateLoan.id}/renewal`, { as: h.tokens.librarian });
    assert.equal(renewal.status, 422);
    assert.equal(renewal.body.message, `This loan is overdue (due ${due}); the book must be returned, not renewed`);
  });

  it("blocks a borrower with overdue items, unless a librarian overrides with a reason", async () => {
    const due = lib.lateLoan.dueDate;
    const blocked = await request("POST", `${L}/loans`, {
      as: h.tokens.librarian,
      body: { accessionNumber: "ACC-000002", borrowerUserId: world.s2.userId }
    });
    assert.equal(blocked.status, 422);
    assert.equal(
      blocked.body.message,
      `Fstudent2 Lstudent2 has 1 overdue item (Gitanjali, due ${due}, ${late(due)} day(s) late); return them first. ` +
        "A librarian may override this with a reason"
    );
    const override = await issue({
      accessionNumber: "ACC-000002",
      borrowerUserId: world.s2.userId,
      overrideReason: "Board exam next week"
    });
    assert.equal(override.data.blockOverrideReason, "Board exam next week");
    assert.match(override.message, /\(block overridden: Board exam next week\)$/);
    await giveBack(override.data.id);
  });

  it("takes part-payments while the book is out, settles at return, and waives in part", async () => {
    const url = `${L}/loans/${lib.lateLoan.id}`;
    const notYet = await request("POST", `${L}/loans/${lib.s1Hobbit.id}/fine-payment`, {
      as: h.tokens.librarian,
      body: { amount: 1, method: "CASH" }
    });
    assert.equal(notYet.status, 422);
    assert.equal(notYet.body.message, "No fine has accrued on this loan so far");

    const paid = await post(`${url}/fine-payment`, { amount: 2.5, method: "CASH" }, { as: h.tokens.librarian });
    const left = money(lib.lateFine - 2.5);
    assert.equal(paid.message, `Fine payment of 2.50 received. Receipt LIBR-000001. Outstanding ${left.toFixed(2)}`);
    assert.deepEqual(
      [paid.data.loan.status, paid.data.loan.finePaid, paid.data.loan.fineOutstanding],
      ["ISSUED", 2.5, left]
    );
    /* Only what has accrued so far can be paid */
    const tooMuch = await request("POST", `${url}/fine-payment`, {
      as: h.tokens.librarian,
      body: { amount: money(left + 1), method: "UPI" }
    });
    assert.equal(tooMuch.status, 422);
    assert.equal(tooMuch.body.message, `The amount exceeds the outstanding fine of ${left.toFixed(2)}`);
    await post(`${url}/fine-payment`, { amount: 0, method: "CASH" }, { as: h.tokens.librarian }, 400);
    await post(`${url}/fine-payment`, { amount: 1.005, method: "CASH" }, { as: h.tokens.librarian }, 400);
    await post(`${url}/fine-payment`, { amount: 1, method: "CHEQUE" }, { as: h.tokens.librarian }, 400);
    await post(`${url}/fine-payment`, { amount: 1, method: "CASH" }, { as: h.tokens.teacher }, 403);

    /* The return settles the fine against what was paid */
    const returned = await giveBack(lib.lateLoan.id, { condition: "OK" });
    assert.equal(
      returned.message,
      `Gitanjali (ACC-000012) returned by Fstudent2 Lstudent2. Fine due: ${left.toFixed(2)}`
    );
    assert.deepEqual(
      [returned.data.lateFine, returned.data.finePaid, returned.data.fineOutstanding, returned.data.fineIsFinal],
      [lib.lateFine, 2.5, left, true]
    );
    assert.equal(returned.data.copy.status, "AVAILABLE");
    const again = await request("POST", `${url}/return`, { as: h.tokens.librarian, body: {} });
    assert.equal(again.status, 409);
    assert.equal(again.body.message, `This loan was already closed on ${today()}`);
    await post(`${L}/loans/${uuid()}/return`, {}, { as: h.tokens.librarian }, 404);
    await post(`${url}/return`, { condition: "BURNT" }, { as: h.tokens.librarian }, 400);

    /* Partial waivers, with reasons, by the library's administrators */
    await post(`${url}/fine-waiver`, { reason: "Hardship" }, { as: h.tokens.principal }, 403);
    await post(`${url}/fine-waiver`, { amount: 1 }, { as: h.tokens.librarian }, 400);
    await post(`${url}/fine-waiver`, { amount: money(left + 1), reason: "Too much" }, { as: h.tokens.librarian }, 422);
    const part = await post(`${url}/fine-waiver`, { amount: 1, reason: "First offence" }, { as: h.tokens.librarian });
    assert.equal(part.message, `Fine of 1.00 waived for Gitanjali. Outstanding ${money(left - 1).toFixed(2)}`);
    const rest = await post(`${url}/fine-waiver`, { reason: "Hardship" }, { as: h.tokens.librarian });
    assert.equal(rest.data.amount, money(left - 1));
    assert.equal(rest.data.loan.fineOutstanding, 0);
    const none = await request("POST", `${url}/fine-waiver`, { as: h.tokens.librarian, body: { reason: "Again" } });
    assert.equal(none.status, 422);
    assert.equal(none.body.message, "This loan has no outstanding fine");
    await post(`${url}/fine-payment`, { amount: 1, method: "CASH" }, { as: h.tokens.librarian }, 422);

    const detail = await get(url, { as: h.tokens.principal });
    assert.deepEqual(
      [detail.data.fineTotal, detail.data.finePaid, detail.data.fineWaived, detail.data.fineOutstanding],
      [lib.lateFine, 2.5, left, 0]
    );
    assert.deepEqual(
      detail.data.payments.map(p => [p.amount, p.method, p.receiptNumber]),
      [[2.5, "CASH", "LIBR-000001"]]
    );
    assert.deepEqual(
      detail.data.waivers.map(w => [w.amount, w.reason]).sort((a, b) => a[0] - b[0]),
      [
        [1, "First offence"],
        [money(left - 1), "Hardship"]
      ].sort((a, b) => a[0] - b[0])
    );
  });

  it("charges a lost copy's replacement cost, and reverses it when the copy is found in time", async () => {
    /* Class 2 rule: 1 a day; replacement = max(price + 50 fee, 100 minimum) */
    const issuedOn = addDays(today(), -25);
    const due = await nextOpen(addDays(issuedOn, 21));
    const lateFine = late(due);
    const loan = await issue({
      accessionNumber: "ACC-000013",
      borrowerUserId: world.s3.userId,
      issuedOn,
      backdateReason: "Paper register"
    });
    const lost = await giveBack(loan.data.id, { condition: "LOST" });
    assert.deepEqual(
      [lost.data.status, lost.data.lostOn, lost.data.lateFine, lost.data.lostCharge],
      ["LOST", today(), lateFine, 170]
    );
    assert.equal(lost.data.fineOutstanding, lateFine + 170);
    assert.equal(lost.data.copy.status, "LOST");
    assert.equal(
      lost.message,
      `Gitanjali (ACC-000013) recorded as lost. Fine due: ${(lateFine + 170).toFixed(2)} ` +
        `(late ${lateFine.toFixed(2)} + replacement 170.00)`
    );

    /* A copy without a price costs the minimum charge */
    const noPrice = await giveBack(lib.s3Wings.id, { condition: "LOST" });
    assert.deepEqual([noPrice.data.lateFine, noPrice.data.lostCharge], [0, 100]);
    lib.s3WingsLost = noPrice.data;

    /* Found within 30 days: the replacement charge is reversed; what was paid beyond
       the late fine becomes library credit */
    await post(
      `${L}/loans/${loan.data.id}/fine-payment`,
      { amount: 100, method: "CARD", reference: "TXN-1" },
      {
        as: h.tokens.librarian
      }
    );
    lib.credit = money(100 - lateFine);
    const found = await post(`${L}/loans/${loan.data.id}/recovery`, {}, { as: h.tokens.librarian }, 200);
    assert.equal(
      found.message,
      `Gitanjali (ACC-000013) found. Replacement charge of 170.00 reversed; ${lib.credit.toFixed(2)} already paid ` +
        "is now library credit. No fine due"
    );
    assert.deepEqual(
      [
        found.data.status,
        found.data.foundOn,
        found.data.lostCharge,
        found.data.lostChargeReversed,
        found.data.lateFine
      ],
      ["RETURNED", today(), 0, 170, lateFine]
    );
    assert.deepEqual([found.data.fineCredited, found.data.fineOutstanding], [lib.credit, 0]);
    assert.equal(found.data.copy.status, "AVAILABLE");
    assert.equal(await credit(world.s3.userId), lib.credit);
    const twice = await request("POST", `${L}/loans/${loan.data.id}/recovery`, { as: h.tokens.librarian, body: {} });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.message, "This loan is not recorded as lost");

    /* Found after the window: the copy is back, the charge stands */
    await h.pool.query("UPDATE library_loans SET lost_on = $1 WHERE id = $2", [addDays(today(), -40), noPrice.data.id]);
    const tooLate = await post(`${L}/loans/${noPrice.data.id}/recovery`, {}, { as: h.tokens.librarian }, 200);
    assert.equal(
      tooLate.message,
      "Wings of Fire (ACC-000007) found and back in circulation. It was lost 40 day(s) ago, more than the 30 day(s) " +
        "allowed, so the replacement charge stands. Fine due: 100.00"
    );
    assert.equal(tooLate.data.copy.status, "AVAILABLE");

    /* Library credit pays another fine */
    const short = await request("POST", `${L}/loans/${noPrice.data.id}/fine-payment`, {
      as: h.tokens.librarian,
      body: { amount: money(lib.credit + 1), method: "LIBRARY_CREDIT" }
    });
    assert.equal(short.status, 422);
    assert.equal(
      short.body.message,
      `The borrower has ${lib.credit.toFixed(2)} in library credit, less than ${money(lib.credit + 1).toFixed(2)}`
    );
    const fromCredit = await post(
      `${L}/loans/${noPrice.data.id}/fine-payment`,
      { amount: lib.credit, method: "LIBRARY_CREDIT" },
      { as: h.tokens.librarian }
    );
    assert.equal(fromCredit.data.loan.fineOutstanding, money(100 - lib.credit));
    assert.equal(await credit(world.s3.userId), 0);
  });

  it("leaves out the late fine on a lost copy when the policy says so", async () => {
    await policy({ lostIncludesLateFine: false });
    const ramayana = (await post(`${L}/books`, { title: "Ramayana" }, { as: h.tokens.librarian })).data;
    await post(`${L}/books/${ramayana.id}/copies`, { count: 1, price: 300 }, { as: h.tokens.librarian });
    const [copy] = (await get(`${L}/copies?bookId=${ramayana.id}`, { as: h.tokens.librarian })).data;
    const loan = await issue({
      copyId: copy.id,
      borrowerUserId: world.s2.userId,
      issuedOn: addDays(today(), -21),
      backdateReason: "Paper register"
    });
    await post(`${L}/loans/${loan.data.id}/fine-payment`, { amount: 5, method: "CASH" }, { as: h.tokens.librarian });
    const lost = await giveBack(loan.data.id, { condition: "LOST" });
    /* What was paid while the book was out counts towards the replacement */
    assert.deepEqual(
      [lost.data.lateFine, lost.data.lostCharge, lost.data.finePaid, lost.data.fineOutstanding],
      [0, 350, 5, 345]
    );
    await post(`${L}/loans/${loan.data.id}/fine-waiver`, { reason: "Lost in the flood" }, { as: h.tokens.librarian });
    await policy({ lostIncludesLateFine: true });
  });

  it("charges for damage at return", async () => {
    const wrong = await request("POST", `${L}/loans/${lib.teacherWings.id}/return`, {
      as: h.tokens.librarian,
      body: { condition: "OK", damageCharge: 5 }
    });
    assert.equal(wrong.status, 422);
    assert.equal(wrong.body.message, "damageCharge applies to a damaged return only");

    const loan = await issue({ accessionNumber: "ACC-000014", borrowerUserId: world.s1.userId });
    const damaged = await giveBack(loan.data.id, { condition: "DAMAGED", damageCharge: 75, notes: "Pages torn" });
    assert.equal(damaged.message, "Gitanjali (ACC-000014) returned damaged by Fstudent1 Lstudent1. Fine due: 75.00");
    assert.deepEqual([damaged.data.damageCharge, damaged.data.copy.status], [75, "DAMAGED"]);

    const teacher = await giveBack(lib.teacherWings.id, { condition: "DAMAGED", notes: "Torn cover" });
    assert.equal(teacher.message, "Wings of Fire (ACC-000006) returned damaged by Fteacher Lteacher. No fine due");
    assert.equal(teacher.data.copy.status, "DAMAGED");
  });

  it("blocks borrowers whose fines are above the policy's limit", async () => {
    await policy({ fineBlockThreshold: 50 });
    const blocked = await request("POST", `${L}/loans`, {
      as: h.tokens.librarian,
      body: { accessionNumber: "ACC-000011", borrowerUserId: world.s1.userId }
    });
    assert.equal(blocked.status, 422);
    assert.equal(
      blocked.body.message,
      "Fstudent1 Lstudent1 owes 75.00 in library fines, above the limit of 50.00; collect a payment first. " +
        "A librarian may override this with a reason"
    );
    await policy({ fineBlockThreshold: 100 });

    const account = await get(`${L}/borrowers/${world.s1.userId}/account`, { as: h.tokens.principal });
    assert.deepEqual(
      [account.data.openLoans, account.data.overdueLoans, account.data.finesOutstanding, account.data.canBorrow],
      [1, 0, 75, true]
    );
    assert.deepEqual(
      account.data.loansWithFines.map(l => [l.title, l.accessionNumber, l.damageCharge, l.fineOutstanding]),
      [["Gitanjali", "ACC-000014", 75, 75]]
    );
    assert.equal(account.message, "Library account of Fstudent1 Lstudent1");
    await get(`${L}/borrowers/${world.s1.userId}/account`, { as: h.tokens.student1 }, 403);
    await get(`${L}/borrowers/${uuid()}/account`, { as: h.tokens.librarian }, 404);
  });

  it("tells the borrower, and a student's parents, when a fine is charged (in-app and email)", async () => {
    const s2Token = tokenFor(world.s2.userId, "STUDENT");
    const borrower = await inbox(s2Token, "Library fine: Gitanjali");
    assert.equal(borrower.length, 1);
    assert.equal(
      borrower[0].body,
      `A library charge of ${lib.lateFine.toFixed(2)} was recorded for Gitanjali (ACC-000012): returned late. ` +
        `Outstanding: ${money(lib.lateFine - 2.5).toFixed(2)}.`
    );
    const parent = await inbox(h.tokens.mother, "Library fine:");
    assert.equal(parent.length, 3, "s2's late return and lost copy, s1's damage");
    assert.ok(
      h.modules.outbox.email.some(m => m.to === "mother@test.school" && m.subject === "Library fine: Gitanjali")
    );
  });

  it("lists loans with filters for librarians and the principal only", async () => {
    const s1 = await get(`${L}/loans?borrowerUserId=${world.s1.userId}&status=ISSUED`, { as: h.tokens.librarian });
    assert.equal(s1.meta.total, 1);
    const hobbit = await get(`${L}/loans?bookId=${lib.hobbit.id}`, { as: h.tokens.principal });
    assert.equal(hobbit.meta.total, 5);
    assert.equal((await get(`${L}/loans?withFine=true`, { as: h.tokens.librarian })).meta.total, 2);
    await get(`${L}/loans`, { as: h.tokens.teacher }, 403);
    await get(`${L}/loans`, { as: h.tokens.student1 }, 403);
    await get(`${L}/loans/${lib.lateLoan.id}`, { as: h.tokens.mother }, 403);
    await get(`${L}/loans?overdue=yes`, { as: h.tokens.librarian }, 400);
  });

  it("shows each person their own loans and fines, and parents their children's only", async () => {
    const mine = await get(`${L}/my-loans`, { as: h.tokens.student1 });
    assert.equal(mine.meta.total, 3);
    assert.ok(mine.data.every(l => l.borrowerUserId === world.s1.userId));
    assert.equal((await get(`${L}/my-loans?status=RETURNED`, { as: h.tokens.student1 })).meta.total, 2, "history");

    const family = await get(`${L}/my-loans?limit=100`, { as: h.tokens.mother });
    const borrowers = new Set(family.data.map(l => l.borrowerUserId));
    assert.ok(borrowers.has(world.s1.userId) && borrowers.has(world.s2.userId));
    assert.ok(!borrowers.has(world.s3.userId), "not someone else's child");

    const fines = await get(`${L}/my-fines`, { as: h.tokens.mother });
    const owed = id => fines.data.find(a => a.borrower.id === id)?.finesOutstanding;
    assert.deepEqual([owed(world.s1.userId), owed(world.s2.userId), owed(world.s3.userId)], [75, 0, undefined]);
    const s2Account = fines.data.find(a => a.borrower.id === world.s2.userId);
    assert.deepEqual(s2Account.payments.map(p => [p.amount, p.receiptNumber, p.title]).sort(), [
      [2.5, "LIBR-000001", "Gitanjali"],
      [5, "LIBR-000004", "Ramayana"]
    ]);
    const own = await get(`${L}/my-fines`, { as: h.tokens.student1 });
    assert.deepEqual(
      own.data.map(a => a.borrower.id),
      [world.s1.userId]
    );

    const teacher = await get(`${L}/my-loans`, { as: h.tokens.teacher });
    assert.deepEqual(
      teacher.data.map(l => l.id),
      [lib.teacherWings.id]
    );
    assert.equal((await get(`${L}/my-loans`, { as: h.tokens.librarian })).meta.total, 0);
  });
});

describe("library: holds", () => {
  it("queues holds by request time, from the desk and from self-service", async () => {
    lib.malgudi = (
      await post(`${L}/books`, { title: "Malgudi Days", authors: ["R. K. Narayan"] }, { as: h.tokens.librarian })
    ).data;
    await post(`${L}/books/${lib.malgudi.id}/copies`, { count: 2, price: 200 }, { as: h.tokens.librarian });
    lib.malgudiS1 = (await issue({ accessionNumber: "ACC-000016", borrowerUserId: world.s1.userId })).data;
    lib.malgudiTeacher = (await issue({ accessionNumber: "ACC-000017", borrowerUserId: world.teacher.userId })).data;

    /* A parent reserves for their child */
    const s2Hold = await post(
      `${L}/my-holds`,
      { bookId: lib.malgudi.id, borrowerUserId: world.s2.userId },
      { as: h.tokens.mother }
    );
    assert.equal(s2Hold.message, "Malgudi Days reserved for Fstudent2 Lstudent2, number 1 in the queue");
    assert.deepEqual([s2Hold.data.status, s2Hold.data.queuePosition], ["WAITING", 1]);
    lib.s2Hold = s2Hold.data;

    await post(
      `${L}/my-holds`,
      { bookId: lib.malgudi.id, borrowerUserId: world.s2.userId },
      { as: h.tokens.student1 },
      404
    );
    const onLoan = await request("POST", `${L}/my-holds`, { as: h.tokens.student1, body: { bookId: lib.malgudi.id } });
    assert.equal(onLoan.status, 422);
    assert.equal(onLoan.body.message, "Fstudent1 Lstudent1 already has Malgudi Days on loan");
    const duplicate = await request("POST", `${L}/my-holds`, {
      as: h.tokens.mother,
      body: { bookId: lib.malgudi.id, borrowerUserId: world.s2.userId }
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.message, "Fstudent2 Lstudent2 already has a hold on Malgudi Days");
    const forHerself = await request("POST", `${L}/my-holds`, {
      as: h.tokens.mother,
      body: { bookId: lib.malgudi.id }
    });
    assert.equal(forHerself.status, 422);
    assert.equal(forHerself.body.message, "Parents cannot borrow books; send borrowerUserId to reserve for your child");

    const s3Hold = await post(
      `${L}/holds`,
      { bookId: lib.malgudi.id, borrowerUserId: world.s3.userId },
      { as: h.tokens.librarian }
    );
    assert.equal(s3Hold.data.queuePosition, 2);
    lib.s3Hold = s3Hold.data;
    await post(
      `${L}/holds`,
      { bookId: lib.malgudi.id, borrowerUserId: world.s1.userId },
      { as: h.tokens.teacher },
      403
    );

    const atlas = (
      await post(`${L}/books`, { title: "Oxford Atlas", itemType: "REFERENCE" }, { as: h.tokens.librarian })
    ).data;
    const reference = await request("POST", `${L}/my-holds`, { as: h.tokens.student1, body: { bookId: atlas.id } });
    assert.equal(reference.status, 422);
    assert.equal(
      reference.body.message,
      "Oxford Atlas is a reference book; it can be read in the library but not reserved"
    );

    const mine = await get(`${L}/my-holds`, { as: h.tokens.mother });
    assert.deepEqual(
      mine.data.map(x => [x.book.title, x.borrower.name, x.queuePosition]),
      [["Malgudi Days", "Fstudent2 Lstudent2", 1]]
    );
    const queue = await get(`${L}/catalogue/${lib.malgudi.id}`, { as: h.tokens.student1 });
    assert.equal(queue.data.availability.holdsWaiting, 2);
  });

  it("refuses renewals while others wait", async () => {
    const res = await request("POST", `${L}/loans/${lib.malgudiS1.id}/renewal`, { as: h.tokens.librarian });
    assert.equal(res.status, 422);
    assert.equal(res.body.message, "2 readers are waiting for this book; it must be returned, not renewed");
  });

  it("keeps a returned copy for the first in the queue, and lends it to them only", async () => {
    const pickupBy = await nextOpen(addDays(today(), 3));
    const back = await giveBack(lib.malgudiS1.id);
    assert.equal(back.data.copy.status, "ON_HOLD");
    const ready = await hold(lib.s2Hold.id);
    assert.deepEqual(
      [ready.status, ready.copy.accessionNumber, ready.readyOn, ready.pickupBy],
      ["READY", "ACC-000016", today(), pickupBy]
    );
    const s2Token = tokenFor(world.s2.userId, "STUDENT");
    const [notice] = await inbox(s2Token, "Library hold ready");
    assert.equal(
      notice.body,
      `Malgudi Days (ACC-000016) is waiting for you at the library desk. Please collect it by ${pickupBy}; ` +
        "after that it goes to the next reader."
    );
    assert.ok(
      h.modules.outbox.email.some(
        m => m.to === "student2@test.school" && m.subject === "Library hold ready: Malgudi Days"
      )
    );

    const other = await request("POST", `${L}/loans`, {
      as: h.tokens.librarian,
      body: { accessionNumber: "ACC-000016", borrowerUserId: world.s3.userId }
    });
    assert.equal(other.status, 409);
    assert.equal(other.body.message, `Copy ACC-000016 is held for Fstudent2 Lstudent2 until ${pickupBy}`);

    const loan = await issue({ accessionNumber: "ACC-000016", borrowerUserId: world.s2.userId });
    const fulfilled = await hold(lib.s2Hold.id);
    assert.deepEqual([fulfilled.status, fulfilled.fulfilledLoanId], ["FULFILLED", loan.data.id]);
    lib.malgudiS2 = loan.data;
  });

  it("expires uncollected holds and offers the copy to the next reader", async () => {
    await giveBack(lib.malgudiTeacher.id);
    assert.equal((await hold(lib.s3Hold.id)).status, "READY");
    await h.pool.query("UPDATE library_holds SET ready_on = $1, pickup_by = $2 WHERE id = $3", [
      addDays(today(), -5),
      addDays(today(), -1),
      lib.s3Hold.id
    ]);
    await h.modules.jobs.enqueue("library.holdExpiry", { tenantId: h.tenant.id });
    await settleJobs();
    const expired = await hold(lib.s3Hold.id);
    assert.deepEqual([expired.status, expired.closedReason], ["EXPIRED", `Not collected by ${addDays(today(), -1)}`]);
    assert.equal((await copyByAccession("ACC-000017")).status, "AVAILABLE", "nobody else is waiting");
  });

  it("holds a copy on the shelf at once, and lets the borrower cancel", async () => {
    const placed = await post(`${L}/my-holds`, { bookId: lib.malgudi.id }, { as: h.tokens.student1 });
    const pickupBy = await nextOpen(addDays(today(), 3));
    assert.equal(
      placed.message,
      `Malgudi Days is held for Fstudent1 Lstudent1: copy ACC-000017, to collect by ${pickupBy}`
    );
    assert.equal((await copyByAccession("ACC-000017")).status, "ON_HOLD");

    await post(`${L}/my-holds/${placed.data.id}/cancellation`, {}, { as: h.tokens.mother }, 200);
    const cancelled = await get(`${L}/holds/${placed.data.id}`, { as: h.tokens.librarian });
    assert.equal(cancelled.data.status, "CANCELLED", "a parent may cancel a child's hold");
    assert.equal((await copyByAccession("ACC-000017")).status, "AVAILABLE");

    const twice = await request("POST", `${L}/my-holds/${placed.data.id}/cancellation`, { as: h.tokens.student1 });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.message, "This hold is already cancelled");
    const fulfilled = await request("POST", `${L}/holds/${lib.s2Hold.id}/cancellation`, {
      as: h.tokens.librarian,
      body: {}
    });
    assert.equal(fulfilled.status, 409);
    assert.equal(fulfilled.body.message, "This hold was already fulfilled");
    await post(`${L}/my-holds/${lib.s3Hold.id}/cancellation`, {}, { as: h.tokens.student1 }, 404);
  });

  it("cancels the holds of a student who leaves the school", async () => {
    const placed = (
      await post(`${L}/holds`, { bookId: lib.malgudi.id, borrowerUserId: world.s3.userId }, { as: h.tokens.librarian })
    ).data;
    assert.equal(placed.status, "READY");
    /* As the academics module announces a leaver (loaded after the harness set the environment) */
    const { publish } = await import("../../src/common/events/events.js");
    await publish("academics.enrollment.left", {
      tenantId: h.tenant.id,
      studentId: world.s3.id,
      academicYearId: world.y1.id,
      enrollmentId: uuid()
    });
    await settleJobs();
    const left = await hold(placed.id);
    assert.deepEqual([left.status, left.closedReason], ["CANCELLED", "The student left the school"]);
    assert.equal((await copyByAccession(placed.copy.accessionNumber)).status, "AVAILABLE");
  });

  it("gives two copies returned at the same moment to two different readers (held book lock)", async () => {
    lib.panchatantra = (await post(`${L}/books`, { title: "Panchatantra" }, { as: h.tokens.librarian })).data;
    await post(`${L}/books/${lib.panchatantra.id}/copies`, { count: 2 }, { as: h.tokens.librarian });
    const first = (await issue({ accessionNumber: "ACC-000018", borrowerUserId: world.teacher.userId })).data;
    const second = (await issue({ accessionNumber: "ACC-000019", borrowerUserId: world.office.userId })).data;
    const h1 = (
      await post(
        `${L}/holds`,
        { bookId: lib.panchatantra.id, borrowerUserId: world.s1.userId },
        { as: h.tokens.librarian }
      )
    ).data;
    const h2 = (
      await post(
        `${L}/holds`,
        { bookId: lib.panchatantra.id, borrowerUserId: world.s3.userId },
        { as: h.tokens.librarian }
      )
    ).data;

    /* Both returns hold their loan and wait for the book: hold allocation is serial,
       so the second return sees the first hold taken and serves the next one */
    const results = await whileLocked(
      "SELECT id FROM library_books WHERE id = $1 FOR UPDATE",
      [lib.panchatantra.id],
      [
        () => request("POST", `${L}/loans/${first.id}/return`, { as: h.tokens.librarian, body: {} }),
        () => request("POST", `${L}/loans/${second.id}/return`, { as: h.tokens.librarian, body: {} })
      ]
    );
    assert.deepEqual(
      results.map(r => r.status),
      [200, 200]
    );
    const [r1, r2] = [await hold(h1.id), await hold(h2.id)];
    assert.deepEqual([r1.status, r2.status], ["READY", "READY"]);
    assert.notEqual(r1.copyId, r2.copyId);
    assert.deepEqual(
      [(await copyByAccession("ACC-000018")).status, (await copyByAccession("ACC-000019")).status],
      ["ON_HOLD", "ON_HOLD"]
    );

    /* A held copy taken off the shelf sends its hold back to the front of the queue */
    const r1Copy = await get(`${L}/copies/${r1.copyId}`, { as: h.tokens.librarian });
    await patch(`${L}/copies/${r1.copyId}`, { status: "MISSING" }, { as: h.tokens.librarian });
    const back = await hold(h1.id);
    assert.deepEqual([back.status, back.copyId, back.queuePosition], ["WAITING", null, 1]);
    await patch(`${L}/copies/${r1.copyId}`, { status: "AVAILABLE" }, { as: h.tokens.librarian });
    const again = await hold(h1.id);
    assert.deepEqual([again.status, again.copy.accessionNumber], ["READY", r1Copy.data.accessionNumber]);

    for (const id of [h1.id, h2.id]) {
      await post(`${L}/holds/${id}/cancellation`, { reason: "Test over" }, { as: h.tokens.librarian }, 200);
    }
    assert.equal((await get(`${L}/catalogue/${lib.panchatantra.id}`)).data.availability.available, 2);
  });
});

describe("library: reminders", () => {
  it("reminds borrowers before the due date, once", async () => {
    await policy({ dueSoonDays: 3 });
    lib.dueSoon = (
      await issue({ accessionNumber: "ACC-000002", borrowerUserId: world.s3.userId, dueDate: addDays(today(), 2) })
    ).data;
    for (let run = 0; run < 2; run++) {
      await h.modules.jobs.enqueue("library.dailyCirculation", { tenantId: h.tenant.id });
      await settleJobs();
    }
    const reminders = await inbox(tokenFor(world.s3.userId, "STUDENT"), "Library book due soon");
    assert.equal(reminders.length, 1);
    assert.equal(
      reminders[0].body,
      `The Hobbit (ACC-000002) is due back on ${lib.dueSoon.dueDate}, in ${daysBetween(today(), lib.dueSoon.dueDate)} ` +
        "day(s). Return or renew it to avoid a late fine."
    );
  });

  it("chases overdue books with the borrower and the student's parents, and records the fine", async () => {
    /* A copy never lent before, so the loan may be back-dated */
    const [copy] = (
      await post(`${L}/books/${lib.hobbit.id}/copies`, { count: 1, price: 350 }, { as: h.tokens.librarian })
    ).data;
    const issuedOn = addDays(today(), -20);
    const loan = (
      await issue({
        accessionNumber: copy.accessionNumber,
        borrowerUserId: world.s2.userId,
        issuedOn,
        backdateReason: "Late entry"
      })
    ).data;
    lib.overdueLoan = loan;
    const days = late(loan.dueDate);
    const fine = money(Math.max(0, days - 2) * 2.5);
    for (let run = 0; run < 2; run++) {
      await h.modules.jobs.enqueue("library.dailyCirculation", { tenantId: h.tenant.id });
      await settleJobs();
    }
    const body =
      `The Hobbit (${copy.accessionNumber}), borrowed by Fstudent2 Lstudent2, was due on ${loan.dueDate} and is ` +
      `${days} day(s) overdue. Please return it to the library. Fine so far: ${fine.toFixed(2)}.`;
    const student = await inbox(tokenFor(world.s2.userId, "STUDENT"), "Library book overdue");
    assert.deepEqual(
      student.map(n => n.body),
      [body]
    );
    const parent = await inbox(h.tokens.mother, "Library book overdue");
    assert.deepEqual(
      parent.map(n => n.body),
      [body]
    );
    assert.equal((await inbox(h.tokens.student1, "Library book overdue")).length, 0);

    const stored = await h.pool.query("SELECT late_fine::float8 AS fine FROM library_loans WHERE id = $1", [loan.id]);
    assert.equal(stored.rows[0].fine, fine, "the nightly run records the fine so far");
    lib.overdueFine = fine;
  });

  it("skips closed days in fines when the policy says so", async () => {
    await policy({ fineDayBasis: "ACADEMIC_DAYS" });
    /* A fine already recorded never goes down */
    const recorded = await get(`${L}/loans/${lib.overdueLoan.id}`, { as: h.tokens.librarian });
    assert.equal(recorded.data.lateFine, lib.overdueFine);

    const [copy] = (
      await post(`${L}/books/${lib.gitanjali.id}/copies`, { count: 1, price: 120 }, { as: h.tokens.librarian })
    ).data;
    const fresh = (
      await issue({
        accessionNumber: copy.accessionNumber,
        borrowerUserId: world.s3.userId,
        issuedOn: addDays(today(), -30),
        backdateReason: "Late entry"
      })
    ).data;
    const openLate = (await openDays(addDays(fresh.dueDate, 1), today())).length;
    assert.equal(
      fresh.lateFine,
      Math.min(openLate * 1, 120),
      "Class 2: 1 a day for each open day, capped at the price"
    );
    assert.ok(openLate < late(fresh.dueDate), "Sundays are not counted");
    await giveBack(fresh.id);
    await post(`${L}/loans/${fresh.id}/fine-waiver`, { reason: "Test loan" }, { as: h.tokens.librarian });
    await policy({ fineDayBasis: "CALENDAR_DAYS" });
  });

  it("counts the gap between academic years as closed for academic-day fines, open for calendar-day fines", async () => {
    const { calendar } = await import("../../src/modules/library/shared/services/libraryCalendar.service.js").then(
      m => ({ calendar: m.libraryCalendar })
    );
    const years = (await h.pool.query("SELECT start_date::text AS s, end_date::text AS e FROM academic_years")).rows;
    /* The earliest year: the days just before it belong to no academic year */
    const first = years.map(y => y.s).sort()[0];
    const due = addDays(first, -10);
    const on = addDays(first, 4);
    assert.ok(!years.some(y => y.s <= addDays(due, 1) && y.e >= addDays(due, 1)), "a gap before the first year");
    const ctx = { tenantId: h.tenant.id, role: "SYSTEM" };
    const [academic, everyDay] = await h.inSchool(() =>
      Promise.all(["ACADEMIC_DAYS", "CALENDAR_DAYS"].map(basis => calendar.lateDays(ctx, due, on, { basis })))
    );
    assert.equal(everyDay, 14);
    assert.equal(academic, (await openDays(first, on)).length, "only the year's working days count");
  });

  it("skips closures entered by hand, on either fine-day basis", async () => {
    const C = `${L}/closures`;
    await post(C, { fromDate: "2026-05-01", toDate: "2026-05-03", reason: "x" }, { as: h.tokens.teacher }, 403);
    await post(
      C,
      { fromDate: "2026-05-03", toDate: "2026-05-01", reason: "Backwards" },
      { as: h.tokens.librarian },
      400
    );
    const closure = await post(
      C,
      { fromDate: "2026-05-11", toDate: "2026-05-15", reason: "Summer break, no academic year" },
      { as: h.tokens.librarian }
    );
    assert.equal(
      closure.message,
      "Library closed 2026-05-11 to 2026-05-15 (Summer break, no academic year). Late fines skip these days and due dates move past them"
    );
    assert.equal((await get(C, { as: h.tokens.student1 })).meta.total, 1, "borrowers can see closures");

    const { libraryCalendar } = await import("../../src/modules/library/shared/services/libraryCalendar.service.js");
    const ctx = { tenantId: h.tenant.id, role: "SYSTEM" };
    const late = basis => h.inSchool(() => libraryCalendar.lateDays(ctx, "2026-05-08", "2026-05-20", { basis }));
    assert.equal(await late("CALENDAR_DAYS"), 12 - 5, "every day but the 5 closed ones");
    const before = await late("ACADEMIC_DAYS");
    /* A due date on a closed day moves past it */
    assert.equal((await h.inSchool(() => libraryCalendar.nextOpenDay(ctx, "2026-05-12"))) > "2026-05-15", true);

    await del(`${C}/${closure.data.id}`, { as: h.tokens.librarian });
    assert.equal(await late("CALENDAR_DAYS"), 12);
    assert.ok((await late("ACADEMIC_DAYS")) >= before);
  });
});

describe("library: stock-taking", () => {
  it("compares scans with the records and marks unscanned copies missing at closure", async () => {
    await post(`${L}/stock-checks`, { title: "Term 1" }, { as: h.tokens.teacher }, 403);
    const check = await post(`${L}/stock-checks`, { title: "Term 1 stock check" }, { as: h.tokens.librarian });
    const { expected } = check.data.summary;
    assert.equal(check.message, `Stock check "Term 1 stock check" started: ${expected} copies to scan`);
    const busy = await request("POST", `${L}/stock-checks`, { as: h.tokens.librarian, body: { title: "Another" } });
    assert.equal(busy.status, 409);
    assert.equal(
      busy.body.message,
      `Stock check "Term 1 stock check" is already open (started on ${today()}); close it first`
    );
    const url = `${L}/stock-checks/${check.data.id}`;

    const shelf = (await get(`${url}/missing?limit=100`, { as: h.tokens.librarian })).data.map(c => c.accessionNumber);
    assert.equal(shelf.length, expected);
    assert.ok(shelf.includes("ACC-000005") && !shelf.includes("ACC-000001"), "copies on loan are not expected");

    const codes = [...shelf.filter(code => code !== "ACC-000005"), "ACC-000001", "LIB-0001", "NOPE-123"];
    const scanned = await post(`${url}/scans`, { codes }, { as: h.tokens.librarian });
    assert.deepEqual(scanned.data.summary, { expected, found: expected - 1, missing: 1, unexpected: 1, unknown: 1 });
    const byCode = Object.fromEntries(scanned.data.results.map(r => [r.code, r]));
    assert.deepEqual(
      [
        byCode["ACC-000001"].result,
        byCode["ACC-000001"].copyStatus,
        byCode["LIB-0001"].repeated,
        byCode["NOPE-123"].result
      ],
      ["UNEXPECTED", "ISSUED", true, "UNKNOWN"]
    );
    assert.equal(
      scanned.message,
      `${codes.length - 1} scans recorded. Found ${expected - 1} of ${expected}; 1 not scanned yet, 1 unexpected, 1 unknown`
    );
    await post(`${url}/scans`, { codes: ["x"] }, { as: h.tokens.librarian }, 400);

    assert.deepEqual(
      (await get(`${url}/missing`, { as: h.tokens.principal })).data.map(c => [c.accessionNumber, c.title]),
      [["ACC-000005", "Mathematics Made Easy"]]
    );
    assert.deepEqual(
      (await get(`${url}/unexpected`, { as: h.tokens.librarian })).data.map(s => [s.code, s.result]).sort(),
      [
        ["ACC-000001", "UNEXPECTED"],
        ["NOPE-123", "UNKNOWN"]
      ]
    );

    const closed = await post(`${url}/closure`, {}, { as: h.tokens.librarian }, 200);
    assert.equal(
      closed.message,
      `Stock check "Term 1 stock check" closed: ${expected - 1} of ${expected} found, 1 copy marked missing`
    );
    assert.equal((await copyByAccession("ACC-000005")).status, "MISSING");
    const late = await request("POST", `${url}/scans`, { as: h.tokens.librarian, body: { codes: ["ACC-000002"] } });
    assert.equal(late.status, 409);
    assert.equal(late.body.message, `Stock check "Term 1 stock check" was closed on ${today()}`);
  });

  it("puts a missing copy back in circulation when a later check finds it", async () => {
    const check = await post(`${L}/stock-checks`, { title: "Recount" }, { as: h.tokens.librarian });
    const url = `${L}/stock-checks/${check.data.id}`;
    const shelf = (await get(`${url}/missing?limit=100`, { as: h.tokens.librarian })).data.map(c => c.accessionNumber);
    await post(`${url}/scans`, { codes: [...shelf, "ACC-000005"] }, { as: h.tokens.librarian });
    const closed = await post(`${url}/closure`, {}, { as: h.tokens.librarian }, 200);
    assert.equal(closed.data.summary.missing, 0);
    assert.equal((await copyByAccession("ACC-000005")).status, "AVAILABLE");
    assert.equal((await get(`${L}/stock-checks`, { as: h.tokens.principal })).meta.total, 2);
  });
});

describe("library: reports", () => {
  it("reports current loans and overdue books, as JSON or a spreadsheet", async () => {
    const open = (await get(`${L}/loans?status=ISSUED`, { as: h.tokens.librarian })).meta.total;
    const current = await get(`${L}/reports/current-loans`, { as: h.tokens.principal });
    assert.equal(current.data.count, open);
    assert.equal(current.message, `${open} items on loan, 1 overdue`);
    const overdueRow = current.data.loans.find(l => l.loanId === lib.overdueLoan.id);
    assert.equal(overdueRow.className, "Class 1 A");

    const overdue = await get(`${L}/reports/overdue`, { as: h.tokens.librarian });
    assert.deepEqual(
      overdue.data.loans.map(l => [l.title, l.borrower]),
      [["The Hobbit", "Fstudent2 Lstudent2"]]
    );

    const csv = await request("GET", `${L}/reports/overdue?format=csv`, { as: h.tokens.librarian });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type"), /text\/csv/);
    assert.match(csv.buffer.toString(), /Title,Accession no\.,Borrower,Role,Class,Issued on,Due/);
    const xlsx = await request("GET", `${L}/reports/current-loans?format=xlsx`, { as: h.tokens.librarian });
    assert.match(xlsx.headers.get("content-type"), /spreadsheetml/);

    await get(`${L}/reports/overdue`, { as: h.tokens.teacher }, 403);
    await get(`${L}/reports/overdue`, { as: h.tokens.student1 }, 403);
  });

  it("reports fines collected and outstanding", async () => {
    const collected = await get(`${L}/reports/fines-collected?from=${today()}&to=${today()}`, {
      as: h.tokens.librarian
    });
    assert.equal(collected.data.collected, 107.5, "cash and card; library credit is not new money");
    assert.deepEqual(collected.data.byMethod, { CASH: 7.5, CARD: 100, LIBRARY_CREDIT: lib.credit });
    assert.equal(collected.message, `107.50 in library fines collected from ${today()} to ${today()}`);
    await get(`${L}/reports/fines-collected?from=${today()}`, { as: h.tokens.librarian }, 400);
    await get(
      `${L}/reports/fines-collected?from=${today()}&to=${addDays(today(), -1)}`,
      { as: h.tokens.librarian },
      400
    );

    const outstanding = await get(`${L}/reports/fines-outstanding`, { as: h.tokens.librarian });
    const owed = Object.fromEntries(outstanding.data.borrowers.map(b => [b.borrowerUserId, b.outstanding]));
    assert.deepEqual(owed, {
      [world.s1.userId]: 75,
      [world.s2.userId]: lib.overdueFine,
      [world.s3.userId]: money(100 - lib.credit)
    });
    assert.equal(outstanding.data.total, money(75 + lib.overdueFine + 100 - lib.credit));
  });

  it("reports the most borrowed titles, inactive borrowers and acquisitions", async () => {
    const from = addDays(today(), -30);
    const popular = await get(`${L}/reports/most-borrowed?from=${from}&to=${today()}&limit=3`, {
      as: h.tokens.librarian
    });
    assert.equal(popular.data.titles[0].title, "The Hobbit");
    assert.ok(popular.data.titles.length <= 3);

    const inactive = await get(`${L}/reports/inactive-borrowers?since=${today()}`, { as: h.tokens.librarian });
    const ids = inactive.data.borrowers.map(b => b.userId);
    assert.ok(ids.includes(world.principal.userId), "the principal never borrowed");
    assert.ok(!ids.includes(world.s1.userId));
    const students = await get(`${L}/reports/inactive-borrowers?since=${today()}&role=STUDENT`, {
      as: h.tokens.librarian
    });
    assert.ok(students.data.borrowers.every(b => b.role === "STUDENT"));

    const june = await get(`${L}/reports/acquisitions?from=2026-06-01&to=2026-06-01`, { as: h.tokens.librarian });
    assert.deepEqual([june.data.count, june.data.totalValue], [3, 1050]);
    assert.equal(june.message, "3 copies acquired from 2026-06-01 to 2026-06-01");
    const todays = await get(`${L}/reports/acquisitions?from=${today()}&to=${today()}`, { as: h.tokens.librarian });
    assert.ok(todays.data.copies.some(c => c.accessionNumber === "ACC-000004"));
  });
});

describe("library: removing books", () => {
  it("removes a book and its copies, but not while copies are on loan or holds are open", async () => {
    const busy = await request("DELETE", `${L}/books/${lib.hobbit.id}`, { as: h.tokens.librarian });
    assert.equal(busy.status, 409);
    assert.equal(
      busy.body.message,
      "3 copy(ies) of The Hobbit are on loan; they must be returned before the book is removed"
    );

    const draft = (await post(`${L}/books`, { title: "Duplicate entry" }, { as: h.tokens.librarian })).data;
    const copies = (await post(`${L}/books/${draft.id}/copies`, { count: 2 }, { as: h.tokens.librarian })).data;
    const reserved = (await post(`${L}/my-holds`, { bookId: draft.id }, { as: h.tokens.teacher })).data;
    const held = await request("DELETE", `${L}/books/${draft.id}`, { as: h.tokens.librarian });
    assert.equal(held.status, 409);
    assert.equal(held.body.message, "1 hold(s) on Duplicate entry are open; cancel them before the book is removed");
    await post(`${L}/my-holds/${reserved.id}/cancellation`, {}, { as: h.tokens.teacher }, 200);

    await del(`${L}/books/${draft.id}`, { as: h.tokens.teacher }, 403);
    assert.equal(
      (await del(`${L}/books/${draft.id}`, { as: h.tokens.librarian })).message,
      "Book removed successfully"
    );
    await get(`${L}/books/${draft.id}`, { as: h.tokens.librarian }, 404);
    assert.equal((await get(`${L}/copies?bookId=${draft.id}`, { as: h.tokens.librarian })).meta.total, 0);
    /* Accession numbers are never reused */
    const lastNumber = Number(copies.at(-1).accessionNumber.slice(4));
    const next = await post(`${L}/books/${lib.maths.id}/copies`, { count: 1 }, { as: h.tokens.librarian });
    assert.equal(next.data[0].accessionNumber, `ACC-${String(lastNumber + 1).padStart(6, "0")}`);
  });
});
