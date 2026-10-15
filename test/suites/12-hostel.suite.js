import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, patch, del, uuid } from "../helpers/harness.js";

const HS = "/api/v1/hostel";
const U = "/api/v1/users";
const A = "/api/v1/academics";

/* Values shared by the tests below */
const t = {};

const allocate = (body, options = {}) => request("POST", `${HS}/allocations`, { body, ...options });

/* Sessions of this database currently waiting for a row lock */
const lockWaiters = async () =>
  Number(
    (
      await h.pool.query(
        "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'"
      )
    ).rows[0].count
  );

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
      "wardenUserId must be an active employee account (ADMIN, PRINCIPAL, STAFF, TEACHER); Fstudent1 Lstudent1 is a student account"
    );
    await post(`${HS}/hostels`, { name: "X", residentGender: "COED", wardenUserId: world.accountant.userId }, {}, 422);
    await post(`${HS}/hostels`, { name: "X", residentGender: "COED", wardenUserId: uuid() }, {}, 422);

    const duplicate = await request("POST", `${HS}/hostels`, { body: { name: "Boys Hostel", residentGender: "BOYS" } });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.message, "A hostel named Boys Hostel already exists");
    await post(`${HS}/hostels`, { name: "Y", residentGender: "MIXED" }, {}, 400);
    await post(`${HS}/hostels`, { name: "Y", residentGender: "COED" }, { as: h.tokens.teacher }, 403);

    /* Office staff manage hostels too */
    t.annex = (await post(`${HS}/hostels`, { name: "Annex", residentGender: "COED" }, { as: h.tokens.office })).data;
    assert.equal(t.annex.code, "HST-002");

    const all = await get(`${HS}/hostels`, { as: h.tokens.accountant });
    assert.deepEqual(
      all.data.map(x => x.name),
      ["Annex", "Boys Hostel", "Girls Hostel"]
    );
    assert.equal((await get(`${HS}/hostels?residentGender=GIRLS`, { as: h.tokens.teacher })).meta.total, 1);
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
    t.r103 = (await post(`${HS}/rooms`, { hostelId: t.boys.id, roomNumber: "103", floor: 2, capacity: 3 })).data;
    /* The same number in another hostel is fine */
    t.g101 = (await post(`${HS}/rooms`, { hostelId: t.girls.id, roomNumber: "101", capacity: 2 })).data;

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

    const boysRooms = await get(`${HS}/rooms?hostelId=${t.boys.id}`, { as: h.tokens.teacher });
    assert.deepEqual(
      boysRooms.data.map(r => r.roomNumber),
      ["101", "102", "103"]
    );
    assert.equal((await get(`${HS}/rooms?hostelId=${t.boys.id}&floor=2`)).meta.total, 1);
  });
});

