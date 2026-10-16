import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, todayIn } from "../../src/common/utils/date.util.js";
import { h, world, request, get, post, patch, del, person, settleJobs, uuid } from "../helpers/harness.js";

const T = "/api/v1/transport";
const today = todayIn("Asia/Kolkata");
const asOffice = () => ({ as: h.tokens.transportManager });

const activeOnRoute = async routeId =>
  Number(
    (
      await h.pool.query(
        "SELECT count(*) FROM transport_assignments WHERE route_id = $1 AND status = 'ACTIVE' AND is_active",
        [routeId]
      )
    ).rows[0].count
  );

describe("transport: vehicles", () => {
  it("adds vehicles with normalised, unique registration numbers", async () => {
    const bus = await post(
      `${T}/vehicles`,
      {
        registrationNumber: " ka 01-ab 1234 ",
        make: "Tata",
        model: "Starbus",
        capacity: 2,
        driverName: "Ravi Kumar",
        driverPhone: "98450 00001",
        driverLicenseNumber: "KA0120260001",
        attendantName: "Lata Devi",
        attendantPhone: "98450 00002",
        insuranceExpiresOn: addDays(today, 10),
        fitnessCertificateExpiresOn: addDays(today, 200),
        permitExpiresOn: addDays(today, -3)
      },
      asOffice()
    );
    assert.equal(bus.data.registrationNumber, "KA01AB1234");
    assert.equal(bus.data.status, "ACTIVE");
    assert.equal(bus.message, "Vehicle KA01AB1234 added (2 seats)");
    world.bus = bus.data;

    const duplicate = await request("POST", `${T}/vehicles`, {
      body: { registrationNumber: "KA01AB 1234", capacity: 9 }
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.message, "A vehicle with registration number KA01AB1234 already exists");

    const invalid = await request("POST", `${T}/vehicles`, { body: { registrationNumber: "K!", capacity: 0 } });
    assert.equal(invalid.status, 400);
    assert.deepEqual(invalid.body.error.details.map(d => d.field).sort(), ["capacity", "registrationNumber"]);

    world.van = (
      await post(
        `${T}/vehicles`,
        {
          registrationNumber: "KA02CD5678",
          capacity: 1,
          driverName: "Suresh",
          insuranceExpiresOn: addDays(today, 300)
        },
        asOffice()
      )
    ).data;
    world.spare = (await post(`${T}/vehicles`, { registrationNumber: "KA03EF9012", capacity: 30 })).data;
    world.oldBus = (
      await post(`${T}/vehicles`, {
        registrationNumber: "KA04GH0001",
        capacity: 20,
        status: "RETIRED",
        insuranceExpiresOn: addDays(today, -100)
      })
    ).data;

    await post(`${T}/vehicles`, { registrationNumber: "KA05IJ0001", capacity: 10 }, { as: h.tokens.teacher }, 403);
    assert.equal((await get(`${T}/vehicles`, { as: h.tokens.transportManager })).meta.total, 4);
    /* Teachers have no part in transport (D-51) */
    await get(`${T}/vehicles`, { as: h.tokens.teacher }, 403);
    await get(`${T}/vehicles`, { as: h.tokens.student1 }, 403);

    const renamed = await request("PATCH", `${T}/vehicles/${world.spare.id}`, {
      body: { registrationNumber: "ka 01 ab 1234" }
    });
    assert.equal(renamed.status, 409);
  });

  it("lists vehicles with documents expiring within N days", async () => {
    const soon = await get(`${T}/vehicles?expiringWithinDays=30`, { as: h.tokens.principal });
    assert.deepEqual(
      soon.data.map(v => v.registrationNumber),
      ["KA01AB1234"],
      "retired vehicles and far-off expiries are left out"
    );
    assert.equal(soon.message, "1 vehicle(s) with documents expiring within 30 days");
    assert.deepEqual(
      soon.data[0].expiringDocuments.map(d => [d.document, d.daysLeft, d.isExpired]),
      [
        ["INSURANCE", 10, false],
        ["PERMIT", -3, true]
      ]
    );

    const year = await get(`${T}/vehicles?expiringWithinDays=365`);
    assert.deepEqual(
      year.data.map(v => v.registrationNumber),
      ["KA01AB1234", "KA02CD5678"]
    );
    assert.equal(year.data[0].expiringDocuments.length, 3);

    const retired = await get(`${T}/vehicles?status=RETIRED&expiringWithinDays=30`);
    assert.deepEqual(
      retired.data.map(v => v.registrationNumber),
      ["KA04GH0001"]
    );
    await get(`${T}/vehicles?expiringWithinDays=-1`, {}, 400);
    await get(`${T}/vehicles?status=PARKED`, {}, 400);
  });
});

describe("transport: routes", () => {
  it("creates a route with ordered stops; a vehicle serves one route", async () => {
    const r1 = await post(
      `${T}/routes`,
      {
        name: "North Loop",
        code: "r1",
        vehicleId: world.bus.id,
        stops: [
          { name: "Market Road", pickupTime: "07:10", dropTime: "15:40", landmark: "Clock tower", monthlyFee: 1200.5 },
          { name: "Lake View", pickupTime: "07:25", dropTime: "15:25", monthlyFee: 1000 },
          { name: "School Gate", pickupTime: "07:45", dropTime: "15:10" }
        ]
      },
      asOffice()
    );
    assert.equal(r1.message, "Route R1 (North Loop) with 3 stop(s) created");
    assert.deepEqual(
      r1.data.stops.map(s => [s.sequence, s.name, s.pickupTime, s.monthlyFee]),
      [
        [1, "Market Road", "07:10:00", 1200.5],
        [2, "Lake View", "07:25:00", 1000],
        [3, "School Gate", "07:45:00", 0]
      ]
    );
    assert.equal(r1.data.vehicle.registrationNumber, "KA01AB1234");
    assert.deepEqual(r1.data.occupancy, {
      academicYearId: world.y1.id,
      yearName: "2026-27",
      capacity: 2,
      assigned: 0,
      available: 2
    });
    world.r1 = r1.data;
    [world.market, world.lake, world.gate] = r1.data.stops;

    const taken = await request("POST", `${T}/routes`, {
      body: { name: "South Loop", vehicleId: world.bus.id, stops: [{ name: "Temple" }] }
    });
    assert.equal(taken.status, 409);
    assert.equal(taken.body.message, "Vehicle KA01AB1234 already serves Route R1 (North Loop)");

    const sameName = await request("POST", `${T}/routes`, {
      body: { name: "North Loop", stops: [{ name: "Temple" }] }
    });
    assert.equal(sameName.status, 409);
    assert.equal(sameName.body.message, "A route named North Loop already exists");

    const retired = await request("POST", `${T}/routes`, {
      body: { name: "Old Loop", vehicleId: world.oldBus.id, stops: [{ name: "Temple" }] }
    });
    assert.equal(retired.status, 422);
    assert.equal(retired.body.message, "Vehicle KA04GH0001 is retired");

    /* Code generated; stops ordered by the sequence sent */
    const r2 = await post(`${T}/routes`, {
      name: "South Loop",
      vehicleId: world.van.id,
      stops: [
        { name: "Temple", sequence: 2, pickupTime: "07:30" },
        { name: "Bus Stand", sequence: 1, pickupTime: "07:15" }
      ]
    });
    assert.equal(r2.data.code, "RT-001");
    assert.deepEqual(
      r2.data.stops.map(s => s.name),
      ["Bus Stand", "Temple"]
    );
    world.r2 = r2.data;
    [world.busStand, world.temple] = r2.data.stops;

    const mixed = await request("POST", `${T}/routes`, {
      body: {
        name: "Mixed",
        stops: [{ name: "A", sequence: 1 }, { name: "a" }, { name: "B", pickupTime: "7am" }]
      }
    });
    assert.equal(mixed.status, 400);
    assert.deepEqual(mixed.body.error.details.map(d => d.field).sort(), ["stops", "stops", "stops.2.pickupTime"]);

    await post(`${T}/routes`, { name: "Teacher Loop", stops: [{ name: "X" }] }, { as: h.tokens.teacher }, 403);
    const list = await get(`${T}/routes`, { as: h.tokens.transportManager });
    assert.deepEqual(
      list.data.map(r => [r.code, r.occupancy.capacity]),
      [
        ["R1", 2],
        ["RT-001", 1]
      ]
    );
    await get(`${T}/vehicles/${world.bus.id}`, { as: h.tokens.otherAdmin }, 404);
  });
});

describe("transport: assignments", () => {
  it("assigns an enrolled student to a stop on a route", async () => {
    const assigned = await post(
      `${T}/assignments`,
      { studentId: world.s1.id, routeId: world.r1.id, stopId: world.market.id, startDate: "2026-07-01" },
      asOffice()
    );
    assert.equal(
      assigned.message,
      "Transport assigned. Fstudent1 Lstudent1: Route R1, stop Market Road (pickup 07:10)"
    );
    assert.equal(assigned.data.direction, "BOTH");
    assert.equal(assigned.data.status, "ACTIVE");
    assert.equal(assigned.data.endDate, null);
    assert.equal(assigned.data.academicYearId, world.y1.id);
    assert.equal(assigned.data.stop.name, "Market Road");
    world.a1 = assigned.data;
  });

  it("refuses a stop on another route, a second assignment and a year without enrollment", async () => {
    const body = { studentId: world.s2.id, routeId: world.r1.id, stopId: world.temple.id };
    const foreignStop = await request("POST", `${T}/assignments`, { body });
    assert.equal(foreignStop.status, 422);
    assert.equal(foreignStop.body.message, "The selected stop is not on Route R1");

    const twice = await request("POST", `${T}/assignments`, {
      body: { studentId: world.s1.id, routeId: world.r2.id, stopId: world.temple.id }
    });
    assert.equal(twice.status, 409);
    assert.equal(
      twice.body.message,
      "Fstudent1 Lstudent1 already uses Route R1 in 2026-27; change or end that assignment instead"
    );

    const nextYear = await request("POST", `${T}/assignments`, {
      body: { studentId: world.s1.id, routeId: world.r1.id, stopId: world.market.id },
      headers: { "x-academic-year-id": world.y2.id }
    });
    assert.equal(nextYear.status, 422);
    assert.equal(nextYear.body.message, "Fstudent1 Lstudent1 is not enrolled in 2027-28");

    const outside = await request("POST", `${T}/assignments`, {
      body: { ...body, stopId: world.lake.id, startDate: "2025-01-01" }
    });
    assert.equal(outside.status, 422);
    assert.equal(outside.body.message, "startDate must fall within 2026-27 (2026-06-01 to 2027-03-31)");

    await post(`${T}/assignments`, { ...body, studentId: uuid() }, {}, 422);
    await post(`${T}/assignments`, { ...body, stopId: world.lake.id, direction: "SOMETIMES" }, {}, 400);
    await post(`${T}/assignments`, { ...body, stopId: world.lake.id }, { as: h.tokens.teacher }, 403);
    await post(`${T}/assignments`, { ...body, stopId: world.lake.id }, { as: h.tokens.principal }, 403);
  });

  it("gives the last seat to exactly one of several concurrent requests", async () => {
    /* s2, s3 and the two students imported in suite 06 race for R1's last seat */
    const imported = (await get("/api/v1/users/students?limit=100")).data.filter(s =>
      ["Ira", "Kabir"].includes(s.user.firstName)
    );
    const contenders = [world.s2, world.s3, ...imported];
    assert.equal(contenders.length, 4);

    const attempt = student =>
      request("POST", `${T}/assignments`, {
        as: h.tokens.transportManager,
        body: {
          studentId: student.id,
          routeId: world.r1.id,
          stopId: world.lake.id,
          direction: "PICKUP_ONLY",
          startDate: "2026-08-01"
        }
      });
    /* Hold the route's row lock so all four requests are in flight at once and must queue on it */
    const blocker = await h.pool.connect();
    let results;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM transport_routes WHERE id = $1 FOR UPDATE", [world.r1.id]);
      let finished = 0;
      const pending = contenders.map(student => attempt(student).finally(() => finished++));
      await new Promise(resolve => setTimeout(resolve, 300));
      assert.equal(finished, 0, "every request waits for the route lock");
      await blocker.query("COMMIT");
      results = await Promise.all(pending);
    } finally {
      blocker.release();
    }
    assert.deepEqual(results.map(r => r.status).sort(), [201, 422, 422, 422]);
    for (const lost of results.filter(r => r.status === 422)) {
      assert.equal(lost.body.message, "Route R1 is full (2 of 2 seats)");
    }
    assert.equal(await activeOnRoute(world.r1.id), 2);

    world.winner = results.find(r => r.status === 201).body.data;
    world.loser = world.winner.studentId === world.s2.id ? world.s3 : world.s2;

    const route = await get(`${T}/routes/${world.r1.id}`, { as: h.tokens.accountant });
    assert.deepEqual([route.data.occupancy.assigned, route.data.occupancy.available], [2, 0]);
    assert.deepEqual(
      route.data.stops.map(s => s.assignedCount),
      [1, 1, 0]
    );
  });

  it("refuses a full route with a readable message", async () => {
    const full = await request("POST", `${T}/assignments`, {
      body: { studentId: world.loser.id, routeId: world.r1.id, stopId: world.gate.id }
    });
    assert.equal(full.status, 422);
    assert.equal(full.body.message, "Route R1 is full (2 of 2 seats)");
  });

  it("changes a student's route atomically and frees the old seat", async () => {
    const moved = await post(
      `${T}/assignments/${world.winner.id}/change`,
      { routeId: world.r2.id, stopId: world.busStand.id, effectiveDate: "2026-09-01" },
      asOffice()
    );
    assert.match(moved.message, /^Transport changed from 2026-09-01\. F\S+ L\S+: Route RT-001, stop Bus Stand/);
    assert.equal(moved.data.previousAssignmentId, world.winner.id);
    assert.equal(moved.data.direction, "PICKUP_ONLY", "direction carries over");
    assert.equal(moved.data.startDate, "2026-09-01");
    world.moved = moved.data;

    const old = await get(`${T}/assignments/${world.winner.id}`);
    assert.deepEqual([old.data.status, old.data.endDate], ["ENDED", "2026-08-31"]);
    await post(`${T}/assignments/${world.winner.id}/change`, { routeId: world.r1.id, stopId: world.gate.id }, {}, 409);

    /* The freed seat on R1 goes to the student who lost the race */
    world.loserAssignment = (
      await post(`${T}/assignments`, { studentId: world.loser.id, routeId: world.r1.id, stopId: world.gate.id })
    ).data;

    /* R2 (1 seat) is now full: the change rolls back and s1 stays on R1 */
    const blocked = await request("POST", `${T}/assignments/${world.a1.id}/change`, {
      body: { routeId: world.r2.id, stopId: world.temple.id }
    });
    assert.equal(blocked.status, 422);
    assert.equal(blocked.body.message, "Route RT-001 is full (1 of 1 seats)");
    assert.equal((await get(`${T}/assignments/${world.a1.id}`)).data.status, "ACTIVE");

    const same = await request("POST", `${T}/assignments/${world.a1.id}/change`, {
      body: { routeId: world.r1.id, stopId: world.market.id }
    });
    assert.equal(same.status, 422);
    assert.equal(same.body.message, "The student already uses this route and stop");

    /* Same route, another stop: the student's own seat is reused */
    const lake = await post(`${T}/assignments/${world.a1.id}/change`, {
      routeId: world.r1.id,
      stopId: world.lake.id,
      effectiveDate: "2026-07-01"
    });
    assert.equal(lake.data.stop.name, "Lake View");
    const firstRow = await get(`${T}/assignments/${world.a1.id}`);
    assert.equal(firstRow.data.endDate, "2026-07-01", "a same-day change never ends before it started");
    world.a1 = (
      await post(
        `${T}/assignments/${lake.data.id}/change`,
        { routeId: world.r1.id, stopId: world.market.id },
        asOffice()
      )
    ).data;
    await post(
      `${T}/assignments/${world.a1.id}/change`,
      { routeId: world.r1.id, stopId: world.gate.id },
      { as: h.tokens.teacher },
      403
    );
  });

  it("ends an assignment", async () => {
    const early = await request("POST", `${T}/assignments/${world.moved.id}/end`, { body: { endDate: "2026-08-01" } });
    assert.equal(early.status, 422);
    assert.equal(early.body.message, "endDate must be on or after the start date (2026-09-01)");

    const ended = await post(`${T}/assignments/${world.moved.id}/end`, { endDate: "2026-12-20" }, asOffice(), 200);
    assert.match(ended.message, /^Transport ended for F\S+ L\S+\. Last day 2026-12-20$/);
    assert.deepEqual([ended.data.status, ended.data.endDate], ["ENDED", "2026-12-20"]);

    const again = await request("POST", `${T}/assignments/${world.moved.id}/end`, { body: {} });
    assert.equal(again.status, 409);
    assert.equal(again.body.message, "This assignment already ended on 2026-12-20");
    await post(`${T}/assignments/${uuid()}/end`, {}, {}, 404);
    await post(`${T}/assignments/not-an-id/end`, {}, {}, 400);

    /* With the old one ended, the student may be assigned again in the year */
    world.rejoined = (
      await post(`${T}/assignments`, {
        studentId: world.moved.studentId,
        routeId: world.r2.id,
        stopId: world.temple.id,
        direction: "DROP_ONLY"
      })
    ).data;
  });

  it("lists assignments by route, stop and student", async () => {
    const onR1 = await get(`${T}/assignments?routeId=${world.r1.id}&status=ACTIVE`, { as: h.tokens.transportManager });
    assert.deepEqual(onR1.data.map(a => a.studentId).sort(), [world.s1.id, world.loser.id].sort());
    const atGate = await get(`${T}/assignments?stopId=${world.gate.id}`);
    assert.deepEqual(
      atGate.data.map(a => a.studentId),
      [world.loser.id]
    );
    const history = await get(`${T}/assignments?studentId=${world.s1.id}`);
    assert.equal(history.meta.total, 3);
    assert.deepEqual(history.data.map(a => a.status).sort(), ["ACTIVE", "ENDED", "ENDED"]);
    await get(`${T}/assignments?routeId=x`, {}, 400);
    await get(`${T}/assignments`, { as: h.tokens.mother }, 403);
  });
});

