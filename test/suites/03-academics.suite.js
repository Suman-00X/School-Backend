import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, request, get, post, patch, del, count, person, uuid, tokenFor } from "../helpers/harness.js";

const A = "/api/v1/academics";
const U = "/api/v1/users";

describe("academics: structure", () => {
  it("manages academic years with a single current year", async () => {
    world.y1 = (
      await post(`${A}/academic-years`, {
        yearName: "2026-27",
        startDate: "2026-06-01",
        endDate: "2027-03-31",
        isCurrent: true
      })
    ).data;
    world.y2 = (await post(`${A}/academic-years`, { startDate: "2027-06-01", endDate: "2028-03-31" })).data;
    assert.equal(world.y1.isCurrent, true);
    /* The name comes from the dates */
    assert.equal(world.y2.yearName, "2027-28");

    const duplicate = await request("POST", `${A}/academic-years`, {
      body: { yearName: "2026-27", startDate: "2026-06-01", endDate: "2027-03-31" }
    });
    assert.equal(duplicate.status, 409);
    assert.equal(
      duplicate.body.message,
      "2026-06-01 to 2027-03-31 overlaps academic year 2026-27 (2026-06-01 to 2027-03-31). Academic years cannot overlap."
    );

    const backwards = await request("POST", `${A}/academic-years`, {
      body: { yearName: "x", startDate: "2026-06-01", endDate: "2026-01-01" }
    });
    assert.equal(backwards.status, 400);
    assert.equal(backwards.body.message, "Invalid request: endDate must be after startDate");

    assert.equal((await get(`${A}/academic-years/current`)).data.id, world.y1.id);
    const page = await get(`${A}/academic-years?limit=1`);
    assert.deepEqual(page.meta, { page: 1, limit: 1, total: 2, totalPages: 2 });
  });

  it("creates classes and subjects (bulk is all-or-nothing)", async () => {
    const created = await post(`${A}/classes/bulk`, {
      classes: [
        { className: "Class 1", classOrder: 1 },
        { className: "Class 2", classOrder: 2 }
      ]
    });
    assert.equal(created.message, "2 classes created successfully");
    [world.c1, world.c2] = created.data;

    await post(
      `${A}/classes/bulk`,
      {
        classes: [
          { className: "Class 3", classOrder: 3 },
          { className: "Class 1", classOrder: 4 }
        ]
      },
      {},
      409
    );
    assert.equal(await count("classes"), 2);

    await patch(`${A}/classes/${world.c1.id}`, {}, {}, 400);
    assert.equal(
      (await patch(`${A}/classes/${world.c1.id}`, { description: "First grade" })).message,
      "Class updated successfully"
    );
    await request("PUT", `${A}/classes/${world.c1.id}`, { body: { description: "x" } }).then(r =>
      assert.equal(r.status, 404)
    );

    world.math = (await post(`${A}/subjects`, { subjectName: "Mathematics", subjectCode: "ma" })).data;
    assert.equal(world.math.subjectCode, "MA");
    world.english = (
      await post(`${A}/subjects`, { subjectName: "English", subjectCode: "EN" }, { as: h.tokens.principal })
    ).data;

    const accountant = await request("POST", `${A}/classes`, {
      as: h.tokens.accountant,
      body: { className: "X", classOrder: 9 }
    });
    assert.equal(accountant.status, 403);
  });

  it("creates sections in the current or a named academic year", async () => {
    const badTeacher = await request("POST", `${A}/sections`, {
      body: { classId: world.c1.id, sectionName: "Z", classTeacherId: uuid() }
    });
    assert.equal(badTeacher.status, 422);
    assert.equal(badTeacher.body.message, "classTeacherId does not refer to an existing teacher");

    world.s1A = (
      await post(`${A}/sections`, { classId: world.c1.id, sectionName: "a", classTeacherId: world.teacher.id })
    ).data;
    assert.equal(world.s1A.sectionName, "A");
    assert.equal(world.s1A.academicYearId, world.y1.id);
    world.s2A = (await post(`${A}/sections/bulk`, { sections: [{ classId: world.c2.id, sectionName: "A" }] })).data[0];
    world.s2ANext = (
      await post(
        `${A}/sections`,
        { classId: world.c2.id, sectionName: "A" },
        { headers: { "x-academic-year-id": world.y2.id } }
      )
    ).data;

    const byClass = await get(`${A}/sections?classId=${world.c1.id}`);
    assert.equal(byClass.meta.total, 1);
    assert.equal(byClass.data[0].class.className, "Class 1");

    await get(`${A}/sections`, { headers: { "x-academic-year-id": "nope" } }, 400);
    await get(`${A}/sections`, { headers: { "x-academic-year-id": uuid() } }, 422);
  });

  it("assigns subjects and teachers to sections", async () => {
    await get(`${A}/section-subjects`, {}, 400);
    const mapped = await post(`${A}/section-subjects`, { sectionId: world.s1A.id, subjectId: world.math.id });
    assert.equal(mapped.data.displayCode, "MA210-A");
    await post(`${A}/section-subjects`, { sectionId: world.s1A.id, subjectId: world.math.id }, {}, 409);
    await post(`${A}/section-subjects`, { sectionId: world.s1A.id, subjectId: world.english.id });
    assert.equal((await get(`${A}/section-subjects?sectionId=${world.s1A.id}`)).meta.total, 2);

    const assignment = await post(`${A}/teacher-assignments`, {
      teacherId: world.teacher.id,
      sectionId: world.s1A.id,
      subjectId: world.math.id
    });
    await post(
      `${A}/teacher-assignments`,
      { teacherId: world.teacher.id, sectionId: world.s1A.id, subjectId: world.math.id },
      {},
      409
    );
    const removed = await del(`${A}/teacher-assignments/${assignment.data.id}`);
    assert.equal(removed.message, "Teacher assignment removed successfully");
    assert.equal(removed.data, null);
    await post(`${A}/teacher-assignments`, {
      teacherId: world.teacher.id,
      sectionId: world.s1A.id,
      subjectId: world.math.id
    });
    /* teacher2 teaches English in 1A */
    await post(`${A}/teacher-assignments`, {
      teacherId: world.teacher2.id,
      sectionId: world.s1A.id,
      subjectId: world.english.id
    });

    const mine = await get(`${A}/teacher-assignments?teacherId=${world.teacher.id}`);
    assert.equal(mine.meta.total, 1);
    assert.equal(mine.data[0].teacher.user.firstName, "Fteacher");
  });
});