describe("hostel: allocations", () => {
  it("only allocates enrolled students who fit the hostel", async () => {
    /* Ira (imported in suite 06) is in 1-A, and not one of the mother's children */
    const roster = (await get(`${A}/enrollments?sectionId=${world.s1A.id}&limit=100`)).data;
    t.ira = roster.find(e => e.student.user.firstName === "Ira").student;

    await patch(`${U}/${world.s3.userId}`, { gender: "MALE" });
    const girls = await allocate({ studentId: world.s3.id, roomId: t.g101.id });
    assert.equal(girls.status, 422);
    assert.equal(
      girls.body.message,
      "Fstudent5 Lstudent5 cannot stay in Girls Hostel: it is a girls' hostel and their recorded gender is MALE"
    );

    const nextYear = await allocate(
      { studentId: world.s3.id, roomId: t.r101.id },
      { headers: { "x-academic-year-id": world.y2.id } }
    );
    assert.equal(nextYear.status, 422);
    assert.equal(nextYear.body.message, "Fstudent5 Lstudent5 is not actively enrolled in 2027-28");

    const outOfRange = await allocate({ studentId: world.s3.id, roomId: t.r101.id, bedNumber: 5 });
    assert.equal(outOfRange.status, 422);
    assert.equal(outOfRange.body.message, "Room 101, Boys Hostel has beds 1 to 2; bed 5 does not exist");
    assert.equal((await allocate({ studentId: world.s3.id, roomId: t.r101.id, bedNumber: 0 })).status, 400);
    assert.equal((await allocate({ studentId: world.s3.id, roomId: t.r101.id, bedNumber: 1.5 })).status, 400);

    assert.equal((await allocate({ studentId: uuid(), roomId: t.r101.id })).status, 422);
    assert.equal((await allocate({ studentId: world.s3.id, roomId: uuid() })).status, 422);
    assert.equal(
      (await allocate({ studentId: world.s3.id, roomId: t.r101.id, allocatedOn: "2026-05-01" })).body.message,
      "allocatedOn 2026-05-01 is outside the academic year 2026-27"
    );
    assert.equal((await allocate({ studentId: world.s3.id, roomId: t.r101.id }, { as: h.tokens.teacher })).status, 403);
    assert.equal(
      (await allocate({ studentId: world.s3.id, roomId: t.r101.id }, { as: h.tokens.principal })).status,
      403
    );
  });

  it("takes the lowest free bed when none is named, once per student", async () => {
    const res = await post(`${HS}/allocations`, {
      studentId: world.s3.id,
      roomId: t.r101.id,
      allocatedOn: "2026-07-01",
      notes: "Day scholar until June"
    });
    assert.equal(res.message, "Fstudent5 Lstudent5 allocated bed 1 in Room 101, Boys Hostel");
    assert.deepEqual([res.data.bedNumber, res.data.status, res.data.hostel.name], [1, "ACTIVE", "Boys Hostel"]);
    t.s3First = res.data;

    const twice = await allocate({ studentId: world.s3.id, roomId: t.r103.id });
    assert.equal(twice.status, 409);
    assert.equal(
      twice.body.message,
      "Fstudent5 Lstudent5 already has bed 1 in Room 101, Boys Hostel; vacate or transfer that allocation first"
    );
  });

  it("gives the last bed to exactly one of two concurrent requests", async () => {
    /* Hold the room's row lock so both requests are inside their transactions,
       past every pre-check, before either may count beds. Without the service's
       lock both would take bed 1 and the loser would hit the unique index (409). */
    const holder = await h.pool.connect();
    let results;
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM hostel_rooms WHERE id = $1 FOR UPDATE", [t.r102.id]);
      const pending = Promise.all(
        [world.s1, world.s2].map(student =>
          allocate({ studentId: student.id, roomId: t.r102.id, allocatedOn: "2026-07-01" }, { as: h.tokens.office })
        )
      );
      for (let i = 0; i < 200 && (await lockWaiters()) < 2; i++) await new Promise(r => setTimeout(r, 10));
      assert.equal(await lockWaiters(), 2, "both requests wait on the room lock");
      await holder.query("COMMIT");
      results = await pending;
    } finally {
      /* Discard the connection, so a failed assertion cannot leave the lock held */
      holder.release(true);
    }
    assert.deepEqual(results.map(r => r.status).sort(), [201, 422]);
    const loser = results.find(r => r.status === 422);
    assert.equal(loser.body.message, "Room 102, Boys Hostel is full (1 of 1 beds taken)");
    const winner = results.find(r => r.status === 201).body.data;
    assert.equal(winner.bedNumber, 1);
    assert.equal((await get(`${HS}/allocations?roomId=${t.r102.id}`)).meta.total, 1);

    const otherId = [world.s1.id, world.s2.id].find(id => id !== winner.studentId);
    const taken = await allocate({ studentId: otherId, roomId: t.r101.id, bedNumber: 1 });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.message, "Bed 1 in Room 101, Boys Hostel is already taken");
    const second = await post(`${HS}/allocations`, { studentId: otherId, roomId: t.r101.id, bedNumber: 2 });
    assert.equal(second.data.bedNumber, 2);

    const full = await allocate({ studentId: t.ira.id, roomId: t.r101.id });
    assert.equal(full.status, 422);
    assert.equal(full.body.message, "Room 101, Boys Hostel is full (2 of 2 beds taken)");
  });

  it("keeps occupied rooms open and large enough", async () => {
    const shrink = await request("PATCH", `${HS}/rooms/${t.r101.id}`, { body: { capacity: 1 } });
    assert.equal(shrink.status, 409);
    assert.equal(shrink.body.message, "Room 101 has 2 resident(s); its capacity cannot be reduced to 1");
    const close = await request("PATCH", `${HS}/rooms/${t.r101.id}`, { body: { status: "CLOSED" } });
    assert.equal(close.status, 409);
    assert.equal(close.body.message, "Room 101 has 2 resident(s); vacate or transfer them before closing it");
    await del(`${HS}/rooms/${t.r101.id}`, {}, 409);
    await del(`${HS}/hostels/${t.boys.id}`, {}, 409);

    await patch(`${HS}/rooms/${t.r103.id}`, { status: "MAINTENANCE" }, { as: h.tokens.office });
    const maintenance = await allocate({ studentId: t.ira.id, roomId: t.r103.id });
    assert.equal(maintenance.status, 422);
    assert.equal(maintenance.body.message, "Room 103, Boys Hostel is under maintenance and cannot take residents");
    const reopened = await patch(`${HS}/rooms/${t.r103.id}`, { status: "AVAILABLE", monthlyFee: 3000 });
    assert.equal(reopened.data.monthlyFee, 3000);
  });

  it("reports occupancy per room and for the hostel", async () => {
    const res = await get(`${HS}/hostels/${t.boys.id}/occupancy`, { as: h.tokens.teacher });
    assert.equal(res.message, "Boys Hostel: 3 of 6 beds occupied");
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

    await get(`${HS}/hostels/${t.boys.id}/occupancy`, { as: h.tokens.student1 }, 403);
    await get(`${HS}/hostels/${uuid()}/occupancy`, {}, 404);
  });

  it("vacates a bed and lets it be allocated again", async () => {
    const url = `${HS}/allocations/${t.s3First.id}/vacate`;
    assert.equal(
      (await request("POST", url, { body: { vacatedOn: "2026-06-15" } })).body.message,
      "vacatedOn cannot be before the allocation date (2026-07-01)"
    );
    await post(url, { vacatedOn: "2099-01-01" }, {}, 422);
    await post(url, { vacatedOn: "2026-09-30" }, { as: h.tokens.teacher }, 403);

    const vacated = await post(url, { vacatedOn: "2026-09-30" }, {}, 200);
    assert.equal(vacated.message, "Fstudent5 Lstudent5 vacated bed 1 in Room 101, Boys Hostel on 2026-09-30");
    assert.deepEqual([vacated.data.status, vacated.data.vacatedOn], ["VACATED", "2026-09-30"]);
    const again = await request("POST", url, { body: {} });
    assert.equal(again.status, 409);
    assert.equal(again.body.message, "This allocation was already vacated on 2026-09-30");

    const back = await post(`${HS}/allocations`, {
      studentId: world.s3.id,
      roomId: t.r101.id,
      allocatedOn: "2026-10-01"
    });
    assert.equal(back.data.bedNumber, 1);
    t.s3Current = back.data;

    const history = await get(`${HS}/allocations?studentId=${world.s3.id}`, { as: h.tokens.accountant });
    assert.deepEqual(
      history.data.map(a => a.status),
      ["ACTIVE", "VACATED"]
    );
    assert.equal((await get(`${HS}/allocations?studentId=${world.s3.id}&status=ACTIVE`)).meta.total, 1);
    assert.equal((await get(`${HS}/allocations?hostelId=${t.boys.id}&status=ACTIVE`)).meta.total, 3);
    const nextYear = await get(`${HS}/allocations`, { headers: { "x-academic-year-id": world.y2.id } });
    assert.equal(nextYear.meta.total, 0);
  });

  it("transfers a resident to another bed atomically", async () => {
    const url = `${HS}/allocations/${t.s3Current.id}/transfer`;
    const girls = await request("POST", url, { body: { roomId: t.g101.id } });
    assert.equal(girls.status, 422);
    assert.match(girls.body.message, /cannot stay in Girls Hostel/);
    assert.equal(
      (await request("POST", url, { body: { roomId: t.r102.id } })).body.message,
      "Room 102, Boys Hostel is full (1 of 1 beds taken)"
    );
    assert.equal(
      (await request("POST", url, { body: { roomId: t.r101.id, bedNumber: 1 } })).body.message,
      "The student is already in bed 1 of Room 101"
    );
    await post(url, { roomId: t.r103.id }, { as: h.tokens.teacher }, 403);
    assert.equal(
      (await get(`${HS}/allocations/${t.s3Current.id}`)).data.status,
      "ACTIVE",
      "failed moves change nothing"
    );

    const moved = await post(url, { roomId: t.r103.id, bedNumber: 2, notes: "Asked for a quieter floor" });
    assert.equal(moved.message, "Fstudent5 Lstudent5 moved to bed 2 in Room 103, Boys Hostel");
    assert.deepEqual(
      [moved.data.bedNumber, moved.data.transferredFromId, moved.data.academicYearId],
      [2, t.s3Current.id, world.y1.id]
    );
    const old = (await get(`${HS}/allocations/${t.s3Current.id}`)).data;
    assert.deepEqual([old.status, old.vacatedOn], ["VACATED", todayIn("Asia/Kolkata")]);
    await post(url, { roomId: t.r103.id }, {}, 422);

    const occupancy = (await get(`${HS}/hostels/${t.boys.id}/occupancy`)).data;
    const byNumber = Object.fromEntries(occupancy.rooms.map(r => [r.roomNumber, r]));
    assert.deepEqual(byNumber["101"].freeBeds, [1]);
    assert.deepEqual(byNumber["103"].freeBeds, [1, 3]);
    assert.equal(occupancy.totals.occupied, 3);

    /* Bed 2 is taken, so room 103 cannot shrink to one bed even with one resident */
    const shrink = await request("PATCH", `${HS}/rooms/${t.r103.id}`, { body: { capacity: 1 } });
    assert.equal(shrink.status, 409);
    assert.equal(
      shrink.body.message,
      "Bed 2 is occupied in Room 103; move the residents before reducing its capacity to 1"
    );
  });

  it("shows students and parents only their own beds", async () => {
    await post(`${HS}/allocations`, { studentId: t.ira.id, roomId: t.r103.id });
    const winnerId = (await get(`${HS}/allocations?roomId=${t.r102.id}`)).data[0].studentId;

    const mine = await get(`${HS}/my-hostel`, { as: h.tokens.student1 });
    assert.equal(mine.data.length, 1);
    const [entry] = mine.data;
    assert.equal(entry.student.id, world.s1.id);
    assert.equal(entry.allocation.hostel.name, "Boys Hostel");
    assert.equal(entry.allocation.room.roomNumber, winnerId === world.s1.id ? "102" : "101");
    assert.equal(entry.allocation.warden.name, "Fteacher Lteacher");
    assert.ok(entry.allocation.warden.phone);

    const children = await get(`${HS}/my-hostel`, { as: h.tokens.mother });
    const ids = children.data.map(c => c.student.id);
    assert.ok(ids.includes(world.s1.id) && ids.includes(world.s2.id));
    assert.ok(!ids.includes(world.s3.id) && !ids.includes(t.ira.id), "never another family's children");
    assert.equal(children.data.filter(c => c.allocation).length, 2);

    await get(`${HS}/my-hostel`, { as: h.tokens.teacher }, 403);
    await get(`${HS}/my-hostel`, {}, 403);
  });

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
    const removed = await del(`${HS}/hostels/${t.annex.id}`, { as: h.tokens.office });
    assert.equal(removed.message, "Hostel Annex and its rooms removed");
    await get(`${HS}/hostels/${t.annex.id}`, {}, 404);
    /* The name is free again */
    await post(`${HS}/hostels`, { name: "Annex", code: "ANX", residentGender: "COED" });
  });
});
