import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { request, get, post, del, person, tokenFor } from "../helpers/harness.js";

/* Generated timetables (academics/scheduling) and the agent tools that offer them.
   Self-contained: its own academic year (2029-30), so it runs alone or after the others.
     Class 7: sections A, B; Class 8: section A
     Mathematics 6 a week, English 5, Science 4 (one double, in the LAB), Art 2
     tMath teaches Mathematics everywhere, tEng English, tSci Science, tArt Art
     Bell: periods 1 2 3, Lunch (4), 5 6 7; Monday to Saturday */

const A = "/api/v1/academics";
const S = `${A}/scheduling`;
const TOOLS = "/api/v1/agent-tools";
const MCP = "/api/v1/mcp";
const t = {};
const inYear = () => ({ headers: { "x-academic-year-id": t.year.id } });

const classFor = async level => {
  const existing = (await get(`${A}/classes?limit=100`)).data.find(c => c.level === level);
  return existing ?? (await post(`${A}/classes`, { level })).data;
};

const subject = async (subjectName, subjectCode) => {
  const existing = (await get(`${A}/subjects?limit=100`)).data.find(s => s.subjectCode === subjectCode);
  return existing ?? (await post(`${A}/subjects`, { subjectName, subjectCode })).data;
};

const lessonsOf = async sectionId => {
  const grid = (await get(`${A}/timetable/sections/${sectionId}`)).data;
  return grid.days.flatMap(day => day.slots.map(slot => ({ ...slot, weekday: day.weekday })));
};

/* No section, teacher or room twice in one cell, in the whole year */
const assertNoClashes = async sections => {
  const seen = new Set();
  for (const section of sections) {
    for (const lesson of await lessonsOf(section.id)) {
      for (const key of [`S${section.id}`, `T${lesson.teacher.id}`, lesson.room && `R${lesson.room}`].filter(Boolean)) {
        const cell = `${key}|${lesson.weekday}|${lesson.period.id}`;
        assert.ok(!seen.has(cell), `clash at ${cell}`);
        seen.add(cell);
      }
    }
  }
};

const mcp = (method, params, { as, id = 1 } = {}) =>
  request("POST", MCP, { body: { jsonrpc: "2.0", id, method, ...(params && { params }) }, as });

describe("scheduling: setup", () => {
  it("creates a year with classes, subjects, teachers and a bell schedule", async () => {
    t.year = (await post(`${A}/academic-years`, { startDate: "2029-06-01", endDate: "2030-03-31" })).data;
    const c7 = await classFor("GRADE_7");
    const c8 = await classFor("GRADE_8");
    t.c7 = c7;
    t.s7A = (await post(`${A}/sections`, { classId: c7.id, sectionName: "A" }, inYear())).data;
    t.s7B = (await post(`${A}/sections`, { classId: c7.id, sectionName: "B" }, inYear())).data;
    t.s8A = (await post(`${A}/sections`, { classId: c8.id, sectionName: "A" }, inYear())).data;
    t.sections = [t.s7A, t.s7B, t.s8A];

    t.math = await subject("Scheduling Mathematics", "SCMA");
    t.eng = await subject("Scheduling English", "SCEN");
    t.sci = await subject("Scheduling Science", "SCSC");
    t.art = await subject("Scheduling Art", "SCAR");
    t.pe = await subject("Scheduling PE", "SCPE");

    for (const key of ["tMath", "tEng", "tSci", "tArt"])
      t[key] = (await post("/api/v1/users/teachers", { user: person(`sched-${key}`) })).data;
    t.teacherToken = tokenFor(t.tMath.userId, "TEACHER");

    const weekly = [
      [t.math, t.tMath, 6],
      [t.eng, t.tEng, 5],
      [t.sci, t.tSci, 4],
      [t.art, t.tArt, 2]
    ];
    for (const section of t.sections) {
      for (const [sub, teacher, weeklyNoOfClasses] of weekly) {
        await post(`${A}/section-subjects`, { sectionId: section.id, subjectId: sub.id, weeklyNoOfClasses }, inYear());
        await post(
          `${A}/teacher-assignments`,
          { teacherId: teacher.id, sectionId: section.id, subjectId: sub.id },
          inYear()
        );
      }
    }

    const bell = [
      [1, "Period 1", "08:30", "09:15"],
      [2, "Period 2", "09:15", "10:00"],
      [3, "Period 3", "10:00", "10:45"],
      [4, "Lunch", "10:45", "11:15", true],
      [5, "Period 5", "11:15", "12:00"],
      [6, "Period 6", "12:00", "12:45"],
      [7, "Period 7", "12:45", "13:30"]
    ];
    for (const [periodNumber, name, startTime, endTime, isBreak] of bell) {
      await post(`${A}/periods`, { periodNumber, name, startTime, endTime, ...(isBreak && { isBreak }) }, inYear());
    }
  });
});

