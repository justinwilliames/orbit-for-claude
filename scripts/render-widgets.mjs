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
 * The email under test for the render-gate fixture. Every number the
 * gate reports below is MEASURED off this markup by the widget's own
 * nested frame, so the failures are real geometry rather than authored
 * findings — change the markup and the report changes with it.
 *
 * Built to fail three ways and pass one:
 *   - 562px fixed table in a 390px viewport  -> overflows by exactly 172px
 *   - 11px #9a9a9a footer on white           -> ~2.9:1, under WCAG AA 4.5:1
 *   - the h1 breaks with one word on its last line at this measure
 *   - the primary CTA is >=44px and high-contrast, so it is NOT reported
 * The passing CTA is deliberate. A gate whose every element fails reads
 * as a rigged demo, and nobody trusts a smoke alarm that is always on.
 */
const MERROWFIELD_RESTOCK_HTML =
  '<html><body style="margin:0;background:#ffffff">' +
  '<table role="presentation" width="562" cellpadding="0" cellspacing="0" border="0"' +
  ' style="width:562px;border-collapse:collapse;table-layout:fixed"><tr>' +
  '<td style="padding:28px 24px;font-family:Georgia,\'Times New Roman\',serif;color:#1c1b19">' +
  '<h1 style="font-size:26px;line-height:1.25;margin:0 0 14px">The autumn linen restock has landed at Merrowfield</h1>' +
  '<p style="font-size:16px;line-height:1.55;margin:0 0 20px">Four thousand stonewashed throws, woven at the same mill we have used since the first run, and priced to clear before the winter range arrives.</p>' +
  '<a href="https://merrowfield.example/shop/linen" style="display:inline-block;background:#1f3d2b;color:#ffffff;font-size:16px;font-weight:700;padding:15px 28px;border-radius:4px;text-decoration:none">Shop the restock</a>' +
  '<p style="margin:22px 0 0;font-size:11px;line-height:1.5;color:#9a9a9a">You are receiving this because you have ordered from Merrowfield. ' +
  '<a href="https://merrowfield.example/prefs" style="color:#9a9a9a">Update your preferences</a> or ' +
  '<a href="https://merrowfield.example/unsubscribe" style="color:#9a9a9a">unsubscribe</a>.</p>' +
  "</td></tr></table></body></html>";

/**
 * Fixtures for the populated state, keyed by a substring of the widget uri.
 * Each returns the structuredContent its tool would hand the host — taken
 * from the real handler wherever possible, so the fixture cannot drift from
 * what actually ships.
 *
 * Every fixture here FAILS at something on purpose. A widget rendered on
 * clean data proves only that it can draw a clean day; the layouts that
 * break are the ones carrying findings, long strings and skewed
 * distributions, and those are the ones worth looking at.
 *
 * The companies are invented — Merrowfield (DTC homeware) and Calderpoint
 * (SaaS). No real brand, address, Braze id or Stripo id appears in this
 * file, because these renders get screenshotted.
 */
