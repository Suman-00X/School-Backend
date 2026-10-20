import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, world, request, get, post, person } from "../helpers/harness.js";

/* Certificates (academics/certificates): the school's HTML formats, versioned, and
   bonafide, character and transfer certificates issued from them. A leaver admitted
   here takes the transfer certificate, so the other suites' students stay enrolled.
   PDFs need Chrome/Chromium on the machine; without one they answer 503. */

const A = "/api/v1/academics";
const C = `${A}/certificates`;
const F = `${A}/certificate-formats`;

const t = {};

/* A PDF, or null when this machine has no browser to print with */
const pdfOf = async (url, as) => {
  const res = await request("GET", url, { as });
  if (res.status === 503) {
    assert.match(res.body.message, /PDF printing/);
    return null;
  }
  assert.equal(res.status, 200, res.body?.message);
  assert.equal(res.headers.get("content-type"), "application/pdf");
  assert.equal(res.buffer.subarray(0, 5).toString(), "%PDF-");
  return res;
};

describe("certificate formats", () => {
  it("lists the three types with their inputs and placeholders", async () => {
    const { types } = (await get(`${C}/types`)).data;
    assert.deepEqual(
      types.map(type => type.type),
      ["BONAFIDE", "CHARACTER", "TRANSFER"]
    );
    const tc = types.find(type => type.type === "TRANSFER");
    assert.ok(tc.inputs.some(input => input.key === "leavingDate" && input.required));
    const certificate = tc.placeholders.find(group => group.group === "Certificate").fields.map(f => f.key);
    assert.ok(certificate.includes("certificate.leavingDateLong"));
    /* Teachers don't issue certificates */
    assert.equal((await request("GET", `${C}/types`, { as: h.tokens.teacher })).status, 403);
  });

  it("starts every school on version 1 of the standard formats", async () => {
    const formats = (await get(F)).data;
    assert.deepEqual(
      formats.map(f => [f.type, f.version]),
      [
        ["BONAFIDE", 1],
        ["CHARACTER", 1],
        ["TRANSFER", 1],
        ["REPORT_CARD", 1]
      ]
    );
    const bonafide = (await get(`${F}/bonafide`)).data;
    assert.match(bonafide.html, /\{\{student\.name\}\}/);
    assert.match(bonafide.css, /@page/);
    t.bonafide = bonafide;
  });

  it("refuses formats that don't parse or use unknown placeholders", async () => {
    const broken = await request("POST", `${F}/BONAFIDE/versions`, {
      body: { name: "Bonafide", html: "{{#if student.pen}}PEN", css: "" }
    });
    assert.equal(broken.status, 422);
    assert.match(broken.body.message, /never closed/);
    const unknown = await request("POST", `${F}/BONAFIDE/versions`, {
      body: { name: "Bonafide", html: "{{student.nmae}} {{certificate.leavingDate}}" }
    });
    assert.equal(unknown.status, 422);
    assert.match(unknown.body.message, /\{\{student\.nmae\}\}, \{\{certificate\.leavingDate\}\}/);
    /* Office staff read formats but don't change them */
    const byOffice = await request("POST", `${F}/BONAFIDE/versions`, {
      as: h.tokens.office,
      body: { name: "Bonafide", html: "<p>{{student.name}}</p>" }
    });
    assert.equal(byOffice.status, 403);
  });

  it("saves each change as a new version, and refuses a stale editor", async () => {
    const html = t.bonafide.html.replace("Bonafide Certificate", "Bonafide Certificate (v2)");
    const saved = await post(`${F}/bonafide/versions`, {
      name: "Bonafide",
      html,
      css: t.bonafide.css,
      note: "Title",
      baseVersion: 1
    });
    assert.equal(saved.data.version, 2);
    assert.match(saved.message, /Version 2 of the format saved/);

    const stale = await request("POST", `${F}/bonafide/versions`, {
      body: { name: "Bonafide", html, css: t.bonafide.css, baseVersion: 1 }
    });
    assert.equal(stale.status, 409);
    assert.match(stale.body.message, /Version 2 was saved after you opened version 1/);

    const versions = (await get(`${F}/bonafide/versions`)).data;
    assert.deepEqual(
      versions.map(v => v.version),
      [2, 1]
    );
    assert.equal(versions[0].note, "Title");
    assert.equal(versions[0].html, undefined, "the list leaves the HTML out");
    assert.match((await get(`${F}/bonafide/versions/1`)).data.html, /Bonafide Certificate</);
    assert.equal((await request("GET", `${F}/bonafide/versions/9`)).status, 404);
  });

  it("previews an unsaved format with sample or a student's details, escaped", async () => {
    const sample = (
      await post(
        `${F}/bonafide/preview`,
        { html: "<p>{{student.name}}|{{certificate.serialNumber}}</p>", css: "p{}" },
        {},
        200
      )
    ).data.html;
    assert.match(sample, /<p>Aarav Sharma\|BC\/2026-27\/0001<\/p>/);
    assert.match(sample, /<style>p\{\}<\/style>/);

    const real = (
      await post(
        `${F}/transfer/preview`,
        {
          html: "<p>{{student.name}} {{class.classSection}} {{parents.mother}} {{certificate.leavingDate}}</p>",
          studentId: world.s1.id
        },
        {},
        200
      )
    ).data.html;
    assert.match(real, /Fstudent1 Lstudent1 Class 1 – A Fmother Lmother \d\d\/\d\d\/\d{4}/);
  });

  it("restores an old version as the next one", async () => {
    const restored = await post(`${F}/bonafide/versions/1/restore`, {});
    assert.equal(restored.data.version, 3);
    assert.equal(restored.data.note, "Restored from version 1");
    assert.equal((await get(`${F}/bonafide`)).data.version, 3);
  });
});

