import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, patch, del, uuid, person, settleJobs } from "../helpers/harness.js";

const HS = "/api/v1/hostel";
const U = "/api/v1/users";
const A = "/api/v1/academics";

/* Values shared by the tests below */
const t = {};
const today = todayIn("Asia/Kolkata");
const tomorrow = addDays(today, 1);

const allocate = (body, options = {}) => request("POST", `${HS}/allocations`, { body, ...options });
const assign = (body, options = {}) => request("POST", `${HS}/resource-assignments`, { body, ...options });
const nameOf = student => `${student.user.firstName} ${student.user.lastName}`;

/* Sessions of this database currently waiting for a lock */
const lockWaiters = async () =>
  Number(
    (
      await h.pool.query(
        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
      )
    ).rows[0].count
  );

const waitForLockWaiters = async count => {
  for (let i = 0; i < 200 && (await lockWaiters()) < count; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(await lockWaiters(), count, `${count} session(s) wait on the lock`);
};

/* Hold a row lock from a separate connection while `requests` start, then release it */
const raceBehindLock = async (lockSql, params, requests) => {
  const holder = await h.pool.connect();
  try {
    await holder.query("BEGIN");
    await holder.query(lockSql, params);
    const pending = Promise.all(requests.map(send => send()));
    await waitForLockWaiters(requests.length);
    await holder.query("COMMIT");
    return await pending;
  } finally {
    /* Discard the connection, so a failed assertion cannot leave the lock held */
    holder.release(true);
  }
};

/* A bed allocation written straight to the table, past every application check */
const insertAllocation = (client, { studentId, room, bedNumber, fromDate, toDate = null, status = "ACTIVE" }) =>
  client.query(
    `INSERT INTO hostel_allocations
       (tenant_id, student_id, hostel_id, room_id, bed_number, from_date, to_date, status, end_reason, ended_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      h.tenant.id,
      studentId,
      room.hostelId,
      room.id,
      bedNumber,
      fromDate,
      toDate,
      status,
      status === "CANCELLED" ? "CANCELLED" : null,
      status === "CANCELLED" ? new Date() : null
    ]
  );

const failure = async promise => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("the statement should have been refused");
};

describe("hostel: hostels and rooms", () => {
  it("creates hostels whose warden is an employee", async () => {
    const boys = await post(`${HS}/hostels`, {
      name: "Boys Hostel",
      residentGender: "BOYS",
      wardenUserId: world.teacher.userId,
      address: "North Campus",
      contactPhone: "+91 80 1234 5678"
    });
    assert.equal(boys.message, "Hostel Boys Hostel (HST-001) created");
    assert.equal(boys.data.warden.firstName, "Fteacher");
    t.boys = boys.data;
    t.girls = (await post(`${HS}/hostels`, { name: "Girls Hostel", code: "gh-1", residentGender: "GIRLS" })).data;
    assert.equal(t.girls.code, "GH-1");

    const student = await request("POST", `${HS}/hostels`, {
      body: { name: "X", residentGender: "COED", wardenUserId: world.s1.userId }
    });
    assert.equal(student.status, 422);
    assert.equal(
      student.body.message,
      "wardenUserId must be an active employee account (ADMIN, PRINCIPAL, HOSTEL_MANAGER, STAFF, TEACHER); Fstudent1 Lstudent1 is a student account"
    );
    await post(`${HS}/hostels`, { name: "X", residentGender: "COED", wardenUserId: world.accountant.userId }, {}, 422);
    await post(`${HS}/hostels`, { name: "X", residentGender: "COED", wardenUserId: uuid() }, {}, 422);

    const duplicate = await request("POST", `${HS}/hostels`, { body: { name: "Boys Hostel", residentGender: "BOYS" } });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.message, "A hostel named Boys Hostel already exists");
    await post(`${HS}/hostels`, { name: "Y", residentGender: "MIXED" }, {}, 400);
    await post(`${HS}/hostels`, { name: "Y", residentGender: "COED" }, { as: h.tokens.teacher }, 403);

    /* The hostel manager runs hostels too */
    t.annex = (
      await post(`${HS}/hostels`, { name: "Annex", residentGender: "COED" }, { as: h.tokens.hostelManager })
    ).data;
    assert.equal(t.annex.code, "HST-002");

    const all = await get(`${HS}/hostels`, { as: h.tokens.accountant });
    assert.deepEqual(
      all.data.map(x => x.name),
      ["Annex", "Boys Hostel", "Girls Hostel"]
    );
    assert.equal((await get(`${HS}/hostels?residentGender=GIRLS`, { as: h.tokens.hostelManager })).meta.total, 1);
    await get(`${HS}/hostels/${t.boys.id}`, { as: h.tokens.otherAdmin }, 404);
    await get(`${HS}/hostels`, { as: h.tokens.student1 }, 403);
  });

  it("adds rooms with unique numbers per hostel", async () => {
    const room = await post(`${HS}/rooms`, {
      hostelId: t.boys.id,
      roomNumber: "101",
      floor: 1,
      capacity: 2,
      roomType: "AC",
      monthlyFee: 4500.5
    });
    assert.equal(room.message, "Room 101 added to Boys Hostel with 2 bed(s)");
    assert.deepEqual([room.data.monthlyFee, room.data.status, room.data.occupied], [4500.5, "AVAILABLE", 0]);
    assert.deepEqual(room.data.freeBeds, [1, 2]);
    t.r101 = room.data;
    t.r102 = (await post(`${HS}/rooms`, { hostelId: t.boys.id, roomNumber: "102", floor: 1, capacity: 1 })).data;
    t.r103 = (
      await post(`${HS}/rooms`, { hostelId: t.boys.id, roomNumber: "103", floor: 2, capacity: 3, roomType: "Non-AC" })
    ).data;
    /* The same number in another hostel is fine */
    t.g101 = (await post(`${HS}/rooms`, { hostelId: t.girls.id, roomNumber: "101", capacity: 2 })).data;
    t.g201 = (await post(`${HS}/rooms`, { hostelId: t.girls.id, roomNumber: "201", capacity: 4 })).data;

    const duplicate = await request("POST", `${HS}/rooms`, {
      body: { hostelId: t.boys.id, roomNumber: "101", capacity: 4 }
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.message, "Room 101 already exists in this hostel");
    await patch(`${HS}/rooms/${t.r102.id}`, { roomNumber: "101" }, {}, 409);

    await post(`${HS}/rooms`, { hostelId: t.boys.id, roomNumber: "104", capacity: 0 }, {}, 400);
    await post(`${HS}/rooms`, { hostelId: t.boys.id, roomNumber: "104", capacity: 51 }, {}, 400);
    await post(`${HS}/rooms`, { hostelId: t.boys.id, roomNumber: "104", capacity: 2, monthlyFee: 1.005 }, {}, 400);
    await post(`${HS}/rooms`, { hostelId: uuid(), roomNumber: "104", capacity: 2 }, {}, 422);
    await post(`${HS}/rooms`, { hostelId: t.boys.id, roomNumber: "104", capacity: 2 }, { as: h.tokens.teacher }, 403);

    const boysRooms = await get(`${HS}/rooms?hostelId=${t.boys.id}`, { as: h.tokens.hostelManager });
    await get(`${HS}/rooms?hostelId=${t.boys.id}`, { as: h.tokens.teacher }, 403);
    assert.deepEqual(
      boysRooms.data.map(r => r.roomNumber),
      ["101", "102", "103"]
    );
    assert.equal((await get(`${HS}/rooms?hostelId=${t.boys.id}&floor=2`)).meta.total, 1);
  });
});

describe("hostel: bed allocations by date range", () => {
  it("only allocates current students who fit the hostel", async () => {
    /* Ira and Kabir were imported in suite 06 into 1-A; Kabir is the mother's child */
    const roster = (await get(`${A}/enrollments?sectionId=${world.s1A.id}&limit=100`)).data;
    t.ira = roster.find(e => e.student.user.firstName === "Ira").student;
    t.kabir = roster.find(e => e.student.user.firstName === "Kabir").student;

    await patch(`${U}/${world.s3.userId}`, { gender: "MALE" });
    const girls = await allocate({ studentId: world.s3.id, roomId: t.g101.id });
    assert.equal(girls.status, 422);
    assert.equal(
      girls.body.message,
      "Fstudent5 Lstudent5 cannot stay in Girls Hostel: it is a girls' hostel and their recorded gender is MALE"
    );

    const outOfRange = await allocate({ studentId: world.s3.id, roomId: t.r101.id, bedNumber: 5 });
    assert.equal(outOfRange.status, 422);
    assert.equal(outOfRange.body.message, "Room 101, Boys Hostel has beds 1 to 2; bed 5 does not exist");
    assert.equal((await allocate({ studentId: world.s3.id, roomId: t.r101.id, bedNumber: 0 })).status, 400);
    assert.equal((await allocate({ studentId: world.s3.id, roomId: t.r101.id, bedNumber: 1.5 })).status, 400);

    const backwards = await allocate({
      studentId: world.s3.id,
      roomId: t.r101.id,
      fromDate: "2026-09-01",
      toDate: "2026-08-01"
    });
    assert.equal(backwards.status, 400);
    assert.equal(backwards.body.message, "Invalid request: toDate toDate cannot be before fromDate");
    const beforeToday = await allocate({ studentId: world.s3.id, roomId: t.r101.id, toDate: "2026-08-01" });
    assert.equal(beforeToday.status, 422);
    assert.equal(beforeToday.body.message, `toDate cannot be before fromDate (${today})`);

    assert.equal((await allocate({ studentId: uuid(), roomId: t.r101.id })).status, 422);
    assert.equal((await allocate({ studentId: world.s3.id, roomId: uuid() })).status, 422);
    assert.equal((await allocate({ studentId: world.s3.id, roomId: t.r101.id }, { as: h.tokens.teacher })).status, 403);
    assert.equal(
      (await allocate({ studentId: world.s3.id, roomId: t.r101.id }, { as: h.tokens.principal })).status,
      403
    );
  });

  it("takes the lowest bed free for the whole stay; one bed per student per day", async () => {
    const res = await post(`${HS}/allocations`, {
      studentId: world.s3.id,
      roomId: t.r101.id,
      fromDate: "2026-07-01",
      notes: "Day scholar until June"
    });
    assert.equal(
      res.message,
      "Fstudent5 Lstudent5 allocated bed 1 in Room 101, Boys Hostel from 2026-07-01 (no end date)"
    );
    assert.deepEqual(
      [res.data.bedNumber, res.data.status, res.data.phase, res.data.source, res.data.toDate, res.data.hostel.name],
      [1, "ACTIVE", "CURRENT", "DIRECT", null, "Boys Hostel"]
    );
    t.s3First = res.data;

    /* Any overlap is refused, even far in the future */
    const twice = await allocate({ studentId: world.s3.id, roomId: t.r103.id, fromDate: "2027-06-01" });
    assert.equal(twice.status, 409);
    assert.equal(
      twice.body.message,
      "Fstudent5 Lstudent5 already has bed 1 in Room 101, Boys Hostel from 2026-07-01 (no end date); shorten, cancel or transfer that allocation first"
    );
  });

  it("gives one bed to exactly one of two overlapping requests (room row lock)", async () => {
    /* Hold the room's row lock so both requests are inside their transactions, past every
       pre-check, before either may look at the bed. Without the lock both would see bed 1 free. */
    const results = await raceBehindLock(
      "SELECT id FROM hostel_rooms WHERE id = $1 FOR UPDATE",
      [t.r102.id],
      [
        [world.s1, "2026-07-01", "2027-03-31"],
        [world.s2, "2026-09-01", "2027-03-31"]
      ].map(
        ([student, fromDate, toDate]) =>
          () =>
            allocate(
              { studentId: student.id, roomId: t.r102.id, bedNumber: 1, fromDate, toDate },
              { as: h.tokens.hostelManager }
            )
      )
    );
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    const winner = results.find(r => r.status === 201).body.data;
    const loser = results.find(r => r.status === 409);
    assert.equal(
      loser.body.message,
      `Bed 1 in Room 102, Boys Hostel is booked by ${nameOf(winner.student)} from ${winner.fromDate} to 2027-03-31`
    );
    assert.equal((await get(`${HS}/allocations?roomId=${t.r102.id}`)).meta.total, 1);
    t.winner = winner;
    t.winnerStudent = [world.s1, world.s2].find(s => s.id === winner.studentId);
    t.loserStudent = [world.s1, world.s2].find(s => s.id !== winner.studentId);

    const taken = await allocate({ studentId: t.loserStudent.id, roomId: t.r101.id, bedNumber: 1 });
    assert.equal(taken.status, 409);
    assert.equal(
      taken.body.message,
      "Bed 1 in Room 101, Boys Hostel is booked by Fstudent5 Lstudent5 from 2026-07-01 (no end date)"
    );
    const second = await post(`${HS}/allocations`, {
      studentId: t.loserStudent.id,
      roomId: t.r101.id,
      bedNumber: 2,
      fromDate: "2026-08-01",
      toDate: "2027-03-31"
    });
    assert.equal(second.data.bedNumber, 2);
    t.loserR101 = second.data;

    const full = await allocate({ studentId: t.ira.id, roomId: t.r101.id });
    assert.equal(full.status, 422);
    assert.equal(
      full.body.message,
      `Room 101, Boys Hostel has no bed free for the whole stay from ${today} (no end date)`
    );
  });

  it("refuses overlaps in the database itself (exclusion constraints)", async () => {
    /* Straight SQL, past every application check */
    const bed = await failure(
      insertAllocation(h.pool, {
        studentId: t.ira.id,
        room: t.r102,
        bedNumber: 1,
        fromDate: "2027-03-01",
        toDate: "2027-04-30"
      })
    );
    assert.deepEqual([bed.code, bed.constraint], ["23P01", "hostel_allocations_bed_no_overlap"]);

    const student = await failure(
      insertAllocation(h.pool, {
        studentId: world.s3.id,
        room: t.r103,
        bedNumber: 3,
        fromDate: "2027-01-01",
        toDate: "2027-01-31"
      })
    );
    assert.deepEqual([student.code, student.constraint], ["23P01", "hostel_allocations_student_no_overlap"]);

    /* The day after an inclusive end date is free, and cancelled rows hold nothing */
    const client = await h.pool.connect();
    try {
      await client.query("BEGIN");
      await insertAllocation(client, {
        studentId: t.ira.id,
        room: t.r102,
        bedNumber: 1,
        fromDate: "2027-04-01",
        toDate: "2027-05-31"
      });
      await insertAllocation(client, {
        studentId: t.kabir.id,
        room: t.r102,
        bedNumber: 1,
        fromDate: "2027-03-01",
        status: "CANCELLED"
      });
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }

    /* Two transactions racing for one bed: the second waits for the first, then fails */
    const first = await h.pool.connect();
    const second = await h.pool.connect();
    try {
      await first.query("BEGIN");
      const [row] = (
        await insertAllocation(first, {
          studentId: t.ira.id,
          room: t.r103,
          bedNumber: 3,
          fromDate: "2030-01-01",
          toDate: "2030-12-31"
        })
      ).rows;
      t.rawRowId = row.id;
      await second.query("BEGIN");
      const pending = failure(
        insertAllocation(second, {
          studentId: t.kabir.id,
          room: t.r103,
          bedNumber: 3,
          fromDate: "2030-06-01",
          toDate: "2030-06-30"
        })
      );
      await waitForLockWaiters(1);
      await first.query("COMMIT");
      const lost = await pending;
      assert.deepEqual([lost.code, lost.constraint], ["23P01", "hostel_allocations_bed_no_overlap"]);
      await second.query("ROLLBACK");
    } finally {
      first.release(true);
      second.release(true);
    }
    await h.pool.query("DELETE FROM hostel_allocations WHERE id = $1 AND tenant_id = $2", [t.rawRowId, h.tenant.id]);
  });

  it("keeps occupied rooms open and large enough", async () => {
    const shrink = await request("PATCH", `${HS}/rooms/${t.r101.id}`, { body: { capacity: 1 } });
    assert.equal(shrink.status, 409);
    assert.equal(shrink.body.message, "Room 101 has 2 bed(s) in use now or later; its capacity cannot be reduced to 1");
    const close = await request("PATCH", `${HS}/rooms/${t.r101.id}`, { body: { status: "CLOSED" } });
    assert.equal(close.status, 409);
    assert.equal(
      close.body.message,
      "Room 101 has 2 current or upcoming allocation(s); vacate, cancel or transfer them before closing it"
    );
    await del(`${HS}/rooms/${t.r101.id}`, {}, 409);
    await del(`${HS}/hostels/${t.boys.id}`, {}, 409);

    await patch(`${HS}/rooms/${t.r103.id}`, { status: "MAINTENANCE" }, { as: h.tokens.hostelManager });
    const maintenance = await allocate({ studentId: t.ira.id, roomId: t.r103.id });
    assert.equal(maintenance.status, 422);
    assert.equal(maintenance.body.message, "Room 103, Boys Hostel is under maintenance and cannot take residents");
    const reopened = await patch(`${HS}/rooms/${t.r103.id}`, { status: "AVAILABLE", monthlyFee: 3000 });
    assert.equal(reopened.data.monthlyFee, 3000);
  });

  it("reports occupancy per room and for the hostel, on any day", async () => {
    const res = await get(`${HS}/hostels/${t.boys.id}/occupancy`, { as: h.tokens.hostelManager });
    assert.equal(res.message, `Boys Hostel: 3 of 6 beds occupied on ${today}`);
    assert.deepEqual(res.data.totals, { rooms: 3, capacity: 6, occupied: 3, free: 3, allocatable: 3 });
    const byNumber = Object.fromEntries(res.data.rooms.map(r => [r.roomNumber, r]));
    assert.deepEqual(
      byNumber["101"].occupants.map(o => o.bedNumber),
      [1, 2]
    );
    assert.equal(byNumber["101"].occupants[0].student.name, "Fstudent5 Lstudent5");
    assert.deepEqual(byNumber["101"].freeBeds, []);
    assert.deepEqual([byNumber["102"].occupied, byNumber["102"].free], [1, 0]);
    assert.deepEqual(byNumber["103"].freeBeds, [1, 2, 3]);

    /* After this year's stays end on 2027-03-31, only the open-ended one remains */
    const april = await get(`${HS}/hostels/${t.boys.id}/occupancy?on=2027-04-15`);
    assert.equal(april.message, "Boys Hostel: 1 of 6 beds occupied on 2027-04-15");

    await get(`${HS}/hostels/${t.boys.id}/occupancy`, { as: h.tokens.student1 }, 403);
    await get(`${HS}/hostels/${t.boys.id}/occupancy?on=tomorrow`, {}, 400);
    await get(`${HS}/hostels/${uuid()}/occupancy`, {}, 404);
  });

  it("books next year's bed ahead and finds free beds for a date range", async () => {
    /* In October, the winner of room 102 books room 103 for 2027-28: no overlap with this year's bed */
    const ahead = await post(
      `${HS}/allocations`,
      { studentId: t.winner.studentId, roomId: t.r103.id, fromDate: "2027-06-01", toDate: "2028-03-31" },
      { as: h.tokens.hostelManager }
    );
    assert.equal(
      ahead.message,
      `${nameOf(t.winner.student)} allocated bed 1 in Room 103, Boys Hostel from 2027-06-01 to 2028-03-31`
    );
    assert.equal(ahead.data.phase, "UPCOMING");
    t.winnerNext = ahead.data;

    const overlapping = await allocate({ studentId: t.winner.studentId, roomId: t.r103.id, fromDate: "2027-03-01" });
    assert.equal(overlapping.status, 409);
    assert.match(overlapping.body.message, /already has bed 1 in Room 102, Boys Hostel from .* to 2027-03-31/);

    const url = `${HS}/bed-availability?fromDate=2027-06-01&toDate=2028-03-31`;
    const boys = await get(`${url}&hostelId=${t.boys.id}`, { as: h.tokens.accountant });
    assert.equal(boys.message, "4 bed(s) free from 2027-06-01 to 2028-03-31");
    const [hostel] = boys.data.hostels;
    assert.deepEqual([hostel.name, hostel.capacity, hostel.free], ["Boys Hostel", 6, 4]);
    /* Bed 1 of room 101 is open-ended; this year's other stays end on 2027-03-31 */
    const rooms = Object.fromEntries(hostel.rooms.map(r => [r.roomNumber, r.freeBeds]));
    assert.deepEqual(rooms, { 101: [2], 102: [1], 103: [2, 3] });
    assert.deepEqual(
      hostel.byRoomType.map(type => [type.roomType, type.rooms, type.free]),
      [
        ["AC", 1, 1],
        [null, 1, 1],
        ["Non-AC", 1, 2]
      ]
    );
    const nonAc = await get(`${url}&roomType=Non-AC`);
    assert.deepEqual([nonAc.data.totals.rooms, nonAc.data.totals.free], [1, 2]);
    /* Every hostel, open-ended from June */
    const everywhere = await get(`${HS}/bed-availability?fromDate=2027-06-01`);
    assert.deepEqual(
      everywhere.data.hostels.map(x => [x.name, x.free]),
      [
        ["Boys Hostel", 4],
        ["Girls Hostel", 6]
      ]
    );
    await get(`${HS}/bed-availability?fromDate=2027-06-01&toDate=2027-05-01`, {}, 400);
    await get(`${HS}/bed-availability`, {}, 400);
    await get(url, { as: h.tokens.teacher }, 403);

    /* List filters: phase as of today, one day, or a range */
    const hostelFilter = `hostelId=${t.boys.id}`;
    assert.equal((await get(`${HS}/allocations?${hostelFilter}&phase=UPCOMING`)).meta.total, 1);
    assert.equal((await get(`${HS}/allocations?${hostelFilter}&phase=CURRENT`)).meta.total, 3);
    assert.equal((await get(`${HS}/allocations?${hostelFilter}&activeOn=2027-06-15`)).meta.total, 2);
    assert.equal((await get(`${HS}/allocations?${hostelFilter}&fromDate=2027-04-01&toDate=2027-05-31`)).meta.total, 1);
    await get(`${HS}/allocations?toDate=2027-05-31`, {}, 400);
  });

  it("extends and shortens a stay, checking overlaps again", async () => {
    /* Ira takes bed 1 of room 103 until the day before the winner's booking starts */
    const ira = await post(`${HS}/allocations`, {
      studentId: t.ira.id,
      roomId: t.r103.id,
      bedNumber: 1,
      toDate: "2027-05-31"
    });
    assert.equal(ira.data.fromDate, today);
    t.iraR103 = ira.data;

    const url = `${HS}/allocations/${t.iraR103.id}`;
    const clash = await request("PATCH", url, { body: { toDate: "2027-06-30" } });
    assert.equal(clash.status, 409);
    assert.equal(
      clash.body.message,
      `Bed 1 in Room 103, Boys Hostel is booked by ${nameOf(t.winner.student)} from 2027-06-01 to 2028-03-31`
    );
    const shorter = await patch(url, { toDate: "2027-03-31" }, { as: h.tokens.hostelManager });
    assert.equal(shorter.message, `Ira Shah has bed 1 in Room 103, Boys Hostel from ${today} to 2027-03-31`);

    /* The winner cannot stretch this year's bed into next year's booking */
    const ownClash = await request("PATCH", `${HS}/allocations/${t.winner.id}`, { body: { toDate: "2027-06-15" } });
    assert.equal(ownClash.status, 409);
    assert.match(ownClash.body.message, /already has bed 1 in Room 103, Boys Hostel from 2027-06-01 to 2028-03-31/);

    const s3 = `${HS}/allocations/${t.s3First.id}`;
    const started = await request("PATCH", s3, { body: { fromDate: "2026-06-15" } });
    assert.equal(started.status, 422);
    assert.equal(started.body.message, "This allocation started on 2026-07-01; its start date can no longer change");
    const backwards = await request("PATCH", s3, { body: { toDate: "2026-06-01" } });
    assert.equal(backwards.status, 422);
    assert.equal(backwards.body.message, "toDate cannot be before fromDate (2026-07-01)");
    await patch(s3, { notes: "Moved in early" }, { as: h.tokens.teacher }, 403);
    await patch(s3, {}, {}, 400);
    assert.equal((await patch(s3, { notes: "Moved in early" })).data.notes, "Moved in early");
  });

  it("vacates a bed and lets it be booked again", async () => {
    const url = `${HS}/allocations/${t.s3First.id}/vacate`;
    assert.equal(
      (await request("POST", url, { body: { vacatedOn: "2026-06-15" } })).body.message,
      "vacatedOn cannot be before the allocation's start (2026-07-01)"
    );
    assert.equal(
      (await request("POST", `${HS}/allocations/${t.iraR103.id}/vacate`, { body: { vacatedOn: "2027-04-15" } })).body
        .message,
      "vacatedOn cannot be after the allocation's end (2027-03-31); extend it first"
    );
    assert.equal(
      (await request("POST", `${HS}/allocations/${t.winnerNext.id}/vacate`, { body: {} })).body.message,
      "This allocation starts on 2027-06-01; cancel it instead of vacating"
    );
    await post(url, { vacatedOn: "2026-09-30" }, { as: h.tokens.teacher }, 403);

    const vacated = await post(url, { vacatedOn: "2026-09-30" }, {}, 200);
    assert.equal(vacated.message, "Fstudent5 Lstudent5 vacated bed 1 in Room 101, Boys Hostel on 2026-09-30");
    assert.deepEqual(
      [vacated.data.toDate, vacated.data.phase, vacated.data.endReason],
      ["2026-09-30", "ENDED", "VACATED"]
    );
    const again = await request("POST", url, { body: {} });
    assert.equal(again.status, 409);
    assert.equal(again.body.message, "This allocation was already vacated on 2026-09-30");

    const back = await post(`${HS}/allocations`, { studentId: world.s3.id, roomId: t.r101.id, fromDate: "2026-10-01" });
    assert.equal(back.data.bedNumber, 1);
    t.s3Current = back.data;

    const history = await get(`${HS}/allocations?studentId=${world.s3.id}`, { as: h.tokens.accountant });
    assert.deepEqual(
      history.data.map(a => a.phase),
      ["CURRENT", "ENDED"]
    );
    assert.equal((await get(`${HS}/allocations?studentId=${world.s3.id}&phase=CURRENT`)).meta.total, 1);
  });

  it("cancels a booking before it starts", async () => {
    const booking = await post(`${HS}/allocations`, {
      studentId: t.kabir.id,
      roomId: t.r103.id,
      bedNumber: 3,
      fromDate: "2027-06-01"
    });
    const url = `${HS}/allocations/${booking.data.id}/cancellation`;
    await post(url, {}, { as: h.tokens.teacher }, 403);
    const cancelled = await post(url, { reason: "Family moved" }, { as: h.tokens.hostelManager }, 200);
    assert.equal(
      cancelled.message,
      "Booking of bed 3 in Room 103, Boys Hostel for Kabir Rao from 2027-06-01 (no end date) cancelled"
    );
    assert.deepEqual(
      [cancelled.data.status, cancelled.data.phase, cancelled.data.endReason, cancelled.data.notes],
      ["CANCELLED", "CANCELLED", "CANCELLED", "Family moved"]
    );
    assert.equal((await request("POST", url, { body: {} })).body.message, "This allocation is already cancelled");
    const started = await request("POST", `${HS}/allocations/${t.s3Current.id}/cancellation`, { body: {} });
    assert.equal(started.status, 422);
    assert.equal(started.body.message, "This allocation started on 2026-10-01; vacate it instead of cancelling");
    await patch(`${HS}/allocations/${booking.data.id}`, { toDate: "2027-12-31" }, {}, 409);
  });

  it("transfers a resident from a date: the old bed ends the day before, in one transaction", async () => {
    const url = `${HS}/allocations/${t.s3Current.id}/transfer`;
    const girls = await request("POST", url, { body: { roomId: t.g101.id } });
    assert.equal(girls.status, 422);
    assert.match(girls.body.message, /cannot stay in Girls Hostel/);
    assert.equal(
      (await request("POST", url, { body: { roomId: t.r102.id } })).body.message,
      `Room 102, Boys Hostel has no bed free for the whole stay from ${today} (no end date)`
    );
    assert.equal(
      (await request("POST", url, { body: { roomId: t.r101.id, bedNumber: 1 } })).body.message,
      "The student is already in bed 1 of Room 101"
    );
    assert.equal(
      (await request("POST", url, { body: { roomId: t.r103.id, fromDate: "2026-09-01" } })).body.message,
      "fromDate cannot be before the allocation's start (2026-10-01)"
    );
    await post(url, { roomId: t.r103.id }, { as: h.tokens.teacher }, 403);
    assert.equal((await get(`${HS}/allocations/${t.s3Current.id}`)).data.toDate, null, "failed moves change nothing");

    const moved = await post(url, { roomId: t.r103.id, bedNumber: 2, fromDate: tomorrow, notes: "Quieter floor" });
    assert.equal(moved.message, `Fstudent5 Lstudent5 moves to bed 2 in Room 103, Boys Hostel from ${tomorrow}`);
    assert.deepEqual(
      [
        moved.data.bedNumber,
        moved.data.source,
        moved.data.previousAllocationId,
        moved.data.fromDate,
        moved.data.toDate
      ],
      [2, "TRANSFER", t.s3Current.id, tomorrow, null]
    );
    t.s3R103 = moved.data;
    const old = (await get(`${HS}/allocations/${t.s3Current.id}`)).data;
    assert.deepEqual([old.toDate, old.endReason, old.phase], [today, "TRANSFERRED", "CURRENT"]);
    const twice = await request("POST", url, { body: { roomId: t.r103.id, bedNumber: 3 } });
    assert.equal(twice.status, 409);
    assert.equal(twice.body.message, `This allocation already ended on ${today} with a transfer`);

    /* Tonight in room 101, tomorrow in room 103 */
    const tonight = (await get(`${HS}/hostels/${t.boys.id}/occupancy`)).data;
    const next = (await get(`${HS}/hostels/${t.boys.id}/occupancy?on=${tomorrow}`)).data;
    const free = (occupancy, number) => occupancy.rooms.find(r => r.roomNumber === number).freeBeds;
    assert.deepEqual([free(tonight, "101"), free(tonight, "103")], [[], [2, 3]]);
    assert.deepEqual([free(next, "101"), free(next, "103")], [[1], [3]]);

    /* A booking moved before it starts is replaced as a whole */
    const ahead = await post(`${HS}/allocations/${t.winnerNext.id}/transfer`, { roomId: t.r103.id, bedNumber: 3 });
    assert.deepEqual([ahead.data.fromDate, ahead.data.toDate, ahead.data.bedNumber], ["2027-06-01", "2028-03-31", 3]);
    const replaced = (await get(`${HS}/allocations/${t.winnerNext.id}`)).data;
    assert.deepEqual([replaced.status, replaced.endReason], ["CANCELLED", "TRANSFERRED"]);
    t.winnerNext = ahead.data;

    /* Every bed of room 103 is in use now or later (bed 2 from tomorrow, bed 3 from June) */
    const shrink = await request("PATCH", `${HS}/rooms/${t.r103.id}`, { body: { capacity: 2 } });
    assert.equal(shrink.status, 409);
    assert.equal(shrink.body.message, "Room 103 has 3 bed(s) in use now or later; its capacity cannot be reduced to 2");
  });
});

describe("hostel: resources", () => {
  it("adds lockers, plans and custom resources with capacity and fee", async () => {
    const locker = await post(
      `${HS}/resources`,
      { hostelId: t.boys.id, roomId: t.r101.id, resourceType: "LOCKER", name: "L-101-2", monthlyFee: 150 },
      { as: h.tokens.hostelManager }
    );
    assert.equal(locker.message, "L-101-2 (locker) added to Room 101, Boys Hostel for 1 student(s)");
    assert.deepEqual(
      [locker.data.capacity, locker.data.monthlyFee, locker.data.inUse, locker.data.available],
      [1, 150, 0, 1]
    );
    t.locker101 = locker.data;
    t.locker103 = (
      await post(`${HS}/resources`, {
        hostelId: t.boys.id,
        roomId: t.r103.id,
        resourceType: "CUPBOARD",
        name: "C-103-1"
      })
    ).data;
    t.veg = (
      await post(`${HS}/resources`, {
        hostelId: t.boys.id,
        resourceType: "MESS_PLAN",
        name: "Veg",
        capacity: 2,
        monthlyFee: 3500
      })
    ).data;
    assert.equal(t.veg.room, null);
    t.nonVeg = (
      await post(`${HS}/resources`, { hostelId: t.boys.id, resourceType: "MESS_PLAN", name: "Non-veg", capacity: 50 })
    ).data;
    t.laundry = (
      await post(`${HS}/resources`, {
        hostelId: t.boys.id,
        resourceType: "LAUNDRY_PLAN",
        name: "Weekly wash",
        capacity: 100
      })
    ).data;
    t.shared = (
      await post(`${HS}/resources`, { hostelId: t.boys.id, resourceType: "LOCKER", name: "Corridor S-1" })
    ).data;
    const custom = await post(`${HS}/resources`, {
      hostelId: t.boys.id,
      resourceType: "CUSTOM",
      customType: "Bicycle stand",
      name: "Stand 1",
      capacity: 10
    });
    assert.equal(custom.message, "Stand 1 (bicycle stand) added to Boys Hostel for 10 student(s)");

    const inRoom = await request("POST", `${HS}/resources`, {
      body: { hostelId: t.boys.id, roomId: t.r101.id, resourceType: "MESS_PLAN", name: "Room mess", capacity: 2 }
    });
    assert.equal(inRoom.status, 422);
    assert.equal(inRoom.body.message, "A mess plan is hostel-wide; leave roomId out");
    const otherHostel = await request("POST", `${HS}/resources`, {
      body: { hostelId: t.girls.id, roomId: t.r101.id, resourceType: "LOCKER", name: "G-L1" }
    });
    assert.equal(otherHostel.body.message, "Room 101 is not in Girls Hostel");
    const noCapacity = await request("POST", `${HS}/resources`, {
      body: { hostelId: t.boys.id, resourceType: "MESS_PLAN", name: "Jain" }
    });
    assert.equal(noCapacity.status, 400);
    assert.equal(noCapacity.body.message, "Invalid request: capacity is required for MESS_PLAN");
    await post(`${HS}/resources`, { hostelId: t.boys.id, resourceType: "CUSTOM", name: "Thing" }, {}, 400);
    await post(
      `${HS}/resources`,
      { hostelId: t.boys.id, resourceType: "LOCKER", name: "Z", customType: "Box" },
      {},
      400
    );
    const duplicate = await request("POST", `${HS}/resources`, {
      body: { hostelId: t.boys.id, resourceType: "LOCKER", name: "Corridor S-1" }
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.message, "A resource named Corridor S-1 already exists in this hostel");
    await post(
      `${HS}/resources`,
      { hostelId: t.boys.id, resourceType: "LOCKER", name: "Q" },
      { as: h.tokens.teacher },
      403
    );
    await post(
      `${HS}/resources`,
      { hostelId: t.boys.id, resourceType: "LOCKER", name: "Q" },
      { as: h.tokens.accountant },
      403
    );

    const plans = await get(`${HS}/resources?hostelId=${t.boys.id}&resourceType=MESS_PLAN`, {
      as: h.tokens.accountant
    });
    assert.deepEqual(
      plans.data.map(p => p.name),
      ["Non-veg", "Veg"]
    );
    assert.equal((await get(`${HS}/resources?roomId=${t.r101.id}`)).meta.total, 1);
    await get(`${HS}/resources`, { as: h.tokens.student1 }, 403);
    await get(`${HS}/resources/${uuid()}`, {}, 404);
    const spare = (
      await post(`${HS}/resources`, {
        hostelId: t.boys.id,
        roomId: t.r102.id,
        resourceType: "STUDY_TABLE",
        name: "T-102"
      })
    ).data;
    assert.equal((await del(`${HS}/resources/${spare.id}`)).message, "T-102 (study table) removed");
  });

  it("assigns room resources with a bed, and hostel-wide ones with or without one", async () => {
    const withBed = await assign(
      { resourceId: t.locker101.id, studentId: t.loserStudent.id, allocationId: t.loserR101.id },
      { as: h.tokens.hostelManager }
    );
    assert.equal(withBed.status, 201);
    assert.equal(
      withBed.body.message,
      `L-101-2 (locker) assigned to ${nameOf(withBed.body.data.student)} from ${today} to 2027-03-31, with their bed`
    );
    assert.deepEqual(
      [withBed.body.data.fromDate, withBed.body.data.toDate, withBed.body.data.phase],
      [today, "2027-03-31", "CURRENT"]
    );
    t.lockerHold = withBed.body.data;

    const standalone = await assign({ resourceId: t.locker101.id, studentId: world.s3.id });
    assert.equal(standalone.status, 422);
    assert.equal(
      standalone.body.message,
      "L-101-2 (locker) belongs to a room; assign it with the resident's allocationId"
    );
    const otherRoom = await assign({ resourceId: t.locker101.id, studentId: world.s3.id, allocationId: t.s3R103.id });
    assert.equal(
      otherRoom.body.message,
      "L-101-2 (locker) is in another room; only residents of that room can have it"
    );
    const notTheirs = await assign({ resourceId: t.veg.id, studentId: world.s3.id, allocationId: t.loserR101.id });
    assert.equal(notTheirs.body.message, "allocationId is not Fstudent5 Lstudent5's allocation");
    /* s3's last night in room 101 is today, and the locker is already held */
    const held = await assign({ resourceId: t.locker101.id, studentId: world.s3.id, allocationId: t.s3Current.id });
    assert.equal(held.status, 409);
    assert.equal(
      held.body.message,
      `L-101-2 (locker) is held by ${nameOf(withBed.body.data.student)} from ${today} to 2027-03-31`
    );
    const outside = await assign({
      resourceId: t.veg.id,
      studentId: t.loserStudent.id,
      allocationId: t.loserR101.id,
      toDate: "2027-04-30"
    });
    assert.equal(outside.status, 422);
    assert.equal(
      outside.body.message,
      "The assignment must fall within its bed allocation (from 2026-08-01 to 2027-03-31)"
    );
    await assign({ resourceId: t.veg.id, studentId: world.s3.id, toDate: "2026-01-01", fromDate: "2026-02-01" }).then(
      r => assert.equal(r.status, 400)
    );
    assert.equal(
      (await assign({ resourceId: t.veg.id, studentId: world.s3.id }, { as: h.tokens.teacher })).status,
      403
    );

    /* Veg mess: two places */
    t.vegLoser = (
      await post(`${HS}/resource-assignments`, {
        resourceId: t.veg.id,
        studentId: t.loserStudent.id,
        allocationId: t.loserR101.id
      })
    ).data;
    const s3Veg = await post(`${HS}/resource-assignments`, {
      resourceId: t.veg.id,
      studentId: world.s3.id,
      allocationId: t.s3R103.id
    });
    assert.deepEqual([s3Veg.data.fromDate, s3Veg.data.toDate, s3Veg.data.phase], [tomorrow, null, "UPCOMING"]);
    const full = await assign({ resourceId: t.veg.id, studentId: t.ira.id, allocationId: t.iraR103.id });
    assert.equal(full.status, 422);
    assert.equal(full.body.message, `Veg (mess plan) is full on ${tomorrow} (2 of 2 places taken)`);
    const twice = await assign({ resourceId: t.veg.id, studentId: world.s3.id, fromDate: "2027-07-01" });
    assert.equal(twice.status, 409);
    assert.equal(
      twice.body.message,
      `Fstudent5 Lstudent5 already holds Veg (mess plan) from ${tomorrow} (no end date)`
    );
    const secondPlan = await assign({ resourceId: t.nonVeg.id, studentId: world.s3.id, fromDate: "2027-07-01" });
    assert.equal(secondPlan.status, 409);
    assert.equal(
      secondPlan.body.message,
      `Fstudent5 Lstudent5 is already on Veg (mess plan) from ${tomorrow} (no end date)`
    );

    /* Ira: this year's cupboard with her bed, and a standalone mess plan */
    t.iraCupboard = (
      await post(`${HS}/resource-assignments`, {
        resourceId: t.locker103.id,
        studentId: t.ira.id,
        allocationId: t.iraR103.id
      })
    ).data;
    t.iraMess = (
      await post(`${HS}/resource-assignments`, { resourceId: t.nonVeg.id, studentId: t.ira.id, toDate: "2027-03-31" })
    ).data;
    assert.equal(t.iraMess.allocationId, null);

    /* A day scholar can be on the laundry plan without a bed */
    const dayScholar = await post(`${HS}/resource-assignments`, { resourceId: t.laundry.id, studentId: t.kabir.id });
    assert.equal(dayScholar.message, `Weekly wash (laundry plan) assigned to Kabir Rao from ${today} (no end date)`);

    const usage = await get(`${HS}/resources/${t.veg.id}`);
    assert.deepEqual([usage.data.inUse, usage.data.available], [1, 1]);
    const lowered = await request("PATCH", `${HS}/resources/${t.veg.id}`, { body: { capacity: 1 } });
    assert.equal(lowered.status, 409);
    assert.equal(
      lowered.body.message,
      `Veg (mess plan) is held by 2 students on ${tomorrow}; its capacity cannot be reduced to 1`
    );
    assert.equal((await patch(`${HS}/resources/${t.veg.id}`, { monthlyFee: 3600 })).data.monthlyFee, 3600);
    const removeHeld = await request("DELETE", `${HS}/resources/${t.veg.id}`);
    assert.equal(removeHeld.status, 409);
    assert.equal(
      removeHeld.body.message,
      "Veg (mess plan) has 2 current or upcoming assignment(s); release or cancel them first"
    );

    const list = await get(`${HS}/resource-assignments?resourceId=${t.veg.id}`, { as: h.tokens.accountant });
    assert.equal(list.meta.total, 2);
    assert.equal((await get(`${HS}/resource-assignments?studentId=${world.s3.id}&phase=UPCOMING`)).meta.total, 1);
    await get(`${HS}/resource-assignments`, { as: h.tokens.teacher }, 403);
  });

  it("gives a single-place resource to exactly one of two requests (resource row lock)", async () => {
    const results = await raceBehindLock(
      "SELECT id FROM hostel_resources WHERE id = $1 FOR UPDATE",
      [t.shared.id],
      [world.s3, t.ira].map(
        student => () => assign({ resourceId: t.shared.id, studentId: student.id }, { as: h.tokens.hostelManager })
      )
    );
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    assert.match(results.find(r => r.status === 409).body.message, /^Corridor S-1 \(locker\) is held by /);
    const winner = results.find(r => r.status === 201).body.data;

    /* Released today, the locker is free from tomorrow; an upcoming hold is cancelled instead */
    const released = await post(`${HS}/resource-assignments/${winner.id}/release`, {}, {}, 200);
    assert.equal(released.message, `${nameOf(winner.student)} released Corridor S-1 (locker) on ${today}`);
    assert.equal(released.data.endReason, "RELEASED");
    const again = await request("POST", `${HS}/resource-assignments/${winner.id}/release`, { body: {} });
    assert.equal(again.body.message, `This assignment already ended on ${today}`);
    const next = await post(`${HS}/resource-assignments`, {
      resourceId: t.shared.id,
      studentId: t.kabir.id,
      fromDate: tomorrow
    });
    const early = await request("POST", `${HS}/resource-assignments/${next.data.id}/release`, { body: {} });
    assert.equal(early.body.message, `This assignment starts on ${tomorrow}; cancel it instead of releasing`);
    const cancelled = await post(`${HS}/resource-assignments/${next.data.id}/cancellation`, {}, {}, 200);
    assert.equal(cancelled.message, `Corridor S-1 (locker) for Kabir Rao from ${tomorrow} (no end date) cancelled`);
    assert.equal(cancelled.data.phase, "CANCELLED");
  });

  it("ends, extends and moves resources together with their bed", async () => {
    const bed = `${HS}/allocations/${t.loserR101.id}`;
    await patch(bed, { toDate: "2027-02-28" });
    const locker = (await get(`${HS}/resource-assignments/${t.lockerHold.id}`)).data;
    assert.deepEqual([locker.toDate, locker.endReason], ["2027-02-28", "BED_ENDED"]);
    await patch(bed, { toDate: "2027-03-31" });
    const back = (await get(`${HS}/resource-assignments/${t.lockerHold.id}`)).data;
    assert.deepEqual([back.toDate, back.endReason], ["2027-03-31", null]);

    const beyond = await request("PATCH", `${HS}/resource-assignments/${t.lockerHold.id}`, {
      body: { toDate: "2027-04-30" }
    });
    assert.equal(beyond.status, 422);

    /* From January the resident moves to room 103: the room-101 locker ends with the old bed,
       the hostel-wide mess plan continues on the new one */
    const moved = await post(`${bed}/transfer`, { roomId: t.r103.id, bedNumber: 3, fromDate: "2027-01-01" });
    t.loserR103 = moved.data;
    const lockerAfter = (await get(`${HS}/resource-assignments/${t.lockerHold.id}`)).data;
    assert.deepEqual([lockerAfter.toDate, lockerAfter.endReason], ["2026-12-31", "BED_ENDED"]);
    const vegOld = (await get(`${HS}/resource-assignments/${t.vegLoser.id}`)).data;
    assert.deepEqual([vegOld.toDate, vegOld.endReason], ["2026-12-31", "TRANSFERRED"]);
    const [vegNew] = (await get(`${HS}/resource-assignments?allocationId=${t.loserR103.id}`)).data;
    assert.deepEqual(
      [vegNew.resource.name, vegNew.fromDate, vegNew.toDate, vegNew.previousAssignmentId],
      ["Veg", "2027-01-01", "2027-03-31", t.vegLoser.id]
    );
  });
});

describe("hostel: year-end roll-over", () => {
  it("continues current residents into next year's dates in the same beds", async () => {
    /* A resident whose enrollment was closed without the leaving event (old data, a fix by hand) */
    t.roller = (
      await post(`${U}/students`, {
        user: person("hostelRoller"),
        parents: [],
        enrollment: { academicYearId: world.y1.id, sectionId: world.s2A.id }
      })
    ).data;
    t.rollerBed = (
      await post(`${HS}/allocations`, { studentId: t.roller.id, roomId: t.g201.id, toDate: "2027-03-31" })
    ).data;
    await h.pool.query("UPDATE student_enrollments SET status = 'LEFT' WHERE id = $1 AND tenant_id = $2", [
      t.roller.enrollment.id,
      h.tenant.id
    ]);

    const url = `${HS}/allocation-rollovers`;
    const body = { toAcademicYearId: world.y2.id, includeResources: true };
    const preview = await post(url, { ...body, dryRun: true }, { as: h.tokens.hostelManager }, 200);
    assert.equal(preview.message, "1 resident(s) would continue into 2027-28 (4 skipped)");
    assert.equal((await get(`${HS}/allocations?studentId=${t.ira.id}&phase=UPCOMING`)).meta.total, 0);

    const res = await post(url, body, { as: h.tokens.hostelManager });
    assert.equal(res.message, "1 resident(s) continued into 2027-28 (4 skipped)");
    const reasons = Object.fromEntries(res.data.skipped.map(s => [s.student.id, s.reason]));
    assert.deepEqual(reasons, {
      [world.s3.id]: "The stay has no end date, so it already continues",
      [t.winner.studentId]: "Already has bed 3 for 2027-28 (from 2027-06-01 to 2028-03-31)",
      [t.loserStudent.id]: `The bed is booked by ${nameOf(t.winner.student)} from 2027-06-01 to 2028-03-31`,
      [t.roller.id]: "Not actively enrolled in 2026-27 or 2027-28 (left the school)"
    });
    const [continued] = res.data.continued;
    assert.deepEqual([continued.student.name, continued.bed], ["Ira Shah", "bed 1 in Room 103, Boys Hostel"]);

    /* The changeover: this year's bed until 2027-03-31, next year's from 2027-06-01 */
    const next = (await get(`${HS}/allocations/${continued.newAllocationId}`)).data;
    assert.deepEqual(
      [next.fromDate, next.toDate, next.bedNumber, next.source, next.previousAllocationId, next.phase],
      ["2027-06-01", "2028-03-31", 1, "ROLLOVER", t.iraR103.id, "UPCOMING"]
    );
    assert.deepEqual(res.data.resources.continued.map(r => r.resource.name).sort(), [
      "C-103-1 (cupboard)",
      "Non-veg (mess plan)"
    ]);
    const iraNext = (await get(`${HS}/resource-assignments?studentId=${t.ira.id}&phase=UPCOMING`)).data;
    const byName = Object.fromEntries(iraNext.map(a => [a.resource.name, a]));
    assert.equal(byName["C-103-1"].allocationId, next.id, "the cupboard stays with the bed");
    assert.equal(byName["Non-veg"].allocationId, null, "the standalone plan stays standalone");
    assert.deepEqual([byName["Non-veg"].fromDate, byName["Non-veg"].toDate], ["2027-06-01", "2028-03-31"]);

    /* Running it again changes nothing */
    const again = await post(url, body, {}, 200);
    assert.equal(again.message, "0 resident(s) continued into 2027-28 (5 skipped)");
    assert.equal(
      again.data.skipped.find(s => s.student.id === t.ira.id).reason,
      "Already booked for 2027-28 (from 2027-06-01 to 2028-03-31)"
    );

    const same = await request("POST", url, { body: { toAcademicYearId: world.y1.id } });
    assert.equal(same.status, 422);
    assert.equal(same.body.message, "2026-27 must start after 2026-27 ends (2027-03-31)");
    assert.equal((await request("POST", url, { body: { toAcademicYearId: uuid() } })).status, 422);
    assert.equal((await request("POST", url, { body: {} })).status, 400);
    assert.equal((await request("POST", url, { body, as: h.tokens.principal })).status, 403);

    /* Tidy up: the hand-closed resident's booking (it starts today, so it can be cancelled) */
    await post(`${HS}/allocations/${t.rollerBed.id}/cancellation`, {}, {}, 200);
  });
});

describe("hostel: students who leave", () => {
  it("ends current and cancels upcoming beds and resources, and tells the hostel manager", async () => {
    const leaver = (
      await post(`${U}/students`, {
        user: person("hostelLeaver"),
        parents: [],
        enrollment: { academicYearId: world.y1.id, sectionId: world.s2A.id }
      })
    ).data;
    const now = (
      await post(`${HS}/allocations`, { studentId: leaver.id, roomId: t.g201.id, bedNumber: 2, toDate: "2027-03-31" })
    ).data;
    const later = (
      await post(`${HS}/allocations`, {
        studentId: leaver.id,
        roomId: t.g201.id,
        bedNumber: 2,
        fromDate: "2027-06-01",
        toDate: "2028-03-31"
      })
    ).data;
    const mess = (
      await post(`${HS}/resources`, {
        hostelId: t.girls.id,
        resourceType: "MESS_PLAN",
        name: "Girls mess",
        capacity: 30
      })
    ).data;
    const laundry = (
      await post(`${HS}/resources`, {
        hostelId: t.girls.id,
        resourceType: "LAUNDRY_PLAN",
        name: "Girls laundry",
        capacity: 30
      })
    ).data;
    const messHold = (
      await post(`${HS}/resource-assignments`, { resourceId: mess.id, studentId: leaver.id, allocationId: now.id })
    ).data;
    const laundryHold = (
      await post(`${HS}/resource-assignments`, { resourceId: laundry.id, studentId: leaver.id, fromDate: "2027-06-01" })
    ).data;

    /* Bed 2 is in use (now and next year), so room 201 cannot shrink to one bed */
    const shrink = await request("PATCH", `${HS}/rooms/${t.g201.id}`, { body: { capacity: 1 } });
    assert.equal(shrink.status, 409);
    assert.equal(
      shrink.body.message,
      "Bed 2 is occupied in Room 201; move the residents before reducing its capacity to 1"
    );

    await patch(`${A}/enrollments/${leaver.enrollment.id}`, { status: "LEFT" });
    await settleJobs();

    const ended = (await get(`${HS}/allocations/${now.id}`)).data;
    assert.deepEqual([ended.toDate, ended.endReason, ended.phase], [today, "LEFT_SCHOOL", "CURRENT"]);
    const cancelled = (await get(`${HS}/allocations/${later.id}`)).data;
    assert.deepEqual([cancelled.status, cancelled.endReason], ["CANCELLED", "LEFT_SCHOOL"]);
    const messAfter = (await get(`${HS}/resource-assignments/${messHold.id}`)).data;
    assert.deepEqual([messAfter.toDate, messAfter.endReason], [today, "LEFT_SCHOOL"]);
    const laundryAfter = (await get(`${HS}/resource-assignments/${laundryHold.id}`)).data;
    assert.deepEqual([laundryAfter.status, laundryAfter.endReason], ["CANCELLED", "LEFT_SCHOOL"]);

    const inbox = (await get("/api/v1/me/notifications?type=MESSAGE&limit=100", { as: h.tokens.hostelManager })).data;
    const notice = inbox.find(n => n.title === "Hostel: FhostelLeaver LhostelLeaver left the school");
    assert.ok(notice, "the hostel manager is told");
    assert.equal(
      notice.body,
      `FhostelLeaver LhostelLeaver (${leaver.studentCode}) left the school on ${today}. ` +
        `Released bed 2 in Room 201, Girls Hostel (last night ${today}). ` +
        "Cancelled the booking of bed 2 in Room 201, Girls Hostel from 2027-06-01. " +
        "Ended: Girls mess (mess plan). Cancelled upcoming: Girls laundry (laundry plan)."
    );
    const adminInbox = (await get("/api/v1/me/notifications?type=MESSAGE&limit=100")).data;
    assert.ok(!adminInbox.some(n => n.title === notice.title), "only hostel managers are told");

    /* A leaver cannot be booked again */
    const rebook = await allocate({ studentId: leaver.id, roomId: t.g201.id, fromDate: "2027-06-01" });
    assert.equal(rebook.status, 422);
    assert.equal(rebook.body.message, "FhostelLeaver LhostelLeaver is not actively enrolled in any academic year");
  });
});

describe("hostel: self-service", () => {
  it("shows students and parents their current and upcoming beds and resources", async () => {
    const mine = await get(`${HS}/my-hostel`, { as: h.tokens.student1 });
    assert.equal(mine.data.length, 1);
    const [entry] = mine.data;
    assert.equal(entry.student.id, world.s1.id);
    assert.equal(entry.current.hostel.name, "Boys Hostel");
    assert.equal(entry.current.warden.name, "Fteacher Lteacher");
    assert.ok(entry.current.warden.phone);

    const children = await get(`${HS}/my-hostel`, { as: h.tokens.mother });
    const ids = children.data.map(c => c.student.id);
    assert.ok(ids.includes(world.s1.id) && ids.includes(world.s2.id) && ids.includes(t.kabir.id));
    assert.ok(!ids.includes(world.s3.id) && !ids.includes(t.ira.id), "never another family's children");
    const of = id => children.data.find(c => c.student.id === id);

    /* The winner: room 102 until 2027-03-31, then room 103 from 2027-06-01 */
    const winner = of(t.winner.studentId);
    assert.deepEqual([winner.current.room.roomNumber, winner.current.toDate], ["102", "2027-03-31"]);
    assert.deepEqual(
      winner.upcoming.map(a => [a.room.roomNumber, a.bedNumber, a.fromDate, a.phase]),
      [["103", 3, "2027-06-01", "UPCOMING"]]
    );
    /* The loser: room 101 until December, room 103 from January, with the locker and mess plan */
    const loser = of(t.loserStudent.id);
    assert.deepEqual([loser.current.room.roomNumber, loser.current.toDate], ["101", "2026-12-31"]);
    assert.deepEqual(
      loser.upcoming.map(a => [a.room.roomNumber, a.fromDate]),
      [["103", "2027-01-01"]]
    );
    assert.deepEqual(
      loser.resources.map(r => [r.resource.name, r.phase, r.withBed]),
      [
        ["L-101-2", "CURRENT", true],
        ["Veg", "CURRENT", true],
        ["Veg", "UPCOMING", true]
      ]
    );
    /* Kabir is a day scholar: no bed, a laundry plan */
    const kabir = of(t.kabir.id);
    assert.deepEqual([kabir.current, kabir.upcoming], [null, []]);
    assert.deepEqual(
      kabir.resources.map(r => [r.resource.name, r.resource.resourceType, r.withBed]),
      [["Weekly wash", "LAUNDRY_PLAN", false]]
    );

    await get(`${HS}/my-hostel`, { as: h.tokens.teacher }, 403);
    await get(`${HS}/my-hostel`, {}, 403);
  });
});

describe("hostel: changing and removing hostels", () => {
  it("changes a hostel's residents only when everyone fits", async () => {
    const res = await request("PATCH", `${HS}/hostels/${t.boys.id}`, { body: { residentGender: "GIRLS" } });
    assert.equal(res.status, 422);
    assert.match(res.body.message, /^Fstudent5 Lstudent5 cannot stay in Boys Hostel: it is a girls' hostel/);
    const coed = await patch(`${HS}/hostels/${t.boys.id}`, { residentGender: "COED", wardenUserId: null });
    assert.deepEqual([coed.data.residentGender, coed.data.warden], ["COED", null]);
    await patch(`${HS}/hostels/${t.boys.id}`, { residentGender: "BOYS", wardenUserId: world.teacher.userId });
  });

  it("removes empty rooms and hostels", async () => {
    await del(`${HS}/rooms/${t.g101.id}`);
    await get(`${HS}/rooms/${t.g101.id}`, {}, 404);
    const removed = await del(`${HS}/hostels/${t.annex.id}`, { as: h.tokens.hostelManager });
    assert.equal(removed.message, "Hostel Annex and its rooms removed");
    await get(`${HS}/hostels/${t.annex.id}`, {}, 404);
    /* The name is free again */
    await post(`${HS}/hostels`, { name: "Annex", code: "ANX", residentGender: "COED" });
    const boys = await request("DELETE", `${HS}/hostels/${t.boys.id}`);
    assert.equal(boys.status, 409);
    assert.match(boys.body.message, /^Boys Hostel still has \d+ current or upcoming allocation\(s\)/);
  });
});
