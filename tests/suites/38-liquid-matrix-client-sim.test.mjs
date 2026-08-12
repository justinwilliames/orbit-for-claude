/**
 * Liquid branch coverage + degraded-client simulation.
 *
 * Both tools exist because a green verdict on ONE document is not a verdict
 * on the document that gets delivered — one email per personalisation state,
 * one document per client class. So the tests are written the same way: for
 * every check, a fixture pair. One input where the check must PASS, one where
 * it must FAIL, and the failing one carries the defect the check is named for.
 *
 * The fixtures are a generic e-commerce loyalty email: loyalty_tier x
 * has_open_order. No real brand, no real figure.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";

let client = null;
let mock = null;

const FILLER =
  "Members earn one point for every dollar spent and unlock a new reward tier " +
  "every thousand points. Points never expire while an account stays active. ";

/**
 * The known-GOOD loyalty email.
 *
 * Two axes. `loyalty_tier` drives an if/else — a SWAP, so each arm carries
 * something the other lacks. `has_open_order` drives an if with no else — a
 * legitimately optional module, which C2 must NOT flag.
 */
const GOOD_EMAIL = `<!DOCTYPE html>
<html lang="en">
<head><style>.wrap{max-width:600px;margin:0 auto}</style></head>
<body>
  <div class="module-hero"><h1>Your rewards this month</h1><p>${FILLER.repeat(4)}</p></div>
  {% capture tier_raw %}{{custom_attribute.\${loyalty_tier}}}{% endcapture %}
  {% assign tier = tier_raw | strip | downcase %}
  {% if tier == 'gold' %}
    <div class="module-gold-perks"><p>Free express delivery on everything, all year.</p></div>
    <div class="module-gold-concierge"><p>Your concierge line is open seven days.</p></div>
  {% else %}
    <div class="module-standard-perks"><p>Free delivery on orders over fifty dollars.</p></div>
    <div class="module-upgrade-nudge"><p>Two hundred points to Gold.</p></div>
  {% endif %}
  {% capture order_raw %}{{custom_attribute.\${has_open_order}}}{% endcapture %}
  {% assign has_open = order_raw | strip | downcase %}
  {% if has_open == 'true' %}
    <div class="module-order-status"><p>Your order is on its way.</p></div>
  {% endif %}
  <div class="module-footer"><p>Manage preferences or unsubscribe at any time.</p></div>
</body>
</html>`;

const VARIABLES = JSON.stringify({
  loyalty_tier: ["gold", "silver"],
  has_open_order: ["true", "false"],
});