describe("transport: rules on routes and vehicles in use", () => {
  it("replaces stops but refuses to drop ones students use", async () => {
    const dropMarket = await request("PATCH", `${T}/routes/${world.r1.id}`, {
      body: {
        stops: [
          { id: world.lake.id, name: "Lake View" },
          { id: world.gate.id, name: "School Gate" }
        ]
      }
    });
    assert.equal(dropMarket.status, 409);
    assert.equal(
      dropMarket.body.message,
      "Students still use stop(s) Market Road (1); end or move their assignments before removing the stop"
    );

    /* Reorder (swap Lake View and School Gate), rename, add, and drop the unused-but-new stop later */
    const reordered = await patch(
      `${T}/routes/${world.r1.id}`,
      {
        stops: [
          { id: world.market.id, name: "Market Road", pickupTime: "07:10", dropTime: "15:40" },
          { id: world.gate.id, name: "School Gate", pickupTime: "07:20" },
          { id: world.lake.id, name: "Lake View East", pickupTime: "07:35" },
          { name: "Hill Top", pickupTime: "07:50" }
        ]
      },
      asOffice()
    );
    assert.equal(reordered.message, "Route R1 (North Loop) with 4 stop(s) updated");
    assert.deepEqual(
      reordered.data.stops.map(s => [s.sequence, s.name]),
      [
        [1, "Market Road"],
        [2, "School Gate"],
        [3, "Lake View East"],
        [4, "Hill Top"]
      ]
    );
    assert.equal(reordered.data.stops[2].id, world.lake.id, "kept stops keep their id");
    assert.equal(reordered.data.stops[0].landmark, null, "the list is a full replacement");

    const trimmed = await patch(`${T}/routes/${world.r1.id}`, {
      stops: reordered.data.stops
        .slice(0, 3)
        .map(({ id, name, pickupTime, dropTime }) => ({ id, name, pickupTime, ...(dropTime && { dropTime }) }))
    });
    assert.equal(trimmed.data.stops.length, 3);

    const foreign = await request("PATCH", `${T}/routes/${world.r1.id}`, {
      body: { stops: [{ id: world.temple.id, name: "Temple" }] }
    });
    assert.equal(foreign.status, 422);
    assert.match(foreign.body.message, /^Stop .+ \(Temple\) is not on Route R1$/);
  });

  it("guards vehicles that serve a route", async () => {
    const shrink = await request("PATCH", `${T}/vehicles/${world.bus.id}`, { body: { capacity: 1 } });
    assert.equal(shrink.status, 422);
    assert.equal(shrink.body.message, "Route R1 has 2 students assigned; the vehicle needs at least 2 seats");

    const retire = await request("PATCH", `${T}/vehicles/${world.bus.id}`, { body: { status: "RETIRED" } });
    assert.equal(retire.status, 409);
    assert.equal(
      retire.body.message,
      "Vehicle KA01AB1234 serves Route R1; give the route another vehicle before retiring it"
    );
    await del(`${T}/vehicles/${world.bus.id}`, {}, 409);

    const vanTaken = await request("PATCH", `${T}/routes/${world.r1.id}`, { body: { vehicleId: world.van.id } });
    assert.equal(vanTaken.status, 409);

    /* Move R1 to the spare bus; the old bus is free to retire */
    const swapped = await patch(`${T}/routes/${world.r1.id}`, { vehicleId: world.spare.id }, asOffice());
    assert.equal(swapped.data.occupancy.capacity, 30);
    const freed = await patch(`${T}/vehicles/${world.bus.id}`, { status: "IN_MAINTENANCE", capacity: 1 }, asOffice());
    assert.equal(freed.data.route, null);
    assert.equal(freed.message, "Vehicle KA01AB1234 updated");

    const vehicle = await get(`${T}/vehicles/${world.spare.id}`);
    assert.deepEqual(vehicle.data.route, { id: world.r1.id, name: "North Loop", code: "R1" });

    await del(`${T}/routes/${world.r1.id}`, {}, 409);
    await del(`${T}/vehicles/${world.oldBus.id}`, { as: h.tokens.transportManager });
    await get(`${T}/vehicles/${world.oldBus.id}`, {}, 404);
  });
});

