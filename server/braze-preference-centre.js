/**
 * Braze preference-centre compliance audit.
 *
 * Orbit already owns two linters for this surface — the one-click /
 * bulk-sender markup lint behind `orbit_audit_unsubscribe_page`, and the
 * consent lint behind `orbit_gdpr_consent_audit`, which already accepts raw
 * HTML with kind="preference_centre". Neither had any way to reach a Braze
 * preference centre. The user had to find the URL by hand and paste it.
 *
 * They do not need to. `/preference_center/v1/{id}` returns
 * `preference_center_page_html` directly, so the whole audit runs on markup
 * Braze hands over: no live fetch, no test user, no subscriber's real page
 * poked in production.
 *
 * Two things this tool must SURFACE rather than swallow:
 *   1. Braze documents the per-user URL generator as working only for NEW
 *      (API or drag-and-drop) preference centres. A legacy centre gets
 *      `live_page_leg: "unavailable"`, never a pass — the same way
 *      `orbit_esp_read` reports a capability it does not have.
 *   2. A centre whose `state` is not "active" is LABELLED, not audited
 *      silently. Linting a draft and reporting compliance is a lie with
 *      good intentions.
 *
 * Read-only. HTTP goes through the shared `brazeGet`; the optional live-page
 * leg reuses `auditUnsubscribe`, which carries the SSRF guard.
 */

import { brazeGet, validateBrazeSetup } from "./braze-api.js";
import { classifyBrazeError, authFailedResponse } from "./braze-read.js";
import { auditUnsubscribe, lintUnsubscribeMarkup } from "./content-extensions.js";
import { auditGdprConsent } from "./lifecycle-helpers.js";

/**
 * List every preference centre and audit each one's markup.
 *
 * @param {object} args
 * @param {object} args.config
 * @param {string} [args.preference_center_id]  Audit just this one.
 * @param {string} [args.test_external_id]      When supplied, the tool asks
 *   Braze for that user's preference-centre URL and runs the LIVE page leg
 *   against it. Omit it and only the markup leg runs.
 * @param {number} [args.max_centres=20]
 */
export async function auditPreferenceCentre({
  config,
  preference_center_id: centreId,
  test_external_id: testExternalId,
  max_centres: maxCentres = 20
} = {}) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  // ── Step 1: which centres ────────────────────────────────────────
  let centres;
  if (centreId) {
    centres = [{ preference_center_api_id: centreId, name: null }];
  } else {
    try {
      const response = await brazeGet({ config, endpoint: "/preference_center/v1/list" });
      centres = Array.isArray(response?.preference_centers) ? response.preference_centers : [];
    } catch (err) {
      const classified = classifyBrazeError(err, "/preference_center/v1/list");
      if (classified.authFailed) return authFailedResponse(classified);
      return {
        status: "unavailable",
        reason: classified.error,
        message:
          "Could not list preference centres, so none were audited. The key " +
          "needs the `preference_center.list` permission. Nothing below was checked."
      };
    }
  }

  if (centres.length === 0) {
    return {
      status: "ok",
      verdict: "none_found",
      centres: [],
      message:
        "This workspace has no preference centres. That is an empty read, " +
        "not a compliance pass — if you expected one, check the API key's " +
        "workspace scope before concluding anything."
    };
  }

  // ── Step 2: audit each ───────────────────────────────────────────
  const rows = [];
  for (const centre of centres.slice(0, maxCentres)) {
    const row = await auditOneCentre({ config, centre, testExternalId });
    if (row.authFailed) return authFailedResponse(row);
    rows.push(row);
  }

  const failing = rows.filter((r) => r.verdict === "fail");
  const skipped = rows.filter((r) => r.verdict === "not_audited");

  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    summary: {
      audited: rows.length - skipped.length,
      not_audited: skipped.length,
      failing: failing.length,
      truncated: centres.length > maxCentres,
      headline:
        failing.length > 0
          ? `${failing.length} preference centre(s) would fail Gmail/Yahoo bulk-sender or GDPR consent checks.`
          : skipped.length > 0
            ? `No failures among the ${rows.length - skipped.length} audited, but ${skipped.length} were not audited — see each row's reason.`
            : "Every preference centre clears the markup checks this tool can run."
    },
    centres: rows
  };
}

