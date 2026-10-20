import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, request, get, post, patch } from "../helpers/harness.js";

/* Class subject codes: the subject's code, the class's stage and position (Policy › Subject
   codes), then 1 required / 0 optional (GEO311). Class 4 (3-1 by default) is moved around;
   Class 1 has exam papers since 04, so its codes are fixed. */

const A = "/api/v1/academics";
const SLOTS = `${A}/subject-codes/slots`;

const t = {};
const slotOf = async klass => (await get(SLOTS)).data.find(s => s.classId === klass.id);
const classSubject = async (klass, subject) =>
  (await get(`${A}/class-subjects?classId=${klass.id}&limit=100`)).data.find(r => r.subjectId === subject.id);
const sectionCode = async (section, subject) =>
  (await get(`${A}/section-subjects?sectionId=${section.id}&limit=100`)).data.find(r => r.subjectId === subject.id)
    .displayCode;

describe("subject codes", () => {
  it("gives a new class its level's default place", async () => {
    t.c4 = (await post(`${A}/classes`, { className: "Class 4" })).data;
    t.s4A = (await post(`${A}/sections`, { classId: t.c4.id, sectionName: "A" })).data;
    const slot = await slotOf(t.c4);
    assert.deepEqual(
      [slot.stage, slot.position, slot.defaultStage, slot.defaultPosition, slot.locked],
      [3, 1, 3, 1, false]
    );
    const slots = (await get(SLOTS, { as: h.tokens.teacher })).data;
    assert.ok(slots.every((s, i) => i === 0 || slots[i - 1].classOrder < s.classOrder), "classes in order");
  });

  it("codes a class subject and its sections: subject, stage, position, required or optional", async () => {
    const added = await post(`${A}/class-subjects`, {
      classId: t.c4.id,
      subject: { subjectName: "Geography", subjectCode: "geo" }
    });
    t.geo = added.data.subject;
    assert.equal(added.data.code, "GEO311");
    assert.equal(await sectionCode(t.s4A, t.geo), "GEO311-A");

    const optional = await patch(`${A}/class-subjects/${added.data.id}`, { isOptional: true });
    assert.equal(optional.data.code, "GEO310");
    assert.equal(await sectionCode(t.s4A, t.geo), "GEO310-A");
  });

  it("renames the codes with the subject's code while none is used", async () => {
    await patch(`${A}/subjects/${t.geo.id}`, { subjectCode: "geog" });
    assert.equal((await classSubject(t.c4, t.geo)).code, "GEOG310");
    assert.equal(await sectionCode(t.s4A, t.geo), "GEOG310-A");

    const digits = await request("PATCH", `${A}/subjects/${t.geo.id}`, { body: { subjectCode: "GE01" } });
    assert.equal(digits.status, 400);
    assert.equal(digits.body.message, "Invalid request: subjectCode must be 2-6 letters");
  });

  it("moves a class to another place and renews its codes", async () => {
    const moved = await request("PUT", SLOTS, { body: { slots: [{ classId: t.c4.id, stage: 3, position: 9 }] } });
    assert.equal(moved.status, 200);
    assert.equal(moved.body.message, "Subject code places saved; 1 subject code renewed");
    assert.equal(moved.body.data.find(s => s.classId === t.c4.id).position, 9);
    assert.equal((await classSubject(t.c4, t.geo)).code, "GEOG390");
    assert.equal(await sectionCode(t.s4A, t.geo), "GEOG390-A");

    const unchanged = await request("PUT", SLOTS, { body: { slots: [{ classId: t.c4.id, stage: 3, position: 9 }] } });
    assert.equal(unchanged.body.message, "Subject code places saved");

    const shared = await request("PUT", SLOTS, { body: { slots: [{ classId: t.c4.id, stage: 2, position: 1 }] } });
    assert.equal(shared.status, 422);
    assert.match(shared.body.message, /Class 1 .*cannot share place 2-1|Class 4 .*cannot share place 2-1/);

    const twice = await request("PUT", SLOTS, {
      body: {
        slots: [
          { classId: t.c4.id, stage: 3, position: 8 },
          { classId: world.c1.id, stage: 3, position: 8 }
        ]
      }
    });
    assert.equal(twice.status, 400);

    const outOfRange = await request("PUT", SLOTS, { body: { slots: [{ classId: t.c4.id, stage: 0, position: 1 }] } });
    assert.equal(outOfRange.status, 400);
    const teacher = await request("PUT", SLOTS, {
      as: h.tokens.teacher,
      body: { slots: [{ classId: t.c4.id, stage: 3, position: 7 }] }
    });
    assert.equal(teacher.status, 403);
  });

  it("leaves a new class without a place when its default is taken; it needs one before subjects", async () => {
    await request("PUT", SLOTS, { body: { slots: [{ classId: t.c4.id, stage: 4, position: 2 }] } });
    t.c9 = (await post(`${A}/classes`, { className: "Class 9" })).data;
    const slot = await slotOf(t.c9);
    assert.deepEqual([slot.stage, slot.position, slot.defaultStage, slot.defaultPosition], [null, null, 4, 2]);

    const noPlace = await request("POST", `${A}/class-subjects`, { body: { classId: t.c9.id, subjectId: t.geo.id } });
    assert.equal(noPlace.status, 422);
    assert.equal(noPlace.body.message, "Class 9 has no place in the subject codes yet: set it under Policy › Subject codes");

    await request("PUT", SLOTS, { body: { slots: [{ classId: t.c9.id, stage: 4, position: 8 }] } });
    const added = await post(`${A}/class-subjects`, { classId: t.c9.id, subjectId: t.geo.id });
    assert.equal(added.data.code, "GEOG481");
  });

  it("keeps a code fixed once an exam paper uses it", async () => {
    const slot = await slotOf(world.c1);
    assert.equal(slot.locked, true);
    const move = await request("PUT", SLOTS, { body: { slots: [{ classId: world.c1.id, stage: 2, position: 9 }] } });
    assert.equal(move.status, 409);
    assert.equal(
      move.body.message,
      "Class 1 keeps its place: subject codes already used by exam papers, assessments or an archived year"
    );

    const maths = await classSubject(world.c1, world.math);
    const flip = await request("PATCH", `${A}/class-subjects/${maths.id}`, { body: { isOptional: !maths.isOptional } });
    assert.equal(flip.status, 409);
    assert.equal(
      flip.body.message,
      `Mathematics in Class 1 cannot become ${maths.isOptional ? "required" : "optional"}: ${maths.code} already used by exam papers or assessments`
    );

    const rename = await request("PATCH", `${A}/subjects/${world.math.id}`, { body: { subjectCode: "MAT" } });
    assert.equal(rename.status, 409);
    assert.match(rename.body.message, /^Mathematics's code cannot change: .*already used by exam papers or assessments$/);
  });
});