describe("scheduling: class timetables", () => {
  it("shows what a timetable would be made from", async () => {
    const inputs = (await get(`${S}/class-timetable/inputs`, inYear())).data;
    assert.equal(inputs.sections.length, 3);
    assert.equal(inputs.week.days.length, 6);
    assert.equal(inputs.week.teachingPeriodsPerWeek, 36);
    const s7A = inputs.sections.find(s => s.id === t.s7A.id);
    assert.equal(s7A.periodsNeeded, 17);
    assert.equal(inputs.teachers.find(x => x.teacherId === t.tMath.id).periodsPerWeek, 18);
    assert.deepEqual(inputs.issues, []);
  });

  it("generates a complete draft without changing the timetable", async () => {
    const res = await post(
      `${S}/class-timetable/runs`,
      {
        seed: 7,
        subjects: [
          { subjectId: t.sci.id, doublePeriods: 1, room: "LAB" },
          { subjectId: t.math.id, preferredPeriods: [1, 2, 3] }
        ],
        teacherMaxConsecutive: 3
      },
      inYear()
    );
    t.run = res.data;
    assert.equal(t.run.status, "DRAFT");
    assert.equal(t.run.kind, "CLASS_TIMETABLE");
    assert.equal(t.run.report.score.complete, true);
    assert.equal(t.run.report.score.placedPeriods, 51);
    assert.equal(t.run.result.placements.length, 51);
    assert.match(res.message, /3 sections · 51 of 51 periods placed/);
    /* the science double sits in two joined periods, never across lunch */
    const doubles = t.run.result.placements.filter(p => p.double);
    assert.equal(doubles.length, 6);
    assert.equal((await lessonsOf(t.s7A.id)).length, 0);
  });

  it("previews a section's and a teacher's week", async () => {
    const week = (await get(`${S}/runs/${t.run.id}/sections/${t.s7A.id}`)).data;
    assert.equal(week.section.name.endsWith("-A"), true);
    const lessons = week.days.flatMap(d => d.slots);
    assert.equal(lessons.length, 17);
    assert.ok(lessons.every(slot => slot.status === "NEW" && slot.subject && slot.teacher));
    const teacher = (await get(`${S}/runs/${t.run.id}/teachers/${t.tMath.id}`)).data;
    assert.equal(teacher.weeklyLessons, 18);
    await get(`${S}/runs/${t.run.id}/sections/${t.year.id}`, {}, 404);
  });

  it("lists runs without their timetables; teachers cannot generate", async () => {
    const list = await get(`${S}/runs`, inYear());
    assert.equal(list.data[0].id, t.run.id);
    assert.equal(list.data[0].result, undefined);
    await post(`${S}/class-timetable/runs`, {}, { ...inYear(), as: t.teacherToken }, 403);
    await get(`${S}/runs`, { ...inYear(), as: t.teacherToken }, 403);
  });

  it("applies the draft once", async () => {
    const res = await post(`${S}/runs/${t.run.id}/apply`, {}, {}, 200);
    assert.equal(res.data.added, 51);
    assert.equal(res.data.run.status, "APPLIED");
    assert.match(res.message, /51 lessons added/);
    assert.equal((await lessonsOf(t.s7A.id)).length, 17);
    await assertNoClashes(t.sections);
    const again = await request("POST", `${S}/runs/${t.run.id}/apply`, { body: {} });
    assert.equal(again.status, 409);
  });

  it("FILL keeps what is there; REPLACE plans again with teacher rules", async () => {
    const fill = (await post(`${S}/class-timetable/runs`, { seed: 1 }, inYear())).data;
    assert.equal(fill.report.changes.add, 0);
    assert.equal(fill.report.changes.keep, 51);
    await post(`${S}/runs/${fill.id}/discard`, {}, {}, 200);
    assert.equal((await request("POST", `${S}/runs/${fill.id}/apply`, { body: {} })).status, 409);

    const replace = (
      await post(
        `${S}/class-timetable/runs`,
        {
          mode: "REPLACE",
          seed: 3,
          teachers: [{ teacherId: t.tMath.id, unavailable: [{ weekday: 1 }] }],
          subjects: [{ subjectId: t.sci.id, doublePeriods: 1, room: "LAB" }]
        },
        inYear()
      )
    ).data;
    assert.equal(replace.report.score.complete, true);
    assert.equal(replace.report.changes.remove, 51);
    assert.ok(replace.result.placements.filter(p => p.teacherId === t.tMath.id).every(p => p.weekday !== 1));
    const applied = (await post(`${S}/runs/${replace.id}/apply`, {}, {}, 200)).data;
    assert.equal(applied.removed, 51);
    const monday = (await get(`${A}/timetable/teachers/${t.tMath.id}`, inYear())).data.days.find(d => d.weekday === 1);
    assert.equal(monday.slots.length, 0);
    await assertNoClashes(t.sections);
  });

  it("refuses a draft whose inputs changed since it was made", async () => {
    const draft = (await post(`${S}/class-timetable/runs`, { mode: "REPLACE", seed: 5 }, inYear())).data;
    const [lesson] = await lessonsOf(t.s8A.id);
    await del(`${A}/timetable/slots/${lesson.id}`);
    const stale = await request("POST", `${S}/runs/${draft.id}/apply`, { body: {} });
    assert.equal(stale.status, 409);
    assert.match(stale.body.message, /the timetable changed\. Generate a new draft/);
  });

  it("explains what it cannot place, and applies an incomplete draft only when asked", async () => {
    /* PE in 8-A has no teacher */
    await post(`${A}/section-subjects`, { sectionId: t.s8A.id, subjectId: t.pe.id, weeklyNoOfClasses: 2 }, inYear());
    const draft = (await post(`${S}/class-timetable/runs`, { mode: "REPLACE", seed: 9 }, inYear())).data;
    assert.equal(draft.report.score.complete, false);
    const noTeacher = draft.report.issues.find(i => i.code === "NO_TEACHER");
    assert.match(noTeacher.message, /has no teacher assigned, so its 2 classes cannot be placed/);
    const refused = await request("POST", `${S}/runs/${draft.id}/apply`, { body: {} });
    assert.equal(refused.status, 422);
    assert.match(refused.body.message, /leaves 2 periods unplaced/);
    await post(`${S}/runs/${draft.id}/apply`, { allowIncomplete: true }, {}, 200);
    await assertNoClashes(t.sections);
  });

  it("reports a teacher with more classes than the week has", async () => {
    const draft = (
      await post(
        `${S}/class-timetable/runs`,
        {
          mode: "REPLACE",
          seed: 2,
          teachers: [{ teacherId: t.tMath.id, unavailable: [1, 2, 3, 4, 5].map(weekday => ({ weekday })) }]
        },
        inYear()
      )
    ).data;
    const overloaded = draft.report.issues.find(i => i.code === "TEACHER_OVERLOADED");
    assert.match(overloaded.message, /would teach 18 periods here but is free for only 6/);
    assert.ok(
      draft.report.unplaced.some(u => u.subjectId === t.math.id && u.reasons[0].code === "TEACHER_UNAVAILABLE")
    );
  });

  it("validates rules", async () => {
    await post(`${S}/class-timetable/runs`, { mode: "SOMETIMES" }, inYear(), 400);
    const pin = await request("POST", `${S}/class-timetable/runs`, {
      body: { pinned: [{ sectionId: t.s7A.id, weekday: 7, periodNumber: 1, subjectId: t.math.id }] },
      ...inYear()
    });
    assert.equal(pin.status, 422);
    assert.match(pin.body.message, /Sunday is a weekly off day/);
  });
});