async function auditOneCentre({ config, centre, testExternalId }) {
  const id = centre.preference_center_api_id ?? centre.id;
  const row = {
    preference_center_api_id: id,
    name: centre.name ?? null,
    state: null,
    verdict: "not_audited",
    live_page_leg: "not_requested",
    notes: []
  };

  let details;
  try {
    details = await brazeGet({
      config,
      endpoint: `/preference_center/v1/${encodeURIComponent(id)}`
    });
  } catch (err) {
    const classified = classifyBrazeError(err, "/preference_center/v1/{id}");
    if (classified.authFailed) return { ...classified, authFailed: true };
    row.notes.push(
      `Could not read details: ${classified.error}. The key needs the ` +
        "`preference_center.get` permission. NOT audited — this is not a pass."
    );
    return row;
  }

  row.name = row.name ?? details.name ?? null;
  row.state = details.state ?? null;
  row.options = details.preference_center_options ?? null;

  // A centre that is not live is labelled, not quietly linted. Reporting
  // "compliant" about a draft nobody can reach is worse than saying nothing.
  if (row.state && String(row.state).toLowerCase() !== "active") {
    row.notes.push(
      `state is "${row.state}", not "active". Markup below is linted for ` +
        "information, but this is not the page your subscribers see."
    );
  }

  const html = details.preference_center_page_html;
  if (typeof html !== "string" || html.trim().length === 0) {
    row.notes.push(
      "Braze returned no preference_center_page_html for this centre, so " +
        "there was nothing to lint. NOT audited."
    );
    return row;
  }

  // ── The two existing linters, composed, not reimplemented ────────
  const markup = lintUnsubscribeMarkup(html);
  const consent = auditGdprConsent({ html, kind: "preference_centre" });

  row.bulk_sender = {
    verdict: markup.verdict,
    password_required: markup.password_required,
    checkbox_count: markup.checkbox_count,
    issues: markup.issues,
    passes: markup.passes
  };
  row.consent = {
    verdict: consent.verdict ?? null,
    findings: consent.findings ?? [],
    passes: consent.passes ?? []
  };

  // The confirmation page is part of the journey and is where a
  // right-to-withdraw statement most often goes missing.
  if (typeof details.confirmation_page_html === "string" && details.confirmation_page_html.trim()) {
    const confirmation = auditGdprConsent({
      html: details.confirmation_page_html,
      kind: "preference_centre"
    });
    row.confirmation_page = {
      verdict: confirmation.verdict ?? null,
      findings: confirmation.findings ?? []
    };
  }

  // ── Optional live-page leg ───────────────────────────────────────
  if (testExternalId) {
    row.live_page_leg = await runLivePageLeg({ config, id, testExternalId, row });
  }

  row.verdict = worstVerdict([
    markup.verdict,
    row.consent.verdict,
    row.confirmation_page?.verdict
  ]);
  return row;
}

/**
 * Ask Braze for the per-user preference-centre URL, then run the existing
 * live-page audit against it.
 *
 * Braze documents this endpoint as working only for preference centres
 * created via the API or the drag-and-drop editor. A legacy centre 404s, and
 * that must read as "unavailable", never as a pass — a compliance tool that
 * turns a missing capability into a green tick is the worst version of this
 * tool it is possible to ship.
 */
async function runLivePageLeg({ config, id, testExternalId, row }) {
  let url;
  try {
    const response = await brazeGet({
      config,
      endpoint: `/preference_center/v1/${encodeURIComponent(id)}/url/${encodeURIComponent(testExternalId)}`
    });
    url = response?.preference_center_url;
  } catch (err) {
    const classified = classifyBrazeError(err, "/preference_center/v1/{id}/url/{userId}");
    row.notes.push(
      "Live-page leg unavailable — Braze would not generate a URL for this " +
        `centre (${classified.error}). Braze supports URL generation only for ` +
        "preference centres created via the API or the drag-and-drop editor; " +
        "a legacy centre cannot be reached this way. The markup leg above " +
        "still ran. This is NOT a pass on the live page."
    );
    return "unavailable";
  }

  if (!url) {
    row.notes.push(
      "Braze returned no preference_center_url. Live-page leg not run — not a pass."
    );
    return "unavailable";
  }

  const live = await auditUnsubscribe({ url });
  row.live_page = { url, verdict: live.verdict, issues: live.issues ?? [] };
  return "checked";
}

const RANK = { pass: 0, warn: 1, fail: 2 };

function worstVerdict(verdicts) {
  let worst = "pass";
  for (const v of verdicts) {
    if (!v || !(v in RANK)) continue;
    if (RANK[v] > RANK[worst]) worst = v;
  }
  return worst;
}