const FIXTURES = {
  "esp-matrix": async () => {
    const { ESP_TOOL_DEFINITIONS } = await import("../server/esp/tools.js");
    const def = ESP_TOOL_DEFINITIONS.find((d) => d.name === "orbit_esp_capabilities");
    return (await def.handler({})).structuredContent;
  },

  // orbit_render_gate. The tool's structuredContent is just the email and
  // its label — every finding is measured in the browser at render time,
  // so this fixture is the input, not the verdict.
  "render-gate": async () => ({
    label: "Merrowfield — autumn linen restock",
    html: MERROWFIELD_RESTOCK_HTML,
  }),

  // orbit_score_subject_line. Shape is `{ subject, preheader, ...scoreSubject() }`
  // per the handler in server/index.js; scoreSubject is a pure function in
  // calculators.js, so the score below is computed, not asserted.
  //
  // This line is engineered to land on 74/100 "decent": three spam-trigger
  // words (-18) and 84 characters (-8). The payload — "4,000" — sits at
  // index 72, past the cut on the 320px and 480px panes, so the one
  // concrete fact in the subject is the first thing the inbox throws away.
  "inbox-preview": async () => {
    const { scoreSubject } = await import("../server/calculators.js");
    const subject = "Last chance: free delivery and 20% discount on the Merrowfield restock, 4,000 throws";
    const preheader = "The autumn linen sale closes Sunday at midnight.";
    return { subject, preheader, ...scoreSubject(subject, preheader) };
  },

  // orbit_rfm_score. scoreRfm() is pure (segmentation-math.js), so the
  // segments, shares and quintile bands below are all computed from the
  // list rather than typed out.
  //
  // Echo's caveat, kept: this is a LIST snapshot, not one campaign. The
  // failure it carries is a "Can't Lose Them" block of exactly 610 people
  // holding exactly $198,000 at an average recency of exactly 90 days —
  // a fifth of the list's revenue sitting in the segment whose recommended
  // action is personal outreach, unbought-from for a quarter.
  //
  // The cohorts are laid out so the quintile bands land where they are
  // meant to: the at-risk block's recency (74-106d) sits entirely above
  // every active cohort's, and its monetary floor (293) sits entirely
  // above the loyal cohort's ceiling (285). Overlap either range and the
  // block redistributes across segments and the fixture stops meaning
  // anything.
  "rfm-map": async () => {
    const { scoreRfm } = await import("../server/segmentation-math.js");
    const REF = "2026-09-08";
    const dayBefore = (n) =>
      new Date(Date.parse(REF + "T00:00:00Z") - n * 86400000).toISOString().slice(0, 10);
    const users = [];
    const push = (prefix, i, recency, freq, revenue) =>
      users.push({
        id: `${prefix}-${i}`,
        last_order_date: dayBefore(recency),
        order_count: freq,
        lifetime_revenue: revenue,
      });

    // 305 mirrored pairs = 610 users. Each pair sums to 649 on revenue and
    // to 180 on recency days, and the last 55 pairs carry one dollar more,
    // which puts the segment on exactly $198,000 at exactly 90 days mean.
    for (let i = 0; i < 305; i++) {
      const money = (i % 40) * 0.8;   // +/- 0-31.20 around 324.50
      const days = i % 17;            // +/- 0-16 around 90
      push("risk", i * 2, 90 - days, 12 + (i % 7), 324.5 - money);
      push("risk", i * 2 + 1, 90 + days, 12 + (i % 7), 324.5 + money + (i >= 250 ? 1 : 0));
    }
    // Champions: recent, frequent, top of the revenue distribution.
    for (let i = 0; i < 420; i++) push("champ", i, 2 + (i % 18), 15 + (i % 11), 420 + (i % 23) * 21);
    // Loyal: frequent but a tier down on value. Ceiling 285 < 293 above.
    for (let i = 0; i < 500; i++) push("loyal", i, 5 + (i % 40), 6 + (i % 5), 150 + (i % 16) * 9);
    // Recent one- and two-time buyers — the bulk of any DTC list.
    for (let i = 0; i < 1070; i++) push("new", i, 1 + (i % 69), 1 + (i % 2), 30 + (i % 12) * 9);
    // Long gone.
    for (let i = 0; i < 400; i++) push("lost", i, 200 + (i % 200), 1, 20 + (i % 6) * 10);
    // What every CRM export actually carries: signups who never bought.
    // scoreRfm counts these rather than dropping them, which is what puts
    // the result on `partial` instead of `ok`.
    for (let i = 0; i < 24; i++) users.push({ id: `blank-${i}`, last_order_date: "", order_count: 0, lifetime_revenue: 0 });

    const r = scoreRfm({ users, referenceDate: REF });
    // The same projection the tool performs — the scored sample, the CSV
    // paths and the attribution block are not drawable and are dropped.
    return {
      user_count: r.user_count,
      total_revenue: r.total_revenue,
      reference_date: r.reference_date,
      input_rows: r.input_rows,
      scored_rows: r.scored_rows,
      skipped: r.skipped,
      segments: r.segments,
    };
  },

  // orbit_audit_send_calendar. auditSendCalendar() talks to Braze, so
  // unlike the three above this one is a literal payload, shaped against
  // buildCalendarReport()'s return in server/braze-send-calendar.js.
  // Keep it consistent by hand: summary.by_check is a tally of findings[],
  // the tag_density count is the real number of "promo" tags below, and
  // total_scheduled (10) counts the no_send_time row that never reaches
  // calendar[] (9 sends) — which is what makes the widget's unaccounted-
  // sends line fire instead of quietly drawing 9 of 10 and saying nothing.
  "send-calendar": async () => ({
    window: { days: 14, end_time: "2026-09-22T00:00:00+10:00" },
    policy: {
      quiet_hours: { start: 21, end: 8 },
      allowed_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      max_sends_per_tag: 3,
      clock_basis: "workspace_timezone Australia/Brisbane (converted through Intl)",
    },
    overlap_basis: "tags_and_naming",
    caveats: [
      "Collision detection here is proxied through tags and naming convention only. Braze exposes no target segment on either /campaigns/details or /canvas/details, so two sends can share an audience and look unrelated to this tool. Treat a clean density check as 'no tag collision', never as 'no audience overlap'.",
      "1 broadcast(s) look recurring. Braze lists a recurring send once, at its NEXT occurrence only, so the density counts below are a floor, not a projection.",
    ],
    summary: {
      total_scheduled: 10,
      findings: 6,
      by_check: {
        quiet_hours: 1,
        disallowed_day: 1,
        tag_density: 1,
        mixed_delivery_semantics: 1,
        untagged: 1,
        no_send_time: 1,
      },
      busiest_day: { date: "2026-09-10", sends: 3 },
      headline: "6 finding(s) across 10 scheduled send(s).",
    },
    calendar: [
      {
        date: "2026-09-08",
        day: "Tue",
        sends: [
          {
            name: "Merrowfield_Promo_Autumn_Linen_Launch",
            type: "campaign",
            tags: ["promo", "homeware"],
            channels: ["email"],
            state: "active",
            next_send_time: "2026-09-08T09:30:00+10:00",
            schedule_type: "time_based",
            wall_clock: { hour: 9, minute: 30, day: "Tue", date: "2026-09-08", basis: "in Australia/Brisbane" },
            delivery: "point",
            notes: [],
          },
        ],
      },
      {
        date: "2026-09-09",
        day: "Wed",
        sends: [
          {
            name: "Merrowfield_Lifecycle_Winback_90d",
            type: "canvas",
            tags: ["lifecycle", "winback"],
            channels: ["email", "push"],
            state: "active",
            next_send_time: "2026-09-09T07:15:00+10:00",
            schedule_type: "time_based",
            wall_clock: { hour: 7, minute: 15, day: "Wed", date: "2026-09-09", basis: "in Australia/Brisbane" },
            delivery: "point",
            notes: [],
          },
          {
            name: "Merrowfield_Promo_Linen_Reminder",
            type: "campaign",
            tags: ["promo"],
            channels: ["email"],
            state: "active",
            next_send_time: "2026-09-09T17:00:00+10:00",
            schedule_type: "time_based",
            wall_clock: { hour: 17, minute: 0, day: "Wed", date: "2026-09-09", basis: "in Australia/Brisbane" },
            delivery: "point",
            notes: [],
          },
        ],
      },
      {
        date: "2026-09-10",
        day: "Thu",
        sends: [
          {
            name: "Merrowfield_Promo_Restock_Wave_2",
            type: "campaign",
            tags: ["promo", "homeware"],
            channels: ["email"],
            state: "active",
            next_send_time: "2026-09-10T08:45:00+10:00",
            schedule_type: "time_based",
            wall_clock: { hour: 8, minute: 45, day: "Thu", date: "2026-09-10", basis: "in Australia/Brisbane" },
            delivery: "point",
            notes: [],
          },
          {
            name: "Merrowfield_Newsletter_Mill_Notes_Sep",
            type: "campaign",
            tags: ["newsletter"],
            channels: ["email"],
            state: "active",
            next_send_time: "2026-09-10T09:00:00+10:00",
            schedule_type: "local_time_zones",
            wall_clock: { hour: 9, minute: 0, day: "Thu", date: "2026-09-10", basis: "in Australia/Brisbane" },
            delivery: "spread",
            notes: [
              'schedule_type "local_time_zones" delivers across recipient timezones or per-user optimal times, so a quiet-hours check on the nominal time would be meaningless. Not checked.',
            ],
          },
          {
            name: "Newsletter blast final v2",
            type: "campaign",
            tags: [],
            channels: ["email"],
            state: "draft",
            next_send_time: "2026-09-10T19:30:00+10:00",
            schedule_type: "time_based",
            wall_clock: { hour: 19, minute: 30, day: "Thu", date: "2026-09-10", basis: "in Australia/Brisbane" },
            delivery: "point",
            notes: [],
          },
        ],
      },
      {
        date: "2026-09-12",
        day: "Sat",
        sends: [
          {
            name: "Merrowfield_Promo_Autumn_Linen_Drop",
            type: "campaign",
            tags: ["promo", "homeware"],
            channels: ["email", "sms"],
            state: "active",
            next_send_time: "2026-09-12T22:40:00+10:00",
            schedule_type: "time_based",
            wall_clock: { hour: 22, minute: 40, day: "Sat", date: "2026-09-12", basis: "in Australia/Brisbane" },
            delivery: "point",
            notes: [],
          },
        ],
      },
      {
        date: "2026-09-15",
        day: "Tue",
        sends: [
          {
            name: "Merrowfield_Promo_Winter_Preview",
            type: "campaign",
            tags: ["promo"],
            channels: ["email"],
            state: "active",
            next_send_time: "2026-09-15T10:00:00+10:00",
            schedule_type: "time_based",
            wall_clock: { hour: 10, minute: 0, day: "Tue", date: "2026-09-15", basis: "in Australia/Brisbane" },
            delivery: "point",
            notes: [],
          },
        ],
      },
      {
        date: "2026-09-17",
        day: "Thu",
        sends: [
          {
            name: "Merrowfield_Lifecycle_Replenish_Bedlinen",
            type: "canvas",
            tags: ["lifecycle"],
            channels: ["email"],
            state: "active",
            next_send_time: "2026-09-17T11:20:00+10:00",
            schedule_type: "recurring_weekly",
            wall_clock: { hour: 11, minute: 20, day: "Thu", date: "2026-09-17", basis: "in Australia/Brisbane" },
            delivery: "point",
            notes: [],
          },
        ],
      },
    ],
    findings: [
      {
        check: "quiet_hours",
        severity: "high",
        send: "Merrowfield_Promo_Autumn_Linen_Drop",
        detail: "Scheduled at 22:40 in Australia/Brisbane, inside the stated quiet window 21:00–8:00.",
      },
      {
        check: "tag_density",
        severity: "high",
        send: "promo",
        detail: '5 sends tagged "promo" in a 14-day window (limit 3). Proxy for audience collision only — see caveats.',
      },
      {
        check: "disallowed_day",
        severity: "medium",
        send: "Merrowfield_Promo_Autumn_Linen_Drop",
        detail: "Scheduled on Sat in Australia/Brisbane, which is not in the allowed send days.",
      },
      {
        check: "mixed_delivery_semantics",
        severity: "medium",
        send: "2026-09-10",
        detail:
          "2026-09-10 mixes time_based, local_time_zones. Sends nominally on the same day land across a 24-hour spread relative to each other, so the ordering a recipient experiences is not the ordering here.",
      },
      {
        check: "untagged",
        severity: "medium",
        send: "Newsletter blast final v2",
        detail:
          "No tags. This send is excluded from every density and collision check by construction, so its absence from the findings below means nothing.",
      },
      {
        check: "no_send_time",
        severity: "medium",
        send: "Merrowfield_Promo_Clearance_Holding",
        detail: "Braze returned no parseable next_send_time for this broadcast.",
      },
    ],
    verdict: null,
  }),
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