describe("scheduling: exam timetables", () => {
  it("plans an exam over its school days, a subject at once for a class", async () => {
    t.exam = (
      await post(
        `${A}/exams`,
        { examName: "Scheduling Term", startDate: "2029-11-05", endDate: "2029-11-14" },
        inYear()
      )
    ).data;
    for (const section of t.sections) {
      for (const sub of [t.math, t.eng, t.sci, t.art]) {
        await post(`${A}/exams/${t.exam.id}/papers`, { sectionId: section.id, subjectId: sub.id, maxMarks: 100 });
      }
    }
    const res = await post(`${S}/exam-timetable/runs`, { examId: t.exam.id, seed: 11, restDayBefore: [t.math.id] });
    const run = res.data;
    assert.equal(run.kind, "EXAM_TIMETABLE");
    assert.equal(run.report.score.complete, true);
    assert.equal(run.result.rows.length, 12);
    /* 2029-11-11 is a Sunday */
    assert.ok(
      run.result.rows.every(
        r => r.examDate !== "2029-11-11" && r.examDate >= "2029-11-05" && r.examDate <= "2029-11-14"
      )
    );
    const papers = (await get(`${A}/exams/${t.exam.id}/papers?limit=100`)).data;
    const at = id => run.result.rows.find(r => r.paperId === id);
    const math7 = papers.filter(p => p.subjectId === t.math.id && p.sectionId !== t.s8A.id).map(p => at(p.id));
    assert.equal(math7[0].examDate, math7[1].examDate);
    assert.equal(math7[0].startTime, "09:30");
    /* one paper a day per section */
    for (const section of t.sections) {
      const days = papers.filter(p => p.sectionId === section.id).map(p => at(p.id).examDate);
      assert.equal(new Set(days).size, 4);
    }
    t.examRun = run;
  });

  it("applies it through the exam's calendar event", async () => {
    const res = await post(`${S}/runs/${t.examRun.id}/apply`, {}, {}, 200);
    assert.equal(res.data.scheduled, 12);
    const papers = (await get(`${A}/exams/${t.exam.id}/papers?limit=100`)).data;
    assert.ok(papers.every(p => p.examDate && p.startTime));
    const events = (await get(`${A}/calendar/events?eventType=EXAM&limit=50`, inYear())).data;
    assert.ok(events.some(e => e.examId === t.exam.id));
  });

  it("reports a window too short and refuses to apply it", async () => {
    const run = (
      await post(`${S}/exam-timetable/runs`, { examId: t.exam.id, startDate: "2029-11-05", endDate: "2029-11-06" })
    ).data;
    assert.equal(run.report.score.complete, false);
    assert.ok(
      run.report.issues.some(
        i => i.code === "WINDOW_TOO_SHORT" && /has 4 papers but the 2 school days allow only 2/.test(i.message)
      )
    );
    const refused = await request("POST", `${S}/runs/${run.id}/apply`, { body: {} });
    assert.equal(refused.status, 422);
  });
});

