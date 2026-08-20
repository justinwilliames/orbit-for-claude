/**
 * Feedback loop — the promise IS the test.
 *
 * The privacy contract says: friction detail and idea text are redacted
 * ON THIS MACHINE before anything leaves the process; friction respects
 * the telemetry opt-out; ideas fire regardless (explicit ask = its own
 * consent) but never share the telemetry send path; a tool must fail
 * three times consecutively before ONE friction event fires, and a
 * success resets the streak.
 *
 * Every one of those clauses is asserted here against a local HTTP sink
 * standing in for yourorbit.team — what these tests see leave the
 * process is exactly what production would receive.
 */

import { test, describe, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

// Sink FIRST, then env, then dynamic imports — module-scope constants in
// telemetry.js and idea-submit.js read the env at import time.
let received = [];
const sink = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    received.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
    res.setHeader("Content-Type", "application/json");
    if (req.method === "DELETE") return res.end(JSON.stringify({ ok: true }));
    if (req.url.startsWith("/idea")) return res.end(JSON.stringify({ ok: true, ref: "idea_0123456789abcdef" }));
    res.end(JSON.stringify({ ok: true }));
  });
});

let telemetry, ideas, redact;

before(async () => {
  await new Promise((r) => sink.listen(0, r));
  const port = sink.address().port;
  process.env.ORBIT_TELEMETRY_ENDPOINT = `http://127.0.0.1:${port}/telemetry`;
  process.env.ORBIT_IDEA_ENDPOINT = `http://127.0.0.1:${port}/idea`;
  delete process.env.ORBIT_TELEMETRY;
  telemetry = await import("../../server/telemetry.js");
  ideas = await import("../../server/idea-submit.js");
  redact = await import("../../server/redact.js");
});

after(() => sink.close());
beforeEach(() => { received = []; });

const flush = () => new Promise((r) => setTimeout(r, 150));

describe("redactor", () => {
  test("strips every claimed category and nothing else", () => {
    const out = redact.redactSensitive(
      "email j@x.co, https://a.b/c?k=1, /Users/justin/w, card 4111 1111 1111 1111, key sk-abcdefgh1234567890, hash deadbeefdeadbeefdeadbeefdeadbeef — braze sync still times out",
    );
    assert.ok(!/j@x\.co|a\.b|justin|4111|sk-abcdefgh|deadbeef/.test(out), out);
    for (const ph of ["[email]", "[url]", "[path]", "[number]", "[key]", "[token]"]) assert.ok(out.includes(ph), `${ph} missing: ${out}`);
    assert.ok(out.includes("braze sync still times out"), "plain text must survive");
  });
  test("caps at 300 and never throws on junk", () => {
    assert.ok(redact.redactSensitive("y".repeat(2000)).length <= 300);
    assert.equal(typeof redact.redactSensitive(null), "string");
    assert.equal(typeof redact.redactSensitive({ a: 1 }), "string");
  });
});

describe("friction telemetry", () => {
  test("trackFriction redacts detail unconditionally and posts type=friction", async () => {
    await telemetry.trackFriction({ slug: "route_task_no_match", detail: "help justin@sophiie.ai with https://client.com/x", version: "0.0.0" });
    await flush();
    const evt = received.find((r) => r.body?.type === "friction");
    assert.ok(evt, "friction event must reach the sink");
    assert.ok(!evt.body.detail.includes("sophiie.ai") && !evt.body.detail.includes("client.com"), evt.body.detail);
    assert.ok(evt.body.detail.includes("[email]") && evt.body.detail.includes("[url]"));
    assert.equal(evt.url, "/telemetry");
  });

  test("three consecutive same-tool errors fire exactly ONE friction event; success resets", async () => {
    for (let i = 0; i < 5; i++) await telemetry.trackToolError({ slug: "orbit_sync_to_braze", errorClass: "timeout", version: "0.0.0" });
    await flush();
    const frictions = received.filter((r) => r.body?.type === "friction" && r.body.slug === "orbit_sync_to_braze");
    assert.equal(frictions.length, 1, "streak fires once at 3, then stays silent");
    received = [];
    await telemetry.trackToolCall({ slug: "orbit_sync_to_braze", version: "0.0.0" }); // reset
    for (let i = 0; i < 3; i++) await telemetry.trackToolError({ slug: "orbit_sync_to_braze", errorClass: "timeout", version: "0.0.0" });
    await flush();
    assert.equal(received.filter((r) => r.body?.type === "friction" && r.body.slug === "orbit_sync_to_braze").length, 1, "reset streak can fire again");
  });

  test("ORBIT_TELEMETRY=0 silences friction entirely", async () => {
    process.env.ORBIT_TELEMETRY = "0";
    await telemetry.trackFriction({ slug: "route_task_no_match", detail: "anything" });
    await flush();
    assert.equal(received.filter((r) => r.body?.type === "friction").length, 0);
    delete process.env.ORBIT_TELEMETRY;
  });
});

describe("idea submission", () => {
  test("submits redacted content, echoes what was sent, returns the ref", async () => {
    const res = await ideas.submitIdea({ title: "Sync to https://myesp.com", detail: "I need Orbit to email reports to boss@corp.com weekly", version: "0.0.0" });
    assert.equal(res.status, "submitted");
    assert.equal(res.ref, "idea_0123456789abcdef");
    assert.ok(!res.sent_detail.includes("boss@corp.com"), res.sent_detail);
    assert.ok(!res.sent_title.includes("myesp.com"), res.sent_title);
    const posted = received.find((r) => r.url.startsWith("/idea") && r.method === "POST");
    assert.ok(posted && !JSON.stringify(posted.body).includes("boss@corp.com"), "raw email must never leave the process");
    assert.equal(posted.body.detail, res.sent_detail, "echo must be verbatim what was sent");
  });

  test("ideas fire even when telemetry is opted out, and never hit the telemetry endpoint", async () => {
    process.env.ORBIT_TELEMETRY = "0";
    const res = await ideas.submitIdea({ title: "Still works", detail: "explicit ask is its own consent", version: "0.0.0" });
    assert.equal(res.status, "submitted");
    assert.equal(received.filter((r) => r.url === "/telemetry").length, 0, "idea path must not touch telemetry");
    delete process.env.ORBIT_TELEMETRY;
  });

  test("retraction sends DELETE with ref + clientId", async () => {
    const res = await ideas.retractIdea({ ref: "idea_0123456789abcdef" });
    assert.equal(res.status, "retracted");
    const del = received.find((r) => r.method === "DELETE");
    assert.ok(del.url.includes("ref=idea_0123456789abcdef") && del.url.includes("clientId="), del.url);
  });
});
