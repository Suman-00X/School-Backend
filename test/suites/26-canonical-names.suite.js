import assert from "node:assert/strict";
import { describe, it } from "node:test";
/* Pure helpers only: loading routes here would read config before the harness sets it */
import { classCodeLabel, levelFromName } from "../../src/modules/academics/classes/utils/classLevel.util.js";
import { yearNameFor } from "../../src/modules/academics/academic-years/utils/yearName.util.js";
import { h, world, request, get, post, patch, del } from "../helpers/harness.js";

const A = "/api/v1/academics";
const F = "/api/v1/finance";

/* Academic years, classes, sections and other masters follow one format each, so the
   same thing cannot be entered twice under two spellings */
describe("canonical names", () => {
  it("derives an academic year's name from its dates", async () => {
    assert.equal(yearNameFor("2026-06-01", "2027-03-31"), "2026-27");
    assert.equal(yearNameFor("2026-01-05", "2026-12-20"), "2026");
    assert.equal(yearNameFor("2099-06-01", "2100-03-31"), "2099-00");

    /* The other school: its 2020-21 year (01-framework) is the only one there */
    const as = h.tokens.otherAdmin;
    const single = await post(`${A}/academic-years`, { startDate: "2021-04-01", endDate: "2021-12-31" }, { as });
    assert.equal(single.data.yearName, "2021");

    const typed = await request("POST", `${A}/academic-years`, {
      as,
      body: { yearName: "2023-2024", startDate: "2023-06-01", endDate: "2024-03-31" }
    });
    assert.equal(typed.status, 422);
    assert.equal(
      typed.body.message,
      "yearName must be 2023-24 for 2023-06-01 to 2024-03-31: it is derived from the dates. Leave it out."
    );

    /* New dates re-derive the name; a typed name must agree */
    const longer = await patch(`${A}/academic-years/${single.data.id}`, { endDate: "2022-02-28" }, { as });
    assert.equal(longer.data.yearName, "2021-22");
    const renamed = await request("PATCH", `${A}/academic-years/${single.data.id}`, {
      as,
      body: { yearName: "2021-2022" }
    });
    assert.equal(renamed.status, 422);
    assert.match(renamed.body.message, /^yearName must be 2021-22 for 2021-04-01 to 2022-02-28/);
    world.otherYear2122 = longer.data;
  });

  it("limits a year to 13 months and two calendar years", async () => {
    const as = h.tokens.otherAdmin;
    const tooLong = await request("POST", `${A}/academic-years`, {
      as,
      body: { startDate: "2031-06-01", endDate: "2032-07-15" }
    });
    assert.equal(tooLong.status, 422);
    assert.equal(
      tooLong.body.message,
      "An academic year lasts at most 13 months: starting 2031-06-01, it must end by 2032-06-30"
    );
    /* 13 months to the day is fine */
    const longest = await post(`${A}/academic-years`, { startDate: "2031-06-01", endDate: "2032-06-30" }, { as });
    assert.equal(longest.data.yearName, "2031-32");

    const threeYears = await request("POST", `${A}/academic-years`, {
      as,
      body: { startDate: "2033-12-15", endDate: "2035-01-10" }
    });
    assert.equal(threeYears.status, 422);
    assert.equal(
      threeYears.body.message,
      "An academic year spans at most two calendar years: 2033-12-15 to 2035-01-10 spans more"
    );

    const backwards = await request("PATCH", `${A}/academic-years/${longest.data.id}`, {
      as,
      body: { endDate: "2031-05-01" }
    });
    assert.equal(backwards.status, 422);
    assert.equal(backwards.body.message, "endDate must be after startDate");
  });

  it("refuses years that overlap, archived ones included, and two years of one name", async () => {
    const as = h.tokens.otherAdmin;
    const overlap = await request("POST", `${A}/academic-years`, {
      as,
      body: { startDate: "2021-03-15", endDate: "2021-03-31" }
    });
    assert.equal(overlap.status, 409);
    assert.equal(
      overlap.body.message,
      "2021-03-15 to 2021-03-31 overlaps academic year 2020-21 (2020-06-01 to 2021-03-31). Academic years cannot overlap."
    );

    /* A year's own dates never clash with itself; another's do */
    const moved = await request("PATCH", `${A}/academic-years/${world.otherYear2122.id}`, {
      as,
      body: { startDate: "2021-03-01" }
    });
    assert.equal(moved.status, 409);
    assert.match(moved.body.message, /overlaps academic year 2020-21/);
    await patch(`${A}/academic-years/${world.otherYear2122.id}`, { endDate: "2022-03-31" }, { as });

    /* Two years within one calendar year can share a name only if they share no day: then the name clashes */
    await post(`${A}/academic-years`, { startDate: "2023-01-01", endDate: "2023-05-31" }, { as });
    const sameName = await request("POST", `${A}/academic-years`, {
      as,
      body: { startDate: "2023-07-01", endDate: "2023-12-31" }
    });
    assert.equal(sameName.status, 409);
    assert.equal(sameName.body.message, "An academic year named 2023 already exists");

    /* An archived year still holds its dates, and its own dates cannot be edited */
    const [old] = (await get(`${A}/academic-years?limit=100`, { as })).data.filter(y => y.yearName === "2020-21");
    await post(`${A}/academic-years/${old.id}/archival`, {}, { as }, 200);
    const intoArchived = await request("POST", `${A}/academic-years`, {
      as,
      body: { startDate: "2021-01-01", endDate: "2021-03-31" }
    });
    assert.equal(intoArchived.status, 409);
    assert.match(intoArchived.body.message, /overlaps academic year 2020-21/);
    const editArchived = await request("PATCH", `${A}/academic-years/${old.id}`, {
      as,
      body: { endDate: "2021-03-30" }
    });
    assert.equal(editArchived.status, 409);
    assert.equal(editArchived.body.message, "Academic year 2020-21 is archived and read-only. Restore it first.");
    await del(`${A}/academic-years/${old.id}/archival`, { as });
  });

  it("makes a class one of the fixed levels, whatever the spelling", async () => {
    assert.equal(levelFromName(" class-1 "), "GRADE_1");
    assert.equal(levelFromName("Std. 10"), "GRADE_10");
    assert.equal(levelFromName("viii"), "GRADE_8");
    assert.equal(levelFromName("L.K.G."), "LKG");
    assert.equal(levelFromName("Grade 13"), null);
    assert.equal(levelFromName("Pre-KG"), null);
    assert.equal(classCodeLabel({ level: "GRADE_1", classOrder: 4 }), "1");
    assert.equal(classCodeLabel({ level: "NURSERY", classOrder: 1 }), "NUR");
    assert.equal(classCodeLabel({ level: null, classOrder: 20 }), "20");

    /* 03-academics created Class 1 and Class 2 the old way ({ className, classOrder }) */
    assert.equal(world.c1.level, "GRADE_1");
    assert.equal(world.c1.classOrder, 4);

    const levels = await get(`${A}/classes/levels`);
    assert.equal(levels.data.length, 15);
    assert.deepEqual(levels.data.slice(0, 4), [
      { level: "NURSERY", className: "Nursery", classOrder: 1, created: false, classId: null },
      { level: "LKG", className: "LKG", classOrder: 2, created: false, classId: null },
      { level: "UKG", className: "UKG", classOrder: 3, created: false, classId: null },
      { level: "GRADE_1", className: "Class 1", classOrder: 4, created: true, classId: world.c1.id }
    ]);
    assert.equal(levels.data.at(-1).className, "Class 12");

    for (const className of ["class  1", "Grade 1", "I", "1"]) {
      const again = await request("POST", `${A}/classes`, { body: { className } });
      assert.equal(again.status, 409, className);
      assert.equal(again.body.message, "A class named Class 1 already exists");
    }
    const again = await request("POST", `${A}/classes`, { body: { level: "GRADE_1" } });
    assert.equal(again.body.message, "A class named Class 1 already exists");

    const unknown = await request("POST", `${A}/classes`, { body: { className: "Pre-KG" } });
    assert.equal(unknown.status, 400);
    assert.equal(
      unknown.body.message,
      "Invalid request: className must be one of Nursery, LKG, UKG, Class 1 … Class 12"
    );
    const nothing = await request("POST", `${A}/classes`, { body: { description: "x" } });
    assert.equal(nothing.body.message, "Invalid request: level is required");

    const twice = await request("POST", `${A}/classes/bulk`, {
      body: { classes: [{ level: "LKG" }, { className: "l.k.g." }] }
    });
    assert.equal(twice.status, 400);
    assert.deepEqual(twice.body.error.details, [
      { location: "body", field: "classes.1.level", message: "repeats classes.0 in this request" }
    ]);

    const nursery = (await post(`${A}/classes`, { level: "NURSERY", classOrder: 99 })).data;
    assert.deepEqual(
      { level: nursery.level, className: nursery.className, classOrder: nursery.classOrder },
      { level: "NURSERY", className: "Nursery", classOrder: 1 }
    );
    /* Ordered by level */
    assert.equal((await get(`${A}/classes?limit=1`)).data[0].id, nursery.id);

    /* A class without sections may change level; one with sections may not */
    const relabelled = await patch(`${A}/classes/${nursery.id}`, { className: "LKG" });
    assert.deepEqual([relabelled.data.className, relabelled.data.classOrder], ["LKG", 2]);
    await patch(`${A}/classes/${nursery.id}`, { level: "NURSERY" });
    const used = await request("PATCH", `${A}/classes/${world.c1.id}`, { body: { level: "GRADE_3" } });
    assert.equal(used.status, 409);
    assert.match(
      used.body.message,
      /^Class 1 has \d+ sections?, so it cannot become Class 3\. Create Class 3 as a new class instead\.$/
    );
    const same = await patch(`${A}/classes/${world.c1.id}`, { className: "class 1", description: "First grade" });
    assert.equal(same.data.className, "Class 1");

    /* Teachers see which levels exist, but only their own classes' ids */
    const teacherView = await get(`${A}/classes/levels`, { as: h.tokens.teacher });
    assert.equal(teacherView.data.find(l => l.level === "NURSERY").created, true);
    assert.equal(teacherView.data.find(l => l.level === "NURSERY").classId, null);
  });

  it("refuses the same section twice, in one bulk request or against an existing one", async () => {
    const twice = await request("POST", `${A}/sections/bulk`, {
      body: {
        sections: [
          { classId: world.c2.id, sectionName: "Q" },
          { classId: world.c2.id, sectionName: " q " }
        ]
      }
    });
    assert.equal(twice.status, 400);
    assert.deepEqual(twice.body.error.details, [
      { location: "body", field: "sections.1.sectionName", message: "repeats sections.0 in this request" }
    ]);
    /* The same letter in two classes is fine (validation only: nothing is created) */
    const existing = await request("POST", `${A}/sections`, { body: { classId: world.c1.id, sectionName: " a" } });
    assert.equal(existing.status, 409);
    assert.equal(existing.body.message, "Section A already exists in this class for this academic year");
  });

  it("upper-cases subject codes, tidies names and compares them ignoring case", async () => {
    const badCode = await request("POST", `${A}/subjects`, { body: { subjectName: "Art", subjectCode: "1ART" } });
    assert.equal(badCode.status, 400);
    assert.equal(
      badCode.body.message,
      "Invalid request: subjectCode must be 2-10 letters, digits or -, starting with a letter"
    );

    const moral = (await post(`${A}/subjects`, { subjectName: "  Moral   Science ", subjectCode: "ms-01" })).data;
    assert.deepEqual([moral.subjectName, moral.subjectCode], ["Moral Science", "MS-01"]);

    const sameName = await request("POST", `${A}/subjects`, {
      body: { subjectName: "MORAL science", subjectCode: "MS02" }
    });
    assert.equal(sameName.status, 409);
    assert.equal(sameName.body.message, "A subject named MORAL science already exists");
    const sameCode = await request("POST", `${A}/subjects`, { body: { subjectName: "Ethics", subjectCode: "Ms-01" } });
    assert.equal(sameCode.body.message, "A subject with code MS-01 already exists");

    const bulk = await request("POST", `${A}/subjects/bulk`, {
      body: {
        subjects: [
          { subjectName: "Drama", subjectCode: "DR01" },
          { subjectName: "drama", subjectCode: "DR02" }
        ]
      }
    });
    assert.equal(bulk.status, 400);
    assert.equal(bulk.body.error.details[0].field, "subjects.1.subjectName");
  });

  it("keeps other masters unique ignoring case and spacing (fee heads, hostels)", async () => {
    /* 07-finance created "Tuition" */
    const tuition = await request("POST", `${F}/fee-heads`, { body: { name: "  TUITION ", code: "TUI-X" } });
    assert.equal(tuition.status, 409);
    assert.equal(tuition.body.message, "A fee head named TUITION already exists");

    const sports = (await post(`${F}/fee-heads`, { name: "Sports   Fee", code: "sports" })).data;
    assert.deepEqual([sports.name, sports.code], ["Sports Fee", "SPORTS"]);
    const renamed = await request("PATCH", `${F}/fee-heads/${world.transport.id}`, { body: { name: "sports fee" } });
    assert.equal(renamed.status, 409);
    assert.equal(renamed.body.message, "A fee head named sports fee already exists");
    await del(`${F}/fee-heads/${sports.id}`);

    /* 12-hostel created "Boys Hostel" (its service checks first, now ignoring case) */
    const hostel = await request("POST", "/api/v1/hostel/hostels", {
      as: h.tokens.admin,
      body: { name: "boys  hostel", residentGender: "BOYS" }
    });
    assert.equal(hostel.status, 409);
    assert.equal(hostel.body.message, "A hostel named boys hostel already exists");
  });
});