describe("scheduling: agent tools", () => {
  it("lists the tools the user may call, as JSON Schema", async () => {
    const tools = (await get(TOOLS)).data;
    const generate = tools.find(tool => tool.name === "generate_class_timetable");
    assert.equal(generate.inputSchema.type, "object");
    assert.ok(generate.inputSchema.properties.mode.description.startsWith("FILL"));
    assert.equal(generate.annotations.readOnlyHint, false);
    assert.equal(tools.find(tool => tool.name === "apply_timetable_draft").annotations.destructiveHint, true);
    const anthropic = (await get(`${TOOLS}?format=anthropic`)).data;
    assert.ok(anthropic.every(tool => tool.input_schema && !tool.inputSchema));
    const teacherTools = (await get(TOOLS, { as: t.teacherToken })).data;
    assert.ok(!teacherTools.some(tool => tool.name.includes("timetable")));
  });

  it("runs a tool over REST, as the signed-in user", async () => {
    const inputs = await post(`${TOOLS}/get_timetable_inputs`, { academicYearId: t.year.id }, {}, 200);
    assert.equal(inputs.data.sections.length, 3);
    const first = (
      await post(`${TOOLS}/generate_class_timetable`, { academicYearId: t.year.id, mode: "REPLACE", seed: 42 }, {}, 200)
    ).data;
    const second = (
      await post(`${TOOLS}/generate_class_timetable`, { academicYearId: t.year.id, mode: "REPLACE", seed: 42 }, {}, 200)
    ).data;
    assert.ok(first.runId && first.next);
    const [a, b] = await Promise.all([get(`${S}/runs/${first.runId}`), get(`${S}/runs/${second.runId}`)]);
    assert.equal(a.data.origin, "AGENT_TOOL");
    assert.deepEqual(a.data.result.placements, b.data.result.placements);
    t.agentRun = first;

    const bad = await request("POST", `${TOOLS}/generate_class_timetable`, {
      body: { academicYearId: t.year.id, mode: "SOMETIMES" }
    });
    assert.equal(bad.status, 400);
    assert.match(bad.body.message, /Invalid input for generate_class_timetable: mode/);
    assert.equal((await request("POST", `${TOOLS}/no_such_tool`, { body: {} })).status, 404);
    assert.equal(
      (
        await request("POST", `${TOOLS}/generate_class_timetable`, {
          body: { academicYearId: t.year.id },
          as: t.teacherToken
        })
      ).status,
      403
    );
  });

  it("speaks MCP: initialize, tools/list, tools/call", async () => {
    const init = await mcp("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" }
    });
    assert.equal(init.status, 200);
    assert.equal(init.body.result.protocolVersion, "2025-06-18");
    assert.deepEqual(init.body.result.capabilities, { tools: { listChanged: false } });
    assert.equal(
      (await request("POST", MCP, { body: { jsonrpc: "2.0", method: "notifications/initialized" } })).status,
      202
    );

    const list = await mcp("tools/list", {}, { id: 2 });
    assert.ok(list.body.result.tools.some(tool => tool.name === "generate_exam_timetable"));

    const week = await mcp(
      "tools/call",
      { name: "get_timetable_draft", arguments: { runId: t.agentRun.runId, sectionId: t.s7A.id } },
      { id: 3 }
    );
    assert.equal(week.body.result.isError, false);
    const { week: grid } = week.body.result.structuredContent;
    assert.equal(grid.days.Monday.length, 7);
    assert.equal(grid.days.Monday[3], "break");

    const failed = await mcp(
      "tools/call",
      { name: "apply_timetable_draft", arguments: { runId: t.year.id } },
      { id: 4 }
    );
    assert.equal(failed.body.result.isError, true);
    assert.match(failed.body.result.content[0].text, /Scheduling run not found/);

    assert.equal((await mcp("tools/call", { name: "nope", arguments: {} }, { id: 5 })).body.error.code, -32602);
    assert.equal((await mcp("resources/list", {}, { id: 6 })).body.error.code, -32601);
    assert.equal((await request("POST", MCP, { body: [{ jsonrpc: "2.0", id: 7, method: "ping" }] })).status, 400);
    assert.equal((await request("GET", MCP, { headers: { accept: "text/event-stream" } })).status, 405);
    assert.equal((await get(MCP)).data.transport, "streamable-http");
  });

  it("applies through a tool", async () => {
    const applied = await post(
      `${TOOLS}/apply_timetable_draft`,
      { runId: t.agentRun.runId, allowIncomplete: true },
      {},
      200
    );
    assert.equal(applied.data.status, "APPLIED");
    assert.match(applied.message, /Timetable applied/);
    await assertNoClashes(t.sections);
  });
});
