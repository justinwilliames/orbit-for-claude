/**
 * The "Made with Orbit" row has to be VISIBLE, measured in a real engine.
 *
 * `orbitSignStandalone()` is the only code in either repo whose stated
 * purpose is organic distribution: a shared artifact is the one object Orbit
 * produces that reaches someone who does not have Orbit installed. It
 * appended its row to a <body> that every widget sets to
 * `height: 100vh; overflow: hidden`, with a `.wrap` also at 100vh — so the
 * row's top edge was the fold by construction, at every viewport height,
 * with zero scrollbar to hint at it. Measured at 1400x900 before the fix:
 * top 900, bottom 938, visible pixels 0.
 *
 * Nothing caught it because every assertion anyone would write is a
 * querySelector assertion, and the element was always there. The two
 * screenshots in docs/images are captures of these exact documents and the
 * string appears in neither. So this suite asks a browser where the row
 * actually IS — a rect assertion, not a querySelector assertion.
 *
 * Engine: system Chrome in headless mode, driven with --dump-dom. The page
 * measures itself and writes the rect onto <body> as a data attribute, which
 * --dump-dom then hands back. No new dependency for a repo whose problem is
 * distribution, not test infrastructure. Skips loudly when no Chrome is
 * installed rather than passing quietly.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { ORBIT_WIDGETS } from "../../server/ui/register.js";

const execFileAsync = promisify(execFile);

/**
 * How many Chrome processes may be in flight at once.
 *
 * Every measurement is a cold Chrome start — ~0.75s of process launch for
 * ~5ms of layout. Run serially, 49 of them took 37s locally and blew past
 * the runner's 60s per-file timeout on CI hardware, where the whole file
 * was killed and reported as "ran no tests": node:test buffers a file's
 * subtest results and discards them when it kills the file, so 50 passing
 * assertions vanished into one nameless timeout. Overlapping the launches
 * is the fix — the assertions are unchanged, only the waiting is shared.
 */
const LAUNCH_CONCURRENCY = 12;

/**
 * Per-launch ceiling. A Chrome that never returns used to wedge the whole
 * file into that same anonymous 60s timeout; this makes it name itself.
 */
const LAUNCH_TIMEOUT_MS = 30_000;

/** Where a headless-capable Chrome might live, in order of preference. */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean);

const CHROME = CHROME_CANDIDATES.find((p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
});

const VIEWPORT = { width: 1400, height: 900 };

/**
 * The measurement the page runs on itself once laid out. Injected rather than
 * asserted from outside, because the numbers that matter (where the row sits
 * relative to the fold, and whether there is a scrollbar to reach it) only
 * exist after layout.
 */
const PROBE = `
<script>
(function () {
  var report = function () {
    var row = document.querySelector('.o-made-with');
    var doc = document.documentElement;
    var out = { found: !!row };
    if (row) {
      var r = row.getBoundingClientRect();
      out.top = Math.round(r.top);
      out.bottom = Math.round(r.bottom);
      out.height = Math.round(r.height);
      out.viewportH = window.innerHeight;
      out.visiblePx = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
      out.scrollbarPx = window.innerWidth - doc.clientWidth;
      out.maxScrollPx = Math.max(0, doc.scrollHeight - doc.clientHeight);
    }
    document.body.setAttribute('data-orbit-probe', JSON.stringify(out));
  };
  if (document.readyState === 'complete') report();
  else window.addEventListener('load', report);
})();
</script>`;

let tmpDir = null;

/**
 * A populated document per widget.
 *
 * The suite measured widget.render(null) only — the EMPTY-STATE document,
 * for all thirteen widgets. That is not the case that ships: the artifact
 * path bakes real data into the same shell, and content is exactly what
 * pushes a footer row past the fold. "The row is visible in an empty
 * document" and "the row is visible in a document with content in it" are
 * different claims, and only the second one is the product.
 *
 * Every widget needs an entry. A missing one is the coverage gap this
 * comment exists to close, and the test below fails on it rather than
 * quietly measuring nothing.
 */
