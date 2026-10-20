import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, get, patch, post, settleJobs } from "../helpers/harness.js";

/* Admit cards (academics/admit-cards) follow the exam's papers after they are issued.
   Uses the Mid Term and its Class 1-A paper; removes the cards it issues. */

const A = "/api/v1/academics";
const inYear = () => ({ headers: { "x-academic-year-id": world.exam.academicYearId } });

const papersUrl = () => `${A}/exams/${world.exam.id}/papers`;
const t = {};

/* The paper's line on the student's card (codes may have been renamed since: read it now) */
const paperLine = async studentId => {
  const card = (await get(`${A}/exams/${world.exam.id}/admit-cards`, inYear())).data.find(c => c.studentId === studentId);
  return card?.papers.find(p => p.displayCode === t.paper.displayCode);
};

describe("admit cards", () => {
  it("keeps issued cards' papers in step with the exam's schedule", async () => {
    t.paper = (await get(papersUrl(), inYear())).data.find(p => p.id === world.paper.id);
    const generated = await post(`${A}/exams/${world.exam.id}/admit-cards`, {}, inYear(), 200);
    assert.ok(generated.data.issued > 0);
    const before = await paperLine(world.s1.id);
    assert.ok(before, "the card lists the paper");

    /* Another room: the card shows it once the change has been handled */
    const original = t.paper;
    await patch(`${A}/exams/${world.exam.id}/papers/${world.paper.id}`, { room: "Hall 7" });
    await settleJobs();
    assert.equal((await paperLine(world.s1.id)).room, "Hall 7");
    assert.equal((await paperLine(world.s1.id)).startTime, before.startTime, "the rest is unchanged");

    if (original.room) await patch(`${A}/exams/${world.exam.id}/papers/${world.paper.id}`, { room: original.room });
    await settleJobs();
    await h.pool.query("DELETE FROM admit_cards WHERE tenant_id = $1", [h.tenant.id]);
  });
});
