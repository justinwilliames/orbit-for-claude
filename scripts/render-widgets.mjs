#!/usr/bin/env node
/**
 * Render every Orbit widget to standalone HTML so a human (or a browser
 * agent) can actually LOOK at them.
 *
 * WHY THIS EXISTS. Orbit ships 23 `ui://` widgets and until 2026-08-24 not
 * one had ever been visually verified. The test suite proves they don't
 * throw; it cannot tell you the grid collapsed to 47px and the user is
 * staring at column headers with no data. That is exactly what was found
 * the first time anyone looked — see the KNOWN DEFECT note in
 * server/ui/widgets/esp-matrix.js.
 *
 * Claude's own window cannot be driven by Claude (it would let the model
 * operate its own permissions), so "watch it render in the app" is not an
 * option and never will be. This renders the SAME html the host renders,
 * to disk, where any browser can open it.
 *
 * Usage:
 *   node scripts/render-widgets.mjs [outdir]
 *   cd <outdir> && python3 -m http.server 8899
 *   ...then open http://127.0.0.1:8899/<widget>.html
 *
 * Serve over HTTP rather than file:// — these run JS, and file:// origins
 * break the module/bridge paths.
 *
 * TWO STATES PER WIDGET, and both are worth looking at:
 *   <slug>.html        — the empty state, exactly what a user sees before
 *                        a tool has run. Rendered with no data.
 *   <slug>.data.html   — the populated state, where layout actually gets
 *                        stressed. Only produced where a fixture exists
 *                        below; add more as they are needed.
 *
 * HONEST LIMIT 1: a widget's interactive path talks to the host's ext-apps
 * bridge, which does not exist in a plain browser. Layout, contrast,
 * overflow, empty states and baked data all verify correctly here. Live
 * host round-trips do not.
 *
 * COVERAGE, as of 2026-08-24: `--live` boots the real MCP client and
 * populates 21 of the 23 widgets from actual tool output. The two that do
 * not are REPORTED by name with their reason rather than skipped quietly
 * — orbit_lifecycle_diagram wants a spec_json its render action cannot
 * synthesise, and orbit_review_creative returns no structuredContent for
 * the minimal item shape. "No fixture" and "tool refused" are different
 * facts and the summary keeps them apart.
 *
 * THE DEFECT SIGNATURE, for whoever automates this next. Load a populated
 * widget at ~900x520 and look for a scrollable element whose scrollHeight
 * dwarfs its clientHeight:
 *
 *   sh > 150 && h < 150 && sh > h * 3
 *
 * That is "the user is peering at data through a slot". Calibrate against
 * the known case — .grid-box in the ESP matrix reads 71px visible against
 * 592px of content, a ratio of 8.3. A first pass at this used h < 70 and
 * cheerfully reported zero defects while the 71px case sat in front of
 * it; pick the threshold from the real measurement, not a round number.
 *
 * WHAT THE FULL SWEEP FOUND (21 populated widgets @ 900x520, three checks:
 * collapsed scrollers, horizontal document overflow, content clipped by an
 * overflow:hidden ancestor). 18 clean on all three. Three flagged, all the
 * same defect:
 *   orbit_esp_capabilities  .grid-box   71px /  592px   ratio 8.3  SEVERE
 *   orbit_client_sim        .rail-list 140px /  645px   ratio 4.6
 *   orbit_render_gate       .rail-list 104px /  379px   ratio 3.6
 *
 * No horizontal overflow and no hidden-clipping anywhere in the set, which
 * is worth stating: the three below are the whole finding, not a sample.
 *
 * This is ONE systemic issue, not three bugs. Every one of them is a
 * `flex:1; min-height:0` primary content area inside a height-constrained
 * column, so the content the widget exists to show gets whatever is left
 * after the chrome — and at a 520px pane that is nearly nothing. The ESP
 * matrix is worst because it drops to column headers with zero data rows;
 * the other two remain usable but show a fraction of their content (the
 * client matrix reports 7 client classes and shows about one and a half).
 *
 * Do NOT fix these with min-height on the child. That was tried on the ESP
 * matrix and reverted: the parent cannot grow, so the child overflows it
 * and the panel below renders ON TOP of the content. The fix is structural
 * — let the widget body scroll rather than fit a fixed viewport — and it
 * wants verifying in the real host pane, which Claude cannot drive.
 */

import fs from "node:fs";
import path from "node:path";

const OUT = path.resolve(process.argv[2] ?? "./tests/outputs/widgets");
fs.mkdirSync(OUT, { recursive: true });