const POPULATED = {
  // The three widgets the review loop added last. Fixtures are shaped
  // from what each widget actually reads, not from the tool's schema —
  // a payload that satisfies the schema and renders an empty card is
  // exactly the case this suite exists to stop.
  "ui://orbit/flow-audit.html": {
    "status": "ok",
    "flow_id": "WJ3kPq",
    "name": "Welcome \u2014 free signup",
    "trigger_type": "list_join",
    "window": "last 30 days",
    "unreadable": false,
    "actions_truncated": false,
    "note": null,
    "steps": [
      { "action_id": "a1", "action_type": "email", "measured": true, "status": "ok", "is_branch": false,
        "delay_seconds": 0, "delay_human": "immediately",
        "stats": { "open_rate_percent": 61.4, "click_rate_percent": 12.9 },
        "drop_off_to_next_percent": 8.2, "messages": [], "message": null },
      { "action_id": "a2", "action_type": "time_delay", "measured": false, "status": "not_measured", "is_branch": false,
        "delay_seconds": 172800, "delay_human": "2 days", "stats": null,
        "drop_off_to_next_percent": null, "messages": [],
        "message": "A delay carries no engagement of its own." },
      { "action_id": "a3", "action_type": "email", "measured": true, "status": "warn", "is_branch": false,
        "delay_seconds": 0, "delay_human": "immediately",
        "stats": { "open_rate_percent": 38.1, "click_rate_percent": 3.4 },
        "drop_off_to_next_percent": 41.7, "messages": [],
        "message": "Largest single drop in the flow." }
    ]
  },
  "ui://orbit/revenue-attribution.html": {
    "status": "ok",
    "window": "last 90 days",
    "total_revenue": 481200,
    "attributed_revenue": 138940,
    "programmes_measured": 4,
    "programmes_unreadable": 0,
    "programme_list_capped": false,
    "message": null,
    "programmes": [
      { "name": "Abandoned cart", "attributed_revenue": 61200, "attributed_share_percent": 44.0, "over_attributed": false, "verdict": "ok" },
      { "name": "Welcome", "attributed_revenue": 38400, "attributed_share_percent": 27.6, "over_attributed": false, "verdict": "ok" },
      { "name": "Win-back", "attributed_revenue": 24100, "attributed_share_percent": 17.3, "over_attributed": true, "verdict": "warn" },
      { "name": "Post-purchase", "attributed_revenue": 15240, "attributed_share_percent": 11.0, "over_attributed": false, "verdict": "ok" }
    ],
    "issues": [
      { "severity": "warn", "message": "Win-back overlaps the sitewide promo under last-touch, so its share is credited twice." }
    ]
  },
  "ui://orbit/preheader-clip.html": {
    "status": "ok",
    "subject": "Your April invoice is ready",
    "preheader": "Download the PDF, or update the card we have on file before the next run.",
    "length": 73,
    "score": 72,
    "tier": "warn",
    "hits": 2,
    "client_previews": [
      { "client": "Gmail (iOS)", "name": "Gmail (iOS)", "type": "mobile", "limit": 55,
        "preview": "Download the PDF, or update the card we have on file be", "truncated": true },
      { "client": "Apple Mail (iOS)", "name": "Apple Mail (iOS)", "type": "mobile", "limit": 90,
        "preview": "Download the PDF, or update the card we have on file before the next run.", "truncated": false },
      { "client": "Outlook (desktop)", "name": "Outlook (desktop)", "type": "desktop", "limit": 60,
        "preview": "Download the PDF, or update the card we have on fil", "truncated": true }
    ],
    "issues": [
      { "severity": "warn", "message": "Clipped in Gmail iOS at 55 characters \u2014 the ask lands outside the preview." }
    ]
  },
  "ui://orbit/dark-pairs.html": {
    "status": "ok",
    "verdict": "fail",
    "not_measured": false,
    "reason": null,
    "has_dark_mode_media_query": false,
    "has_apple_dark_styles": false,
    "invert_risk_count": 1,
    "already_dark_count": 1,
    "colour_pairs_measured": 3,
    "pairs_not_drawable": 0,
    "pairs": [
      {
        "tag": "h1",
        "kind": "invert_risk",
        "message": "Light-on-light pair will invert to dark-on-dark in Apple Mail / Outlook mobile dark mode. Add a dark-mode override.",
        "warning": false,
        "fg": "#f2f2f2",
        "bg": "#ffffff",
        "ratio": 1.12,
        "inverted_fg": "#0d0d0d",
        "inverted_bg": "#000000",
        "inverted_ratio": 1.08
      },
      {
        "tag": "p",
        "kind": "already_dark",
        "message": "Dark-on-dark pair has contrast 1.38:1 — below WCAG AA (4.5:1).",
        "warning": false,
        "fg": "#333333",
        "bg": "#1a1a1a",
        "ratio": 1.38,
        "inverted_fg": "#cccccc",
        "inverted_bg": "#e5e5e5",
        "inverted_ratio": 1.27
      },
      {
        "tag": "span",
        "kind": "bare_white_text",
        "message": "White text with no discoverable background colour — email clients with partial-invert can land white-on-white.",
        "warning": true,
        "fg": "#ffffff",
        "bg": null,
        "ratio": null,
        "inverted_fg": null,
        "inverted_bg": null,
        "inverted_ratio": null
      }
    ],
    "recommendation": "Add a @media (prefers-color-scheme: dark) block to override key text/bg pairs, and include color-scheme: light dark in <head> to opt into native dark-mode handling."
  },
  "ui://orbit/esp-matrix.html": {
    "platforms": [
      {
        "platform": "customerio",
        "display_name": "Customer.io",
        "auth": "App API Bearer token",
        "base_url": "https://api.customer.io",
        "templating": "Liquid",
        "operations": [
          {
            "operation": "checkAuth",
            "label": "auth-check",
            "support": "partial",
            "endpoint": "GET /v1/campaigns",
            "doc_url": "https://docs.customer.io/",
            "notes": "No dedicated ping; the cheapest read doubles as the probe."
          },
          {
            "operation": "listTemplates",
            "label": "list templates",
            "support": "unsupported",
            "endpoint": null,
            "doc_url": "https://docs.customer.io/",
            "reason": "No public listing for reusable templates — content is authored in-app.",
            "nearest_alternative": "Keep the canonical HTML in your own brain repo and send it inline."
          },
          {
            "operation": "getTemplate",
            "label": "get template",
            "support": "unsupported",
            "endpoint": null,
            "doc_url": "https://docs.customer.io/",
            "reason": "No public CRUD for reusable templates/layouts.",
            "nearest_alternative": "Read the canonical copy from your own repo."
          },
          {
            "operation": "pushTemplate",
            "label": "create/update template",
            "support": "unsupported",
            "endpoint": null,
            "doc_url": "https://docs.customer.io/journeys/send/transactional/api-examples/",
            "reason": "No public CRUD for reusable templates/layouts.",
            "nearest_alternative": "Send via POST /v1/send/email with full inline body (to/from/subject/body supplied per-request)."
          },
          {
            "operation": "listCampaigns",
            "label": "campaigns/flows read",
            "support": "native",
            "endpoint": "GET /v1/campaigns",
            "doc_url": "https://docs.customer.io/"
          },
          {
            "operation": "listSegments",
            "label": "segments/lists read",
            "support": "native",
            "endpoint": "GET /v1/segments",
            "doc_url": "https://docs.customer.io/"
          },
          {
            "operation": "getPerformance",
            "label": "performance metrics",
            "support": "native",
            "endpoint": "GET /v1/campaigns/{id}/metrics",
            "doc_url": "https://docs.customer.io/"
          },
          {
            "operation": "sendTest",
            "label": "test send",
            "support": "native",
            "endpoint": "POST /v1/send/email",
            "doc_url": "https://docs.customer.io/"
          }
        ]
      }
    ]
  },
  "ui://orbit/auth-panel.html": {
    status: "ok",
    domain: "acme-tools.com",
    overall: "fail",
    spf: {
      verdict: "fail",
      records: ["v=spf1 include:_spf.google.com include:sendgrid.net include:spf.braze.com ~all"],
      lookup_count: 13,
      issues: ["SPF record uses 13 DNS lookups (RFC 7208 limit: 10). Mail will be treated as permerror."],
      recommendation: "Reduce include:/redirect= chains under 10 lookups."
    },
    dmarc: {
      verdict: "warn",
      records: ["v=DMARC1; p=none; rua=mailto:dmarc@acme-tools.com"],
      tags: { v: "DMARC1", p: "none", rua: "mailto:dmarc@acme-tools.com" },
      issues: ["Policy is p=none (monitor-only)."],
      recommendation: "Move from p=none to p=quarantine."
    },
    dkim: {
      verdict: "warn",
      selectors_found: 2,
      records: [
        { selector: "braze1", host: "braze1._domainkey.acme-tools.com", record: "v=DKIM1; k=rsa; p=MIGfMA0GCS", issues: [] },
        { selector: "selector2", host: "selector2._domainkey.acme-tools.com", record: "v=DKIM1; k=rsa; p=", issues: ["Selector published with empty public key (p=)."] }
      ],
      issues: ["selector2: Selector published with empty public key (p=)."],
      recommendation: "Re-generate the DKIM key for the selectors with empty p=."
    },
    message: "Auth needs work."
  },
  "ui://orbit/sms-segments.html": {
    status: "ok",
    region: "US",
    encoding: "GSM-7",
    effective_length: 205,
    segment_count: 2,
    segment_cap: 153,
    single_segment_limit: 160,
    gsm_extension_chars: 2,
    compliance_footer: "Acme Plumbing: Reply STOP to opt out, HELP for info. Msg&data rates may apply.",
    final_message:
      "Hey Sam, your winter service is due. Book online and we'll knock 15% off the call-out fee: acme.co/book {rate} " +
      "Acme Plumbing: Reply STOP to opt out, HELP for info. Msg&data rates may apply.",
    issues: [],
    recommendation: "Multi-segment send; acceptable but costs more than single-segment."
  },
  "ui://orbit/push-matrix.html": {
    title: "Your Tuesday job list is ready to review before the crew rolls out",
    body: "Three jobs are unassigned and one has no parts allocated. Tap to sort it before 7am so nobody turns up to a site without a van full of the right kit.",
    tier: "truncates-somewhere",
    platforms: {
      ios: {
        titleChars: 65, titleLimit: 70, titleTruncates: false,
        bodyChars: 149, bodyLimit: 178, bodyTruncates: false,
        preview: {
          title: "Your Tuesday job list is ready to review before the crew rolls out",
          body: "Three jobs are unassigned and one has no parts allocated. Tap to sort it before 7am so nobody turns up to a site without a van full of the right kit."
        }
      },
      android: {
        titleChars: 65, titleLimit: 65, titleTruncates: false,
        bodyChars: 149, bodyLimit: 100, bodyTruncates: true,
        preview: {
          title: "Your Tuesday job list is ready to review before the crew rolls out",
          body: "Three jobs are unassigned and one has no parts allocated. Tap to sort it before 7am so nobody turns\u2026"
        }
      },
      web: {
        titleChars: 65, titleLimit: 50, titleTruncates: true,
        bodyChars: 149, bodyLimit: 120, bodyTruncates: true,
        preview: {
          title: "Your Tuesday job list is ready to review before t\u2026",
          body: "Three jobs are unassigned and one has no parts allocated. Tap to sort it before 7am so nobody turns up to a site withou\u2026"
        }
      }
    }
  },
  "ui://orbit/review-gallery.html": {
    programme: "Winback 2026",
    items: [
      { id: "e1", name: "Winback 1", group: "Email", channel: "email", html: "<html><body><h1>We saved your spot</h1><p>Pick up where you left off.</p></body></html>" },
      { id: "e2", name: "Winback 2", group: "Email", channel: "email", html: "<html><body><h1>Last call</h1><p>Your workspace closes on Friday.</p></body></html>" },
      { id: "e3", name: "Winback 3", group: "Email", channel: "email", html: "<html><body><p>One more reason to come back.</p></body></html>" },
      {
        id: "p1",
        name: "Push nudge",
        group: "Push",
        channel: "push",
        push: {
          app: "Example",
          title: "Your March invoice is ready and three payments failed overnight — review before Friday",
          body: "x".repeat(148)
        }
      },
      { id: "p2", name: "Push reminder", group: "Push", channel: "push", push: { app: "Example", title: "Invoice ready", body: "Two payments failed overnight." } }
    ]
  },
  "ui://orbit/render-gate.html": {
    label: "winback-1",
    html: "<html><body style=\"font-family:sans-serif\"><h1>We saved your spot</h1><p>Pick up where you left off.</p><a href=\"#\">Open the workspace</a></body></html>"
  },
  "ui://orbit/qa-report.html": {
    verdict: {
      status: "warn",
      checks: [
        { id: "alt_text", label: "Image alt text", state: "fail", detail: "2 images carry no alt attribute." },
        { id: "contrast", label: "Text contrast", state: "pass", detail: "Lowest ratio 5.8:1." },
        { id: "size", label: "Gmail clipping", state: "warn", detail: "94 KB of a 102 KB budget." }
      ]
    }
  },
  "ui://orbit/audit-report.html": {
    status: "partial",
    audit: {
      workspace: "example",
      sections: [
        { title: "Campaigns", findings: [{ severity: "high", message: "3 campaigns have no conversion event." }] },
        { title: "Segments", findings: [{ severity: "low", message: "12 segments unused for 90 days." }] }
      ]
    }
  },
  "ui://orbit/lifecycle-flow.html": {
    spec: {
      title: "Onboarding",
      steps: [
        { id: "s1", type: "entry", label: "Signed up" },
        { id: "s2", type: "action", label: "Welcome email" },
        { id: "s3", type: "decision", label: "Activated?" },
        { id: "s4", type: "action", label: "Setup nudge" }
      ],
      edges: [
        { from: "s1", to: "s2" },
        { from: "s2", to: "s3" },
        { from: "s3", to: "s4", label: "no" }
      ]
    }
  },
  "ui://orbit/client-matrix.html": {
    verdict: "warn",
    summary: { classes: 4, withheld: 1 },
    style_blocks: 3,
    purity_findings: [{ severity: "warn", message: "One <style> block carries a media query Gmail drops." }],
    variants: [
      { class: "full", label: "As authored", html: "<html><body><h1>We saved your spot</h1></body></html>" },
      { class: "nocss", label: "No <style>", html: "<html><body><h1>We saved your spot</h1></body></html>" },
      { class: "gmailish", label: "Gmail-like", html: "<html><body><h1>We saved your spot</h1></body></html>" },
      { class: "imgoff", label: "Images off", html_withheld: true }
    ]
  },
  "ui://orbit/cohort-retention.html": {
    period_days: 30,
    cohorts: [
      {
        cohort: "2026-05-01",
        size: 420,
        periods: [
          { period: 0, active: 420, retention_pct: 100, revenue: 9800, complete: true, window_elapsed_pct: 100 },
          { period: 1, active: 260, retention_pct: 61.9, revenue: 5200, complete: true, window_elapsed_pct: 100 },
          { period: 2, active: 190, retention_pct: 45.2, revenue: 3900, complete: true, window_elapsed_pct: 100 }
        ]
      },
      {
        cohort: "2026-05-31",
        size: 310,
        periods: [
          { period: 0, active: 310, retention_pct: 100, revenue: 7100, complete: true, window_elapsed_pct: 100 },
          { period: 1, active: 205, retention_pct: 66.1, revenue: 4300, complete: false, window_elapsed_pct: 40 }
        ]
      }
    ],
    aggregate_curve: [
      { period: 0, retention_pct: 100, active_users: 730, exposure: 730, exposure_incomplete: 0, revenue: 16900 },
      { period: 1, retention_pct: 61.9, active_users: 260, exposure: 420, exposure_incomplete: 310, revenue: 5200 },
      { period: 2, retention_pct: 45.2, active_users: 190, exposure: 420, exposure_incomplete: 0, revenue: 3900 }
    ]
  },
  "ui://orbit/design-system.html": {
    slug: "example-brand",
    template_id: "tpl_example",
    brand_tokens: { colors: { brand: "#2f5bd4", ink: "#14161f" }, fonts: { body: "Inter, Arial, sans-serif" } },
    modules: [
      { name: "hero", role: "hero", html: "<td>Hero</td>" },
      { name: "body-copy", role: "body", html: "<td>Body</td>" },
      { name: "cta-button", role: "cta", html: "<td>CTA</td>" },
      { name: "footer", role: "footer", html: "<td>Footer</td>" }
    ],
    image_inventory: [{ src: "https://example.invalid/hero.png", alt: "Hero", bytes: 42000 }],
    liquid_variables: [{ token: "{{first_name}}", fallback: "there" }]
  },
  "ui://orbit/send-calendar.html": {
    window: { from: "2026-03-09", to: "2026-03-15" },
    policy: { quiet_hours: { start: 21, end: 8 }, timezone: "UTC" },
    summary: { scheduled: 11, placed: 10 },
    calendar: [
      { date: "2026-03-10", sends: [{ send: "march-sale", hour: 9, kind: "point" }] },
      { date: "2026-03-12", sends: [{ send: "invoice-digest", hour: 22, kind: "point" }] }
    ],
    findings: [{ check: "quiet_hours", send: "invoice-digest", severity: "high", message: "Scheduled inside quiet hours." }],
    caveats: ["One broadcast carried no parseable send time and is not on the grid."]
  },
  "ui://orbit/ab-readout.html": {
    test_name: "Subject line — specific vs generic",
    hypothesis: "Naming the invoice month lifts opens.",
    primary_metric: "conversion rate",
    verdict: "winner",
    control: { visitors: 10000, conversions: 1000 },
    variant: { visitors: 10000, conversions: 1200 },
    stats: {
      control_rate_pct: 10,
      variant_rate_pct: 12,
      lift_pct: 20,
      ci_low_pct: 1.13,
      ci_high_pct: 2.87,
      z_score: 4.51,
      p_value: 0,
      confidence_level_pct: 95,
      ci_note: "CI is on the absolute-rate difference (percentage points), not relative lift."
    },
    recommendation: "Ship the variant. 20% lift is statistically significant at 95% confidence (CI: 1.13% to 2.87%)."
  },
  "ui://orbit/rfm-map.html": {
    user_count: 4820,
    total_revenue: 918400,
    reference_date: "2026-08-01T00:00:00.000Z",
    input_rows: 4900,
    scored_rows: 4820,
    skipped: [{ reason: "last_order_date missing or empty", count: 80 }],
    segments: [
      { segment: "Champions", user_count: 610, revenue: 402000, avg_recency_days: 9, avg_frequency: 11.2, avg_monetary: 659, revenue_share_pct: 43.8, user_share_pct: 12.7, recommended_action: "High-touch loyalty." },
      { segment: "Loyal Customers", user_count: 1180, revenue: 291000, avg_recency_days: 28, avg_frequency: 5.4, avg_monetary: 247, revenue_share_pct: 31.7, user_share_pct: 24.5, recommended_action: "Upsell / cross-sell." },
      { segment: "At Risk", user_count: 940, revenue: 142000, avg_recency_days: 121, avg_frequency: 3.1, avg_monetary: 151, revenue_share_pct: 15.5, user_share_pct: 19.5, recommended_action: "Win-back sequences." },
      { segment: "Hibernating", user_count: 2090, revenue: 83400, avg_recency_days: 260, avg_frequency: 1.4, avg_monetary: 40, revenue_share_pct: 9.1, user_share_pct: 43.4, recommended_action: "Final win-back, then sunset." }
    ]
  },
  "ui://orbit/list-forecast.html": {
    inputs: { current_list_size: 50000, monthly_acquisition: 4000, monthly_churn_pct: 3, acquisition_growth_pct: 2, months: 12 },
    trajectory: Array.from({ length: 13 }, (_, m) => ({
      month: m,
      list_size: Math.round(50000 * Math.pow(1.005, m)),
      acquisition: m === 0 ? 0 : 4000,
      churn: m === 0 ? 0 : 1500,
      net: m === 0 ? 0 : 2500
    })),
    end_state: { list_size: 53100, delta_pct: 6.2, growing: true },
    steady_state_acquisition_needed: 1500,
    halved_by_month: null,
    break_even_month: null
  },
  "ui://orbit/state-matrix.html": {
    verdict: "warn",
    states_rendered: 64,
    summary: { branches: 6, unbound: 1 },
    axes: [
      { name: "first_name", values: ["set", "unset"] },
      { name: "plan", values: ["free", "paid"] }
    ],
    arms: [
      { id: "a1", label: "free · no name", rendered: true },
      { id: "a2", label: "paid · named", rendered: true }
    ],
    findings: [{ severity: "high", invariant: "B", message: "Unmodelled output token: {{canvas.name}}" }]
  },
  "ui://orbit/postmaster-trend.html": {
    overall_verdict: "fail",
    snapshot_source: "newest_dated_row",
    thresholds: { spam_rate_warn_pct: 0.1, spam_rate_fail_pct: 0.3 },
    parsed_snapshot: { spam_rate_pct: 0.41, domain_reputation: "bad", ip_reputation: "low" },
    series: {
      dated: true,
      row_count: 6,
      first_date: "2026-08-01",
      last_date: "2026-08-06",
      graded_on: "2026-08-06 — the newest dated row of 6.",
      points: [
        { date: "2026-08-01", spam_rate_pct: 0.04, domain_reputation: "high", ip_reputation: "high" },
        { date: "2026-08-02", spam_rate_pct: 0.06, domain_reputation: "high", ip_reputation: "high" },
        { date: "2026-08-03", spam_rate_pct: null, domain_reputation: "high", ip_reputation: "high" },
        { date: "2026-08-04", spam_rate_pct: 0.19, domain_reputation: "medium", ip_reputation: "high" },
        { date: "2026-08-05", spam_rate_pct: 0.27, domain_reputation: "low", ip_reputation: "medium" },
        { date: "2026-08-06", spam_rate_pct: 0.41, domain_reputation: "bad", ip_reputation: "low" }
      ]
    },
    message: "2 blocking issues, 1 warning across 4 signal(s).",
    findings: [
      { severity: "fail", metric: "spam_rate", value: 0.41, threshold: 0.3, message: "Spam rate 0.41% — above Gmail's 0.3% red zone.", action: "Stop sending to cold segments immediately." },
      { severity: "fail", metric: "domain_reputation", value: "bad", message: "Domain reputation is bad.", action: "Run the reputation-recovery protocol." },
      { severity: "warn", metric: "delivery_errors", value: 2.1, message: "Delivery errors 2.1%.", action: "Slow the volume ramp." }
    ]
  },
  "ui://orbit/inbox-preview.html": {
    subject: "\u26a1 LAST CHANCE: dont miss your FREE gift, act now!!",
    preheader: "Limited time only — your exclusive discount expires at midnight tonight.",
    len: 50,
    score: 0,
    tier: "spam",
    emojiCount: 1,
    exclamations: 2,
    questions: 0,
    allCapsWords: ["LAST", "CHANCE:", "FREE"],
    triggers: ["free", "act now", "limited time", "expires", "discount", "last chance"],
    personalisation: false,
    issues: [
      { severity: "high", label: '1 probable typo: "dont"' },
      { severity: "high", label: 'Content-free phrase in subject: "don\'t miss"' },
      { severity: "high", label: "Shouting pattern" },
      { severity: "medium", label: "2 exclamation marks" }
    ]
  }
};