describe("issuing certificates", () => {
  it("prefills a draft and previews it", async () => {
    const draft = (await get(`${C}/draft?type=TRANSFER&studentId=${world.s1.id}`)).data;
    assert.match(draft.inputs.leavingDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(draft.inputs.nationality, "Indian");
    assert.equal(draft.inputs.promotion, "Yes");
    assert.equal(draft.enrollmentStatus, "ACTIVE");
    assert.equal(draft.blocked, null);

    const missing = await request("POST", `${C}/preview`, {
      body: { type: "BONAFIDE", studentId: world.s1.id, inputs: {} }
    });
    assert.equal(missing.status, 422);
    assert.match(missing.body.message, /Purpose is required/);

    const preview = (
      await post(
        `${C}/preview`,
        { type: "BONAFIDE", studentId: world.s1.id, inputs: { purpose: "a <bank> account" } },
        {},
        200
      )
    ).data.html;
    assert.match(preview, /Fstudent1 Lstudent1/);
    assert.match(preview, /a &lt;bank&gt; account/);
  });

  it("issues a bonafide certificate with a serial number, newest first in the list", async () => {
    const first = await post(
      C,
      { type: "BONAFIDE", studentId: world.s1.id, inputs: { purpose: "Passport" } },
      { as: h.tokens.office }
    );
    assert.match(first.data.serialNumber, /^BC\/\d{4}-\d{2}\/0001$/);
    assert.equal(first.data.formatVersion.version, 3);
    assert.equal(first.data.student.name, "Fstudent1 Lstudent1");
    assert.match(first.message, /^Bonafide certificate BC\/.+ issued to Fstudent1 Lstudent1$/);
    t.bonafide1 = first.data;

    const character = await post(C, { type: "character", studentId: world.s2.id, inputs: { conduct: "Very good" } });
    assert.match(character.data.serialNumber, /^CC\/.+\/0001$/);
    await post(C, { type: "CHARACTER", studentId: world.s2.id, inputs: { conduct: "Brilliant" } }, {}, 422);

    const second = await post(C, { type: "BONAFIDE", studentId: world.s2.id, inputs: { purpose: "Scholarship" } });
    assert.match(second.data.serialNumber, /\/0002$/);

    const list = await get(C);
    assert.deepEqual(
      list.data.slice(0, 3).map(c => c.serialNumber),
      [second.data.serialNumber, character.data.serialNumber, first.data.serialNumber]
    );
    assert.equal((await get(`${C}?type=CHARACTER`)).meta.total, 1);
    assert.equal((await get(`${C}?search=lstudent1`)).data[0].id, first.data.id);
    assert.equal((await get(`${C}?search=${encodeURIComponent(second.data.serialNumber)}`)).meta.total, 1);
    assert.equal((await request("GET", C, { as: h.tokens.teacher })).status, 403);
  });

  it("reprints with the version it was issued with", async () => {
    /* A later format change doesn't touch the issued certificate */
    const current = (await get(`${F}/bonafide`)).data;
    await post(`${F}/bonafide/versions`, { name: "Bonafide", html: `${current.html}<p>v4</p>`, css: current.css });
    const html = (await get(`${C}/${t.bonafide1.id}/document`)).data.html;
    assert.match(html, /Passport/);
    assert.doesNotMatch(html, /v4/);
    await pdfOf(`${C}/${t.bonafide1.id}/pdf`);
  });

  it("issues a transfer certificate to a leaver and marks them left; one per student", async () => {
    world.leaver = (
      await post("/api/v1/users/students", {
        user: { ...person("tcleaver"), gender: "FEMALE", dob: "2015-08-14" },
        parents: [{ user: person("tcleaverdad"), relation: "FATHER" }],
        enrollment: { academicYearId: world.y1.id, sectionId: world.s2A.id }
      })
    ).data;
    const inputs = { leavingDate: "2026-12-15", reason: "Parent's transfer", workingDays: 120, daysPresent: "110.5" };
    await post(
      C,
      { type: "TRANSFER", studentId: world.leaver.id, inputs: { ...inputs, leavingDate: "15/12/2026" } },
      {},
      422
    );

    const tc = await post(C, { type: "TRANSFER", studentId: world.leaver.id, inputs, markLeft: true });
    assert.match(tc.data.serialNumber, /^TC\/.+\/0001$/);
    assert.equal(tc.data.markedLeft, true);
    assert.match(tc.message, /the student is marked as left$/);
    assert.equal(tc.data.inputs.workingDays, "120");
    t.tc = tc.data;

    const html = (await get(`${C}/${tc.data.id}/document`)).data.html;
    assert.match(html, /Ftcleaverdad Ltcleaverdad/);
    assert.match(html, /Fourteenth August Two Thousand Fifteen/);
    assert.match(html, /15\/12\/2026/);
    assert.match(html, /120 \/ 110\.5/);

    const enrollment = (await get(`${A}/enrollments?sectionId=${world.s2A.id}&limit=100`)).data.find(
      e => e.studentId === world.leaver.id
    );
    assert.equal(enrollment.status, "LEFT");

    const draft = (await get(`${C}/draft?type=TRANSFER&studentId=${world.leaver.id}`)).data;
    assert.match(draft.blocked, /already in force/);
    assert.equal(draft.earlier.length, 1);
    const again = await request("POST", C, { body: { type: "TRANSFER", studentId: world.leaver.id, inputs } });
    assert.equal(again.status, 409);
  });

  it("cancels (management only); a cancelled TC frees the student for a new one", async () => {
    const byOffice = await request("POST", `${C}/${t.tc.id}/cancel`, { as: h.tokens.office, body: { reason: "Typo" } });
    assert.equal(byOffice.status, 403);
    const cancelled = await post(
      `${C}/${t.tc.id}/cancel`,
      { reason: "Wrong leaving date" },
      { as: h.tokens.principal },
      200
    );
    assert.equal(cancelled.data.status, "CANCELLED");
    assert.equal(cancelled.data.cancelReason, "Wrong leaving date");
    await post(`${C}/${t.tc.id}/cancel`, { reason: "Again" }, {}, 409);
    assert.match((await get(`${C}/${t.tc.id}/document`)).data.html, /certificate-cancelled/);

    const reissued = await post(C, {
      type: "TRANSFER",
      studentId: world.leaver.id,
      inputs: { leavingDate: "2026-12-20", reason: "Parent's transfer" },
      markLeft: true
    });
    assert.match(reissued.data.serialNumber, /\/0002$/);
    /* Already left: nothing more to mark */
    assert.equal(reissued.data.markedLeft, false);
    await pdfOf(`${C}/${reissued.data.id}/pdf`);
  });
});

describe("certificates in the portal", () => {
  const ME = "/api/v1/me/students";
  const mine = (studentId, as) => request("GET", `${ME}/${studentId}/certificates`, { as });

  it("shows the student and their parent the student's certificates in force", async () => {
    /* A second one for the student, cancelled: families don't see it */
    const wrong = await post(C, { type: "BONAFIDE", studentId: world.s1.id, inputs: { purpose: "Wrong" } });
    await post(`${C}/${wrong.data.id}/cancel`, { reason: "Wrong purpose" }, { as: h.tokens.principal }, 200);

    for (const as of [h.tokens.student1, h.tokens.mother]) {
      const res = await mine(world.s1.id, as);
      assert.equal(res.status, 200, res.body?.message);
      assert.deepEqual(
        res.body.data.map(c => c.id),
        [t.bonafide1.id]
      );
      const [own] = res.body.data;
      assert.equal(own.serialNumber, t.bonafide1.serialNumber);
      assert.equal(own.label, "Bonafide certificate");
      assert.equal(own.issuedBy, undefined, "families don't see who issued it");
      assert.equal(own.inputs, undefined);
    }
    assert.equal(
      (await get(`${ME}/${world.s1.id}/certificates?type=character`, { as: h.tokens.mother })).meta.total,
      0
    );

    const html = (await get(`${ME}/${world.s1.id}/certificates/${t.bonafide1.id}/document`, { as: h.tokens.mother }))
      .data.html;
    assert.match(html, /Passport/);
    await pdfOf(`${ME}/${world.s1.id}/certificates/${t.bonafide1.id}/pdf`, h.tokens.student1);

    const cancelled = await request("GET", `${ME}/${world.s1.id}/certificates/${wrong.data.id}/document`, {
      as: h.tokens.mother
    });
    assert.equal(cancelled.status, 404);
  });

  it("keeps other students' certificates out of reach", async () => {
    /* Another child's student path, and another child's certificate through this child's path */
    assert.equal((await mine(world.s3.id, h.tokens.mother)).status, 404);
    assert.equal((await mine(world.s2.id, h.tokens.student1)).status, 404);
    /* A parent of two sees each child's own */
    const s2 = (await get(`${C}?studentId=${world.s2.id}`)).data[0];
    const second = await get(`${ME}/${world.s2.id}/certificates`, { as: h.tokens.mother });
    assert.ok(second.data.length >= 1 && second.data.every(c => c.student.id === world.s2.id));
    const crossed = await request("GET", `${ME}/${world.s1.id}/certificates/${s2.id}/pdf`, { as: h.tokens.mother });
    assert.equal(crossed.status, 404);
    /* Staff use the office's list, not the portal's */
    assert.equal((await mine(world.s1.id, h.tokens.office)).status, 403);
    assert.equal((await mine(world.s1.id, h.tokens.teacher)).status, 403);
  });
});

describe("report card format", () => {
  const R = `${F}/report-card`;

  it("keeps the report card's HTML format with the certificates', with list fields", async () => {
    const format = (await get(R)).data;
    assert.equal(format.type, "REPORT_CARD");
    assert.match(format.html, /\{\{#each report\.subjects\}\}/);
    assert.match(format.css, /\.letterhead/);
    const subjects = format.placeholders.find(group => group.group === "Subjects").fields;
    const name = subjects.find(field => field.key === "report.subjects[].name");
    assert.equal(name.insert, "{{name}}");
    assert.equal(name.sample, "English");
    assert.ok(subjects.some(field => field.key === "report.subjects[].components[].marks"));
    t.reportCard = format;
  });

  it("checks fields inside loops, and refuses certificate fields", async () => {
    const save = html => request("POST", `${R}/versions`, { body: { name: "Report card", html } });
    const typo = await save("{{#each report.subjects}}{{nmae}}{{/each}}");
    assert.equal(typo.status, 422);
    assert.match(typo.body.message, /\{\{nmae\}\}/);
    const mismatched = await save("{{#each report.subjects}}{{name}}{{/if}}");
    assert.equal(mismatched.status, 422);
    assert.match(mismatched.body.message, /closed with \{\{\/if\}\}/);
    const certificate = await save("{{certificate.serialNumber}}");
    assert.equal(certificate.status, 422);
    /* Outside a loop a list's field means nothing; a top-level field works inside one */
    assert.equal((await save("{{name}}")).status, 422);
    const ok = await request("POST", `${R}/preview`, {
      body: { html: "{{#each report.subjects}}<i>{{name}} {{school.name}}</i>{{else}}none{{/each}}" }
    });
    assert.equal(ok.status, 200, ok.body?.message);
    assert.match(ok.body.data.html, /<i>English [^<]+<\/i>/);
  });

  it("previews with the sample card or a student's latest results", async () => {
    const sample = (await post(`${R}/preview`, { html: t.reportCard.html, css: t.reportCard.css }, {}, 200)).data.html;
    assert.match(sample, /Aarav Sharma/);
    assert.match(sample, /Theory/);
    const real = await request("POST", `${R}/preview`, {
      body: { html: t.reportCard.html, css: t.reportCard.css, studentId: world.s1.id }
    });
    if (real.status === 422) assert.match(real.body.message, /no exam results/);
    else assert.equal(real.status, 200, real.body?.message);
  });

  it("prints report cards (live and published) from the format", async () => {
    await post(`${R}/versions`, {
      name: "Report card",
      html: t.reportCard.html.replace("{{report.title}}", "{{report.title}} (v2)"),
      css: t.reportCard.css
    });
    await pdfOf(`${A}/report-cards/students/${world.s1.id}/pdf?examId=${world.exam.id}`);
    await pdfOf(`/api/v1/me/students/${world.s1.id}/report-cards/pdf?examId=${world.exam.id}`, h.tokens.student1);
    /* Back to the standard format for the suites after this one */
    const restored = (await post(`${R}/versions/1/restore`, {})).data;
    assert.equal(restored.html, t.reportCard.html);
  });
});