const { ORBIT_WIDGETS } = await import("../server/ui/register.js");

/**
 * Fixtures for the populated state, keyed by a substring of the widget uri.
 * Each returns the structuredContent its tool would hand the host — taken
 * from the real handler wherever possible, so the fixture cannot drift from
 * what actually ships.
 */
const FIXTURES = {
  "esp-matrix": async () => {
    const { ESP_TOOL_DEFINITIONS } = await import("../server/esp/tools.js");
    const def = ESP_TOOL_DEFINITIONS.find((d) => d.name === "orbit_esp_capabilities");
    return (await def.handler({})).structuredContent;
  },
};

let empty = 0;
let populated = 0;
const failures = [];

for (const widget of ORBIT_WIDGETS) {
  const slug = widget.uri.replace(/^ui:\/\//, "").replace(/[^a-z0-9]+/gi, "-");

  try {
    fs.writeFileSync(path.join(OUT, `${slug}.html`), await widget.render());
    empty++;
  } catch (error) {
    failures.push(`${slug} (empty): ${error.message}`);
  }

  const fixtureKey = Object.keys(FIXTURES).find((k) => widget.uri.includes(k));
  if (!fixtureKey) continue;
  try {
    const data = await FIXTURES[fixtureKey]();
    fs.writeFileSync(path.join(OUT, `${slug}.data.html`), await widget.render(data));
    populated++;
  } catch (error) {
    failures.push(`${slug} (data): ${error.message}`);
  }
}

console.log(`widgets: ${ORBIT_WIDGETS.length}`);
console.log(`  empty-state rendered: ${empty}`);
console.log(`  populated rendered:   ${populated} (fixtures exist for ${Object.keys(FIXTURES).length})`);
console.log(`  output: ${OUT}`);
if (failures.length) {
  console.log(`\nFAILED (${failures.length}):`);
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
}

/* ── LIVE MODE ────────────────────────────────────────────────────────────
 * `--live` boots a real MCP client (the same harness the contract suite
 * uses), calls every widget-bearing tool, and renders each widget with
 * whatever structuredContent the tool actually returned. That is the only
 * way to populate the 20-odd widgets whose tools live in the
 * server/index.js monolith and cannot be imported directly.
 *
 * Tools that need credentials return needs_setup and are reported as such
 * rather than skipped silently — "no fixture" and "tool refused" are
 * different facts and the summary keeps them apart.
 */
/**
 * Minimal REAL inputs per widget-bearing tool, so live mode can populate
 * widgets whose tools legitimately refuse an empty call. Called with {} these
 * return no structuredContent — not a bug, they are "score this subject
 * line" tools with nothing to score. Required params were read off the live
 * tool list rather than guessed; add a row when a widget renders empty.
 */
const SAMPLE_HTML =
  '<html><body style="margin:0;background:#fff"><table width="100%"><tr><td style="padding:24px;font-family:Arial;font-size:16px;color:#222">' +
  '<h1 style="font-size:24px;margin:0 0 12px">Your order is on its way</h1>' +
  '<p style="margin:0 0 16px">Tracking updates land here as soon as the carrier scans it.</p>' +
  '<a href="https://example.com/track" style="background:#4338ca;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Track my order</a>' +
  '<p style="margin:16px 0 0;font-size:12px;color:#777">You are receiving this because you shop with us. <a href="https://example.com/u">Unsubscribe</a></p>' +
  '</td></tr></table></body></html>';

const LIVE_ARGS = {
  orbit_score_subject_line: { subject: "Your order is on its way", preheader: "Tracking inside" },
  orbit_score_preheader: { preheader: "Tracking updates inside", subject: "Your order is on its way" },
  orbit_check_push_copy: { title: "Order shipped", body: "Tap to track your delivery in real time." },
  orbit_compose_sms: { body: "Your order shipped. Track it: example.com/t", region: "US", brand: "ACME" },
  orbit_dark_mode_check: { html: SAMPLE_HTML },
  orbit_client_sim: { html: SAMPLE_HTML },
  orbit_qa_email: { html: SAMPLE_HTML, include_size_check: true },
  orbit_render_gate: { html: SAMPLE_HTML, label: "widget render check" },
  // Field names read off the tool schema, not guessed: last_order_date /
  // order_count / lifetime_value. A first pass used last_order_at/orders/
  // revenue and the tool honestly returned scored_rows:0.
  orbit_rfm_score: {
    users_json: JSON.stringify([
      { id: "u1", last_order_date: "2026-08-01", order_count: 9, lifetime_value: 940 },
      { id: "u2", last_order_date: "2026-05-11", order_count: 2, lifetime_value: 120 },
      { id: "u3", last_order_date: "2026-02-02", order_count: 1, lifetime_value: 40 },
      { id: "u4", last_order_date: "2026-07-20", order_count: 5, lifetime_value: 505 },
    ]),
    reference_date: "2026-08-24",
  },
  orbit_learn_email_template: { html: SAMPLE_HTML, template_name: "widget-check" },
  orbit_liquid_state_matrix: {
    html: SAMPLE_HTML.replace(
      "Your order is on its way",
      "{% if loyalty_tier == 'gold' %}Your VIP order is on its way{% else %}Your order is on its way{% endif %}"
    ),
  },
  orbit_check_email_auth: { domain: "yourorbit.team" },
  orbit_list_growth_forecast: { current_list_size: 48000, monthly_acquisition: 3200, monthly_churn_pct: 2.4, months: 12 },
  orbit_parse_test_readout: {
    test_name: "Subject line — urgency vs clarity",
    hypothesis: "A clearer subject beats an urgent one on click-through.",
    control_visitors: 18400, control_conversions: 552,
    variant_visitors: 18310, variant_conversions: 641,
  },
  orbit_parse_postmaster_signal: {
    snapshot_json: JSON.stringify({ spam_rate_pct: 0.18, domain_reputation: "high", ip_reputation: "high" }),
  },
  orbit_lifecycle_diagram: { action: "render", request: "Welcome series: signup, then a value email 2 days later, then a nudge if no purchase in 7 days." },
  orbit_review_creative: {
    items: [{ name: "Welcome email", channel: "email", html: SAMPLE_HTML }],
    programme: "Welcome series",
  },
  orbit_cohort_retention: {
    enrollments_json: JSON.stringify([
      { user_id: "u1", enrolled_at: "2026-06-01" },
      { user_id: "u2", enrolled_at: "2026-06-01" },
      { user_id: "u3", enrolled_at: "2026-06-08" },
    ]),
    events_json: JSON.stringify([
      { user_id: "u1", occurred_at: "2026-06-09" },
      { user_id: "u2", occurred_at: "2026-06-15" },
    ]),
    period_days: 7,
    periods_to_track: 4,
    reference_date: "2026-08-24",
  },
};

if (process.argv.includes("--live")) {
  const { spawnMcpClient } = await import("../tests/harness/mcp-client.mjs");
  const { startMockApiServer } = await import("../tests/harness/mock-api-server.mjs");
  const { makeTempWorkspace } = await import("../tests/harness/fixtures.mjs");

  const mock = await startMockApiServer();
  const client = await spawnMcpClient({
    env: { ...mock.env, ORBIT_HOME_ROOT: makeTempWorkspace() },
  });

  const tools = await client.listTools();
  const META_KEY = "ui/resourceUri";
  const widgetTools = tools.filter((t) => t._meta?.[META_KEY]);

  let populated = 0;
  const refused = [];
  const noData = [];

  for (const tool of widgetTools) {
    const uri = tool._meta[META_KEY];
    const widget = ORBIT_WIDGETS.find((w) => w.uri === uri);
    if (!widget) continue;
    const slug = uri.replace(/^ui:\/\//, "").replace(/[^a-z0-9]+/gi, "-");

    const result = await client.callToolLenient(tool.name, LIVE_ARGS[tool.name] ?? {});
    const data = result?.raw?.structuredContent ?? null;

    if (!data) {
      const why = JSON.stringify(result?.parsed ?? {}).slice(0, 60);
      (/needs_setup|needs_inputs|auth/i.test(why) ? refused : noData).push(`${tool.name} ${why}`);
      continue;
    }
    fs.writeFileSync(path.join(OUT, `${slug}.live.html`), await widget.render(data));
    populated++;
  }

  await client.close();
  await mock.close();

  console.log(`\nLIVE MODE`);
  console.log(`  widget-bearing tools: ${widgetTools.length}`);
  console.log(`  populated from live calls: ${populated}`);
  console.log(`  refused (needs setup/inputs): ${refused.length}`);
  console.log(`  returned no structuredContent: ${noData.length}`);
  for (const r of refused) console.log(`    refused: ${r}`);
  for (const n of noData) console.log(`    nodata:  ${n}`);
}