/** Render a widget's ARTIFACT document, load it in Chrome, return the probe. */
async function measure(widget, data = null) {
  // render(null) is exactly the document the static ui:// resource carries,
  // and the artifact path bakes data into the same shell. Standalone is the
  // default: there is no host bridge in a file:// load, so orbitEmbedded is
  // false and the signature applies — the real shared-artifact case.
  const html = widget.render(data).replace("</body>", `${PROBE}</body>`);
  const file = path.join(tmpDir, `${data ? "populated-" : "empty-"}${path.basename(widget.uri)}`);
  fs.writeFileSync(file, html, "utf8");

  const { stdout: dom } = await execFileAsync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      "--virtual-time-budget=3000",
      "--dump-dom",
      `file://${file}`
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: LAUNCH_TIMEOUT_MS }
  );

  const match = /data-orbit-probe="([^"]*)"/.exec(dom);
  assert.ok(match, `the page never reported a measurement for ${widget.uri} — it may not have loaded`);
  const decoded = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return JSON.parse(decoded);
}

describe("Standalone artifacts show the row that carries the product name", { concurrency: LAUNCH_CONCURRENCY, skip: CHROME ? false : "no Chrome found — set CHROME_PATH to run the rect assertions" }, () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-signature-"));
  });

  after(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("every widget has a populated fixture — an empty document is not the case that ships", () => {
    const missing = ORBIT_WIDGETS.map((w) => w.uri).filter((uri) => !POPULATED[uri]);
    assert.deepEqual(missing, [], "these widgets are only ever measured empty");
  });

  for (const widget of ORBIT_WIDGETS) {
    for (const state of ["empty", "populated"]) {
    test(`${widget.uri} (${state}) — the signature row is inside the viewport`, async () => {
      const probe = await measure(widget, state === "populated" ? POPULATED[widget.uri] : null);
      assert.ok(probe.found, `no .o-made-with element in ${widget.uri}`);

      // The assertion the finding turns on: WHERE it is, not THAT it is.
      assert.ok(
        probe.top < probe.viewportH,
        `signature row starts at ${probe.top}px in a ${probe.viewportH}px viewport — below the fold`
      );
      assert.equal(
        probe.bottom <= probe.viewportH,
        true,
        `signature row ends at ${probe.bottom}px in a ${probe.viewportH}px viewport — clipped`
      );
      // 1px of tolerance for subpixel layout, not one line of it.
      assert.ok(
        probe.visiblePx >= probe.height - 1,
        `only ${probe.visiblePx} of ${probe.height}px of the signature row is on screen`
      );

      // And it must not depend on the viewer scrolling: these documents set
      // body { overflow: hidden }, so there is no scrollbar to reach it with.
      if (probe.scrollbarPx === 0) {
        assert.equal(
          probe.maxScrollPx,
          0,
          `${probe.maxScrollPx}px of content sits below an unscrollable fold — nobody can reach it`
        );
      }
    });
    }
  }
});