describe("transport: roster and self-service", () => {
  it("lists the roster by stop with class, roll number and parent phone", async () => {
    const mother = (await get(`/api/v1/users/parents/${world.motherId}`)).data;
    await patch(`/api/v1/users/${mother.userId}`, { phone: "9000011111" });

    const roster = await get(`${T}/routes/${world.r1.id}/roster`, { as: h.tokens.transportManager });
    /* Parent phone numbers on rosters are not for teachers (D-51) */
    await get(`${T}/routes/${world.r1.id}/roster`, { as: h.tokens.teacher }, 403);
    assert.equal(roster.message, "Route R1 roster: 2 student(s) across 3 stop(s)");
    assert.deepEqual(
      roster.data.stops.map(s => [s.sequence, s.name, s.students.length]),
      [
        [1, "Market Road", 1],
        [2, "School Gate", 1],
        [3, "Lake View East", 0]
      ]
    );
    const [s1] = roster.data.stops[0].students;
    assert.deepEqual(
      { ...s1, assignmentId: undefined },
      {
        assignmentId: undefined,
        studentId: world.s1.id,
        studentCode: world.s1.studentCode,
        name: "Fstudent1 Lstudent1",
        classSection: "Class 1-A",
        rollNumber: "1A-001",
        direction: "BOTH",
        parentName: "Fmother Lmother",
        parentPhone: "9000011111"
      }
    );
    assert.equal(roster.data.vehicle.registrationNumber, "KA03EF9012");

    const csv = await request("GET", `${T}/routes/${world.r1.id}/roster?format=csv`, { as: h.tokens.transportManager });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get("content-type"), /^text\/csv/);
    assert.match(csv.headers.get("content-disposition"), /route-R1-roster\.csv/);
    const lines = csv.buffer
      .toString()
      .replace(/^\uFEFF/, "")
      .trim()
      .split("\r\n");
    assert.equal(lines[0], "Stop #,Stop,Pickup,Drop,Student,Class-Section,Roll No,Direction,Parent,Parent Phone");
    assert.equal(
      lines[1],
      "1,Market Road,07:10,15:40,Fstudent1 Lstudent1,Class 1-A,1A-001,BOTH,Fmother Lmother,9000011111"
    );
    assert.equal(lines.length, 3);
    assert.match(lines[2], /^2,School Gate,07:20,,/);

    const xlsx = await request("GET", `${T}/routes/${world.r1.id}/roster?format=xlsx`);
    assert.equal(xlsx.status, 200);
    assert.equal(xlsx.buffer.subarray(0, 2).toString(), "PK");

    await get(`${T}/routes/${world.r1.id}/roster?format=pdf`, {}, 400);
    await get(`${T}/routes/${uuid()}/roster`, {}, 404);
    await get(`${T}/routes/${world.r1.id}/roster`, { as: h.tokens.student1 }, 403);
  });

  it("shows a student their transport and a parent only their own children", async () => {
    const mine = await get(`${T}/my-transport`, { as: h.tokens.student1 });
    assert.equal(mine.data.length, 1);
    const [entry] = mine.data;
    assert.equal(entry.student.id, world.s1.id);
    assert.equal(entry.transport.route.code, "R1");
    assert.deepEqual(
      [entry.transport.stop.name, entry.transport.stop.pickupTime, entry.transport.stop.dropTime],
      ["Market Road", "07:10:00", "15:40:00"]
    );
    assert.equal(entry.transport.vehicle.registrationNumber, "KA03EF9012");
    assert.deepEqual(entry.transport.driver, { name: null, phone: null });
    assert.equal(mine.message, "1 of 1 student(s) use school transport");

    /* Give the spare bus a crew and the parent sees it */
    await patch(`${T}/vehicles/${world.spare.id}`, { driverName: "Anil", driverPhone: "98450 00009" });
    const family = await get(`${T}/my-transport`, { as: h.tokens.mother });
    const children = family.data.map(e => e.student.id);
    assert.ok(children.includes(world.s1.id) && children.includes(world.s2.id));
    assert.ok(!children.includes(world.s3.id), "another family's child is not shown");
    assert.equal(family.data.length, 3, "s1, s2 and the imported sibling");
    const s1Entry = family.data.find(e => e.student.id === world.s1.id);
    assert.deepEqual(s1Entry.transport.driver, { name: "Anil", phone: "98450 00009" });

    /* DROP_ONLY riders see no pickup time */
    const s2Entry = family.data.find(e => e.student.id === world.s2.id);
    if (s2Entry.transport?.direction === "DROP_ONLY") assert.equal(s2Entry.transport.stop.pickupTime, null);

    await get(`${T}/my-transport`, { as: h.tokens.teacher }, 403);
    await get(`${T}/my-transport`, { as: h.tokens.admin }, 403);
  });
});

describe("transport: students who leave", () => {
  it("releases the seat of a student who leaves the school (D-52)", async () => {
    const vehicle = (await post(`${T}/vehicles`, { registrationNumber: "KA09ZZ0909", capacity: 5 })).data;
    const route = (
      await post(`${T}/routes`, { name: "Leavers Loop", vehicleId: vehicle.id, stops: [{ name: "Gate" }] })
    ).data;
    const student = (
      await post("/api/v1/users/students", {
        user: person("leaver"),
        profile: { admissionNumber: "ADM-LEAVER" },
        parents: [],
        enrollment: { academicYearId: world.y1.id, sectionId: world.s2A.id }
      })
    ).data;
    const seat = (
      await post(
        `${T}/assignments`,
        { studentId: student.id, routeId: route.id, stopId: route.stops[0].id },
        { as: h.tokens.transportManager }
      )
    ).data;
    assert.equal(seat.status, "ACTIVE");

    await patch(`/api/v1/academics/enrollments/${student.enrollment.id}`, { status: "LEFT" });
    await settleJobs();
    const after = await get(`${T}/assignments/${seat.id}`, { as: h.tokens.transportManager });
    assert.equal(after.data.status, "ENDED");
    assert.ok(after.data.endDate);
  });
});