describe("students: admission and parents", () => {
  const admission = (key, parents, sectionId = world.s1A.id) => ({
    user: person(`student${key}`),
    parents,
    enrollment: { academicYearId: world.y1.id, sectionId }
  });

  it("admits a student with a new parent in one step", async () => {
    const res = await post(
      `${U}/students`,
      admission(1, [{ user: person("mother"), relation: "MOTHER", isPrimaryContact: true }])
    );
    assert.equal(res.message, "Student admitted successfully");
    world.s1 = res.data;
    assert.match(world.s1.studentCode, /^STU26-1-0{5}1$/);
    /* Generated: the admitting year's start year and a serial */
    assert.equal(world.s1.admissionNumber, "ADM26-0001");
    assert.equal(world.s1.enrollment.rollNumber, "1A-001");
    assert.equal(world.s1.parents.length, 1);
    world.motherId = world.s1.parents[0].parentId;
    h.tokens.student1 = tokenFor(world.s1.userId, "STUDENT");
  });

  it("admits a sibling with an existing parent, and rolls back failures", async () => {
    world.s2 = (await post(`${U}/students`, admission(2, [{ parentId: world.motherId, relation: "MOTHER" }]))).data;
    assert.equal(world.s2.enrollment.rollNumber, "1A-002");
    assert.equal(world.s2.admissionNumber, "ADM26-0002");
    assert.equal(await count("parents"), 1);

    /* A new parent whose email is taken fails after the student's account was made: all rolls back */
    const usersBefore = await count("users");
    await post(`${U}/students`, admission(3, [{ user: person("mother"), relation: "MOTHER" }]), {}, 409);
    assert.equal(await count("users"), usersBefore);

    const invalid = await request("POST", `${U}/students`, {
      body: { user: person("bad"), profile: {}, enrollment: {} }
    });
    assert.equal(invalid.status, 400);
    const fields = invalid.body.error.details.map(d => d.field);
    assert.ok(!fields.includes("profile.admissionNumber") && fields.includes("enrollment.sectionId"));

    await post(`${U}/students`, admission(4, [{ parentId: uuid(), relation: "FATHER" }]), {}, 422);

    /* A third student in Class 2-A for later suites */
    world.s3 = (await post(`${U}/students`, admission(5, [], world.s2A.id))).data;
    /* The failed admission took no number */
    assert.equal(world.s3.admissionNumber, "ADM26-0003");
  });

  it("links and unlinks parents as a nested resource", async () => {
    const parents = await get(`${U}/students/${world.s1.id}/parents`);
    assert.equal(parents.meta.total, 1);
    assert.equal(parents.data[0].parent.user.firstName, "Fmother");
    await post(`${U}/students/${world.s1.id}/parents`, { parentId: world.motherId, relation: "MOTHER" }, {}, 409);
    assert.equal(
      (await del(`${U}/students/${world.s1.id}/parents/${world.motherId}`)).message,
      "Parent unlinked from student successfully"
    );
    await del(`${U}/students/${world.s1.id}/parents/${world.motherId}`, {}, 404);
    await post(`${U}/students/${world.s1.id}/parents`, {
      parentId: world.motherId,
      relation: "MOTHER",
      isPrimaryContact: true
    });

    const parentUser = (await get(`${U}/parents/${world.motherId}`)).data;
    h.tokens.mother = tokenFor(parentUser.userId, "PARENT");
  });

  it("lists enrollments by roll number and edits them", async () => {
    const roster = await get(`${A}/enrollments?sectionId=${world.s1A.id}`);
    assert.deepEqual(
      roster.data.map(e => e.rollNumber),
      ["1A-001", "1A-002"]
    );
    assert.equal(roster.data[0].student.user.firstName, "Fstudent1");
    await post(`${A}/enrollments`, { studentId: world.s1.id, sectionId: world.s1A.id }, {}, 409);
    assert.equal(
      (await patch(`${A}/enrollments/${world.s2.enrollment.id}`, { rollNumber: "1A-010" })).data.rollNumber,
      "1A-010"
    );
  });
});