/**
 * The push preview, measured rather than grepped.
 *
 * renderPush() carried `const IOS_BODY = 110` — a number in no limits
 * table in this repo — clipped only the BODY against it, and never
 * clipped or warned on the title. So a 91-character title that truncates
 * on iOS, Android and web rendered in full across two bold lines with no
 * warning, while a 148-character body that FITS on iOS got a red
 * "Clipped on iOS" and the two platforms it does clip on went unnamed.
 * The tool's description promises it "renders each one at the size it
 * actually ships at".
 *
 * A querySelector assertion would not have caught it — the elements were
 * always there. This asks the engine where the text ends.
 */
const PUSH_PROBE = `
<script>
(function () {
  var report = function () {
    var t = document.querySelector('.notif-title');
    var clip = document.querySelector('.notif-clip');
    var out = { found: !!t };
    if (t) {
      var cs = getComputedStyle(t);
      out.scrollWidth = t.scrollWidth;
      out.clientWidth = t.clientWidth;
      out.overflows = t.scrollWidth > t.clientWidth + 1;
      out.whiteSpace = cs.whiteSpace;
      out.textOverflow = cs.textOverflow;
      out.lineCount = Math.round(t.getBoundingClientRect().height / parseFloat(cs.lineHeight));
    }
    out.clipNote = clip ? clip.textContent : null;
    document.body.setAttribute('data-orbit-push', JSON.stringify(out));
  };
  if (document.readyState === 'complete') report();
  else window.addEventListener('load', report);
})();
</script>`;