describe("Liquid state matrix + client simulation", () => {
  before(async () => {
    mock = await startMockApiServer();
    client = await spawnMcpClient({
      env: { ...mock.env, ORBIT_HOME_ROOT: makeTempWorkspace() }
    });
  });

  after(async () => {
    if (client) await client.close();
    if (mock) await mock.close();
  });

  const matrix = (html, extra = {}) =>
    client.callToolJson("orbit_liquid_state_matrix", {
      html,
      variables_json: VARIABLES,
      ...extra,
    });

  // ── the control ──────────────────────────────────────────────────

  test("the known-good email passes every invariant", async () => {
    const { parsed } = await matrix(GOOD_EMAIL);
    assert.equal(parsed.status, "ok");
    assert.equal(
      parsed.verdict,
      "pass",
      `unexpected findings: ${JSON.stringify(parsed.findings)}`
    );
    assert.equal(parsed.states_rendered, 4, "2 tiers x 2 order states");
    assert.equal(parsed.arms.registered, parsed.arms.taken, "every arm reachable");
  });

  test("axes are derived from the template, not from a fixed list", async () => {
    const { parsed } = await matrix(GOOD_EMAIL);
    const names = parsed.axes.map((a) => a.name).sort();
    assert.deepEqual(names, ["has_open_order", "loyalty_tier"]);
    // The if/else axis is exclusive; the bare-if axis is not. C2 depends on
    // exactly this distinction, so it is asserted rather than assumed.
    const byName = Object.fromEntries(parsed.axes.map((a) => [a.name, a]));
    assert.equal(byName.loyalty_tier.exclusive, true);
    assert.equal(byName.has_open_order.exclusive, false);
  });

  test("an optional module behind a bare {% if %} is NOT a subset finding", async () => {
    // Flipping has_open_order off legitimately renders one module fewer. A
    // check that fires here would fire on 100% of correct real templates and
    // be ignored inside a week.
    const { parsed } = await matrix(GOOD_EMAIL);
    assert.equal(
      parsed.findings.filter((f) => f.invariant === "C2").length,
      0
    );
  });

  // ── H: an arm dead by construction ───────────────────────────────

  test("an arm unreachable by construction FAILS", async () => {
    const seeded = GOOD_EMAIL.replace(
      "{% if tier == 'gold' %}",
      "{% if tier == 'gold' and tier == 'silver' %}"
    );
    assert.notEqual(seeded, GOOD_EMAIL, "the seed must apply");

    const { parsed } = await matrix(seeded);
    assert.equal(parsed.verdict, "fail");
    const dead = parsed.findings.filter((f) => f.invariant === "H");
    assert.ok(dead.length > 0, "the gold arm can never be taken");
    assert.match(dead[0].message, /unreachable by construction/i);
  });

  // ── C2: a drop where a swap was intended ─────────────────────────

  test("two modules pointed at the same arm leaves one population with a hole", async () => {
    // Every arm is still reachable, the body still clears the collapse floor,
    // and no other invariant sees this. It is the shape that sent a whole
    // population an email with no argument in it.
    const seeded = GOOD_EMAIL.replace(
      `<div class="module-standard-perks"><p>Free delivery on orders over fifty dollars.</p></div>
    <div class="module-upgrade-nudge"><p>Two hundred points to Gold.</p></div>`,
      `<div class="module-gold-perks"><p>Free express delivery on everything, all year.</p></div>`
    );
    assert.notEqual(seeded, GOOD_EMAIL, "the seed must apply");

    const { parsed } = await matrix(seeded);
    assert.equal(parsed.verdict, "fail");
    const c2 = parsed.findings.filter((f) => f.invariant === "C2");
    assert.equal(c2.length, 1);
    assert.equal(c2[0].axis, "loyalty_tier");
    assert.match(c2[0].message, /gains nothing/);
  });

  // ── B: unmodelled constructs fail loud ───────────────────────────

  test("an unmodelled Liquid TAG fails rather than rendering its body unconditionally", async () => {
    const seeded = GOOD_EMAIL.replace("{% capture tier_raw %}", "{% mystery_tag %}{% capture tier_raw %}");
    assert.notEqual(seeded, GOOD_EMAIL, "the seed must apply");

    const { parsed } = await matrix(seeded);
    assert.equal(parsed.verdict, "fail");
    const b = parsed.findings.filter((f) => f.check === "unmodelled_tag");
    assert.equal(b.length, 1);
    assert.match(b[0].message, /mystery_tag/);
  });

  test("an unmodelled FILTER fails rather than resolving to a junk value", async () => {
    const seeded = GOOD_EMAIL.replace(
      "{% assign tier = tier_raw | strip | downcase %}",
      "{% assign tier = tier_raw | strip | mystery_filter %}"
    );
    assert.notEqual(seeded, GOOD_EMAIL, "the seed must apply");

    const { parsed } = await matrix(seeded);
    assert.equal(parsed.verdict, "fail");
    assert.ok(parsed.findings.some((f) => f.check === "unmodelled_filter"));
  });

  // ── A and C ──────────────────────────────────────────────────────

  test("a Liquid token that escapes to the DOM is a residual failure", async () => {
    // A stray closing brace leaves the token unterminated for the tag
    // tokenizer, so the catch-all cannot reach it and it survives the render.
    const seeded = GOOD_EMAIL.replace(
      '<div class="module-footer">',
      '<div class="module-footer">{{ unclosed_token }'
    );
    const { parsed } = await matrix(seeded);
    const residual = parsed.findings.filter((f) => f.invariant === "A");
    assert.ok(residual.length > 0, "an unresolved token reaching a recipient must fail");
  });

  test("a state that collapses the email fails", async () => {
    const seeded = GOOD_EMAIL.replace(`<p>${FILLER.repeat(4)}</p>`, "<p>Hi.</p>");
    assert.notEqual(seeded, GOOD_EMAIL, "the seed must apply");

    const { parsed } = await matrix(seeded);
    assert.equal(parsed.verdict, "fail");
    assert.ok(parsed.findings.some((f) => f.invariant === "C"));
  });

  // ── G: spelling agreement ────────────────────────────────────────

  test("two truthiness parsers on one attribute that disagree on 'True' FAIL", async () => {
    // The normalising capture is left in place for the tier, but the order
    // flag now compares the RAW value against the literal 'true'. Braze
    // stores booleans as "True" often enough that this is a live population,
    // and no single-state render can show it.
    const seeded = GOOD_EMAIL
      .replace("{% assign has_open = order_raw | strip | downcase %}", "{% assign has_open = order_raw %}");
    assert.notEqual(seeded, GOOD_EMAIL, "the seed must apply");

    const { parsed } = await client.callToolJson("orbit_liquid_state_matrix", {
      html: seeded,
      // has_open_order left unsupplied so it is treated as a flag and the
      // spelling check applies to it.
      variables_json: JSON.stringify({ loyalty_tier: ["gold", "silver"] }),
    });
    const g = parsed.findings.filter((f) => f.invariant === "G");
    assert.equal(g.length, 1, `expected one spelling disagreement, got ${JSON.stringify(parsed.findings)}`);
    assert.equal(g[0].axis, "has_open_order");
  });

  // ── abstentions ──────────────────────────────────────────────────

  test("a template with no branches says so, and does not call it a pass", async () => {
    const { parsed } = await client.callToolJson("orbit_liquid_state_matrix", {
      html: `<html><body><div class="module-hero"><p>${FILLER.repeat(4)}</p></div></body></html>`,
    });
    assert.equal(parsed.verdict, "no_branches");
    assert.match(parsed.message, /not a pass/i);
  });

  test("too many axes ABSTAINS rather than sampling and calling it coverage", async () => {
    const { parsed } = await matrix(GOOD_EMAIL, { max_axes: 1 });
    assert.equal(parsed.status, "needs_inputs");
    assert.equal(parsed.verdict, "too_many_axes");
    assert.match(parsed.message, /Nothing was checked/);
  });

  // ── the negative test, shipped with the tool ─────────────────────

  test("self_test seeds defects into the caller's own template and watches each fail", async () => {
    const { parsed } = await matrix(GOOD_EMAIL, { self_test: true });
    assert.equal(parsed.mode, "self_test");
    assert.equal(parsed.verdict, "pass", JSON.stringify(parsed.cases));
    assert.equal(parsed.control_verdict, "pass");
    assert.ok(parsed.cases.length >= 4);
    // A seed that stopped applying must read BROKEN, never PASS — that is a
    // test reporting green while testing nothing, one level up.
    assert.equal(parsed.cases.filter((c) => c.outcome === "BROKEN").length, 0);
  });

  // ── orbit_client_sim ─────────────────────────────────────────────

  const CLEAN_HTML = `<!DOCTYPE html><html lang="en"><head>
<style>.wrap{max-width:600px} @media (max-width:600px){.wrap{width:100%}}</style>
</head><body><table><tr><td><a href="https://example.com/shop">Shop now</a></td></tr></table></body></html>`;

  test("a clean email passes both purity checks", async () => {
    const { parsed } = await client.callToolJson("orbit_client_sim", {
      html: CLEAN_HTML,
      include_html: false,
    });
    assert.equal(parsed.verdict, "pass");
    assert.equal(parsed.purity_findings.filter((f) => f.severity === "fail").length, 0);
  });

  test("@property anywhere in a style block kills the whole block under gmailish", async () => {
    const poisoned = CLEAN_HTML.replace(
      "<style>",
      '<style>@property --brand { syntax: "<color>"; inherits: false; initial-value: #123456; }'
    );
    const { parsed } = await client.callToolJson("orbit_client_sim", {
      html: poisoned,
      include_html: false,
    });
    assert.equal(parsed.verdict, "fail");
    const poison = parsed.purity_findings.find((f) => f.check === "block_atomic_poison");
    assert.ok(poison, "the confirmed killer must be a fail, not a warn");
    assert.equal(poison.severity, "fail");

    const gmailish = parsed.variants.find((v) => v.class === "gmailish");
    assert.equal(gmailish.style_blocks_dropped, 1, "the whole block dies, not just the at-rule");
    assert.equal(gmailish.style_blocks_kept, 0);

    // And the point of the tool: the authored document keeps its CSS, so a
    // render gate run on it alone reports nothing at all.
    const full = parsed.variants.find((v) => v.class === "full");
    assert.equal(full.style_blocks_dropped, 0);
  });

  test("an <a> directly wrapping a <table> is the inliner's dead-anchor hoist", async () => {
    const hoistable = CLEAN_HTML.replace(
      '<table><tr><td><a href="https://example.com/shop">Shop now</a></td></tr></table>',
      '<a href="https://example.com/shop"><table><tr><td>Shop now</td></tr></table></a>'
    );
    const { parsed } = await client.callToolJson("orbit_client_sim", {
      html: hoistable,
      include_html: false,
    });
    assert.equal(parsed.verdict, "fail");
    const hoist = parsed.purity_findings.find((f) => f.check === "anchor_wraps_table");
    assert.ok(hoist);
    assert.equal(hoist.count, 1);
    assert.match(hoist.fix, /should_inline_css/);
  });

  test("an MSO conditional between the anchor and the table does not hide the hoist", async () => {
    const hoistable = CLEAN_HTML.replace(
      '<table><tr><td><a href="https://example.com/shop">Shop now</a></td></tr></table>',
      '<a href="https://example.com/shop"><!--[if mso]><i></i><![endif]--><table><tr><td>Shop now</td></tr></table></a>'
    );
    const { parsed } = await client.callToolJson("orbit_client_sim", {
      html: hoistable,
      include_html: false,
    });
    assert.equal(parsed.purity_findings.filter((f) => f.check === "anchor_wraps_table").length, 1);
  });

  test("every requested class emits a document the render gate can measure", async () => {
    const { parsed } = await client.callToolJson("orbit_client_sim", {
      html: CLEAN_HTML,
      classes: ["full", "nocss", "gmailish"],
    });
    assert.equal(parsed.variants.length, 3);
    for (const variant of parsed.variants) {
      assert.equal(typeof variant.html, "string");
      assert.ok(variant.bytes > 0);
      assert.ok(variant.what_it_models.length > 0);
    }
    const nocss = parsed.variants.find((v) => v.class === "nocss");
    assert.ok(!/<style/i.test(nocss.html), "nocss must actually strip the style block");
  });
});
