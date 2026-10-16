import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { h, request, get, post, uuid } from "../helpers/harness.js";

describe("framework", () => {
  it("serves health, readiness and security headers", async () => {
    const health = await request("GET", "/health", { as: null });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.ok(health.headers.get("ratelimit-policy") || health.headers.get("ratelimit"));
    assert.match(health.headers.get("x-request-id"), /^[0-9a-f-]{36}$/);

    const ready = await get("/ready", { as: null });
    assert.deepEqual(ready.data, { postgres: true, mongo: true });
  });

  it("echoes a valid incoming X-Request-Id", async () => {
    const res = await request("GET", "/health", { as: null, headers: { "x-request-id": "client-req-12345" } });
    assert.equal(res.headers.get("x-request-id"), "client-req-12345");
  });

  it("rejects missing and invalid tokens with the error envelope", async () => {
    const missing = await request("GET", "/api/v1/academics/classes", { as: null });
    assert.equal(missing.status, 401);
    assert.equal(missing.body.success, false);
    assert.equal(missing.body.error.code, "UNAUTHORIZED");
    assert.ok(missing.body.error.requestId);

    const invalid = await request("GET", "/api/v1/academics/classes", { as: "nope" });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.message, "Invalid token");
  });

  it("reports malformed JSON and unknown routes clearly", async () => {
    const badJson = await request("POST", "/api/v1/academics/classes", { raw: "{bad" });
    assert.equal(badJson.status, 400);
    assert.equal(badJson.body.message, "Request body is not valid JSON");

    const unknown = await request("GET", "/api/v1/nope?x=1");
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.message, "Route GET /api/v1/nope does not exist");

    const unversioned = await request("GET", "/api/academic/classes");
    assert.equal(unversioned.status, 404);
  });

  it("validates ids and pagination before touching the database", async () => {
    const badId = await request("GET", "/api/v1/academics/classes/abc");
    assert.equal(badId.status, 400);
    assert.equal(badId.body.message, "Invalid request: classId must be a valid id");
    assert.equal(badId.body.error.details[0].location, "params");

    const badLimit = await request("GET", "/api/v1/academics/classes?limit=500");
    assert.equal(badLimit.status, 400);

    const missing = await request("GET", `/api/v1/academics/classes/${uuid()}`);
    assert.equal(missing.status, 404);
    assert.equal(missing.body.message, "Class not found");
  });

  it("publishes an OpenAPI document and docs page", async () => {
    const spec = await request("GET", "/api/v1/openapi.json", { as: null });
    assert.equal(spec.status, 200);
    assert.equal(spec.body.openapi, "3.1.0");
    const studentsPost = spec.body.paths["/api/v1/users/students"].post;
    assert.match(studentsPost.description, /users\.students\.admit/);
    assert.ok(studentsPost.requestBody.content["application/json"].schema.properties.enrollment);

    const docs = await request("GET", "/api/docs", { as: null });
    assert.equal(docs.status, 200);
    assert.match(docs.buffer.toString(), /swagger-ui/);
  });

  it("isolates tenants", async () => {
    /* Created in the other school; invisible to this one */
    const year = await post(
      "/api/v1/academics/academic-years",
      { yearName: "isolation-check", startDate: "2020-06-01", endDate: "2021-03-31" },
      { as: h.tokens.otherAdmin }
    );
    await get(`/api/v1/academics/academic-years/${year.data.id}`, {}, 404);
  });

  it("refuses to start production with the mock payment gateway", async () => {
    const { spawnSync } = await import("node:child_process");
    const run = spawnSync(process.execPath, ["-e", 'import("./src/common/config/env.config.js")'], {
      env: { ...process.env, NODE_ENV: "production", PAYMENT_PROVIDER: "mock" },
      encoding: "utf8"
    });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /PAYMENT_PROVIDER=mock is not allowed in production/);
  });
});

describe("framework: PDFs in every script", () => {
  it("splits text into script runs and has a real glyph for every letter", async () => {
    const { scriptRuns, SCRIPT_FONTS, fontFile } = await import("../../src/common/export/fonts.js");
    assert.deepEqual(scriptRuns("Asha अनन्या (Rao) தமிழ் 10"), [
      { text: "Asha ", script: null },
      { text: "अनन्या (", script: "Devanagari" },
      { text: "Rao) ", script: null },
      { text: "தமிழ் 10", script: "Tamil" }
    ]);
    const fontkit = await import("fontkit");
    const samples = {
      Devanagari: "अनन्या शर्मा",
      Bengali: "সুমন দাস",
      Tamil: "தமிழ்செல்வி",
      Telugu: "శ్రీనివాస్",
      Kannada: "ಕಾವ್ಯ",
      Malayalam: "അനന്യ",
      Gujarati: "હેતલ",
      Gurmukhi: "ਗੁਰਪ੍ਰੀਤ",
      Oriya: "ସୁମନ",
      Arabic: "عائشہ خان"
    };
    for (const [script, family] of Object.entries(SCRIPT_FONTS)) {
      for (const bold of [false, true]) {
        const run = fontkit.openSync(fontFile(family, bold)).layout(samples[script]);
        assert.equal(run.glyphs.filter(glyph => glyph.id === 0).length, 0, `${family} bold=${bold} has every glyph`);
      }
    }
    assert.ok(fontkit.openSync(fontFile("NotoSans", false)).hasGlyphForCodePoint(0x20b9), "₹ prints");
  });

  it("embeds the right fonts in generated PDFs", async () => {
    const { renderPdf } = await import("../../src/common/export/exporters.js");
    const pdf = await renderPdf(doc => {
      doc.font("Helvetica-Bold").fontSize(14).text("Report card: अनन्या शर्मा");
      doc.font("Helvetica").text("தமிழ்செல்வி · عائشہ خان · ₹1,000.00", 40, 120, { width: 300 });
    });
    const text = pdf.toString("latin1");
    assert.ok(text.startsWith("%PDF"));
    for (const name of ["NotoSans-Bold", "NotoSansDevanagari-Bold", "NotoSansTamil", "NotoSansArabic", "NotoSans"]) {
      assert.match(text, new RegExp(`/BaseFont /[A-Z]{6}\\+${name}\\b`), `${name} embedded`);
    }
    assert.doesNotMatch(text, /\/BaseFont \/Helvetica/, "no built-in font is used");
  });
});