let pushDir = null;

let pushSeq = 0;

async function measurePush(data) {
  const widget = ORBIT_WIDGETS.find((w) => w.uri === "ui://orbit/review-gallery.html");
  const html = widget.render(data).replace("</body>", `${PUSH_PROBE}</body>`);
  // A per-call filename, not one shared path: these three run concurrently
  // now, and a single push-preview.html would have them overwriting each
  // other's document between write and load.
  const file = path.join(pushDir, `push-preview-${pushSeq++}.html`);
  fs.writeFileSync(file, html, "utf8");
  const { stdout: dom } = await execFileAsync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      "--virtual-time-budget=3000",
      "--dump-dom",
      `file://${file}`
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: LAUNCH_TIMEOUT_MS }
  );
  const match = /data-orbit-push="([^"]*)"/.exec(dom);
  assert.ok(match, "the push preview never reported a measurement");
  return JSON.parse(
    match[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  );
}

const LONG_TITLE =
  "Your March invoice is ready and three payments failed overnight — review them before Friday";

describe("Push preview draws the cut", { concurrency: LAUNCH_CONCURRENCY, skip: CHROME ? false : "no Chrome found — set CHROME_PATH to run the rect assertions" }, () => {
  before(() => {
    pushDir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-push-"));
  });

  after(() => {
    if (pushDir) fs.rmSync(pushDir, { recursive: true, force: true });
  });

  test("an over-length title is clipped in the frame, not set across two lines", async () => {
    const probe = await measurePush({
      programme: "Invoices",
      items: [
        {
          id: "p1",
          name: "Push nudge",
          channel: "push",
          push: { app: "Example", title: LONG_TITLE, body: "x".repeat(148) }
        }
      ]
    });
    assert.ok(probe.found, "no .notif-title rendered");
    assert.equal(probe.whiteSpace, "nowrap", "the title still wraps, so the cut is invisible");
    assert.equal(probe.lineCount, 1, `the title set across ${probe.lineCount} lines`);
    assert.ok(
      probe.clientWidth <= probe.scrollWidth,
      "measurement did not run against a laid-out element"
    );
  });

  test("the clip note names every platform that cuts, and only the ones that do", async () => {
    // 91-char title cuts on all three. 148-char body cuts on Android (100)
    // and web (120), and FITS on iOS (178) — which is precisely backwards
    // from the single "Clipped on iOS" line this replaced.
    const probe = await measurePush({
      programme: "Invoices",
      items: [
        {
          id: "p1",
          name: "Push nudge",
          channel: "push",
          push: { app: "Example", title: LONG_TITLE, body: "x".repeat(148) }
        }
      ]
    });
    assert.ok(probe.clipNote, "no clip note rendered for copy that cuts on every platform");
    assert.match(probe.clipNote, /Android/);
    assert.match(probe.clipNote, /Web/);
    assert.match(probe.clipNote, /iOS/);
    assert.match(probe.clipNote, /body 100/, "Android's body limit is not named");
    assert.match(probe.clipNote, /body 120/, "Web's body limit is not named");
    assert.doesNotMatch(probe.clipNote, /iOS [^·]*body/, "iOS is named as clipping a body that fits");
  });

  test("copy that fits everywhere shows no clip note at all", async () => {
    const probe = await measurePush({
      programme: "Invoices",
      items: [
        {
          id: "p1",
          name: "Push nudge",
          channel: "push",
          push: { app: "Example", title: "Invoice ready", body: "Two payments failed overnight." }
        }
      ]
    });
    assert.equal(probe.clipNote, null, `a false clip warning: ${probe.clipNote}`);
    assert.equal(probe.overflows, false, "short title reported as overflowing");
  });
});
