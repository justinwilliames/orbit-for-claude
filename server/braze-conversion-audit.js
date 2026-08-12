/**
 * Braze conversion-event audit.
 *
 * Braze shows a conversion rate for every campaign. It does not tell you
 * whether the event behind that rate can ever fire. When the configured
 * custom event was renamed, typo'd, or never instrumented, the rate is a
 * structurally guaranteed 0% — and it reads to a marketer as a creative
 * failure, so the fix they reach for is a new subject line.
 *
 * Nothing joins the two halves. `/campaigns/details` returns the conversion
 * behaviours; `/events/list` and `/events/data_series` return what the
 * workspace actually records. The dashboard shows each separately. This
 * module is the join.
 *
 * Five checks, per campaign:
 *   unmeasurable       — zero conversion behaviours: no rate exists at all.
 *   event_not_in_workspace — "Performs Custom Event" naming an event Braze
 *                        has never heard of. Permanently 0%, forever.
 *   event_never_fires  — the event exists but recorded zero occurrences in
 *                        the window. Dead instrumentation.
 *   window_shorter_than_cadence — a conversion window narrower than the
 *                        caller's own send cadence measures a slice of the
 *                        journey and calls it the whole thing.
 *   attribution_gap    — sends > 0, conversions == 0, but the event DOES
 *                        fire globally. Not a dead event: a targeting or
 *                        attribution mismatch.
 *
 * SCOPE. `/canvas/details` does not return conversion behaviours, so
 * canvases cannot be audited this way. The output says so in a field rather
 * than inferring anything — an audit that quietly covers half the workspace
 * is worse than one that names its edge.
 *
 * Read-only. Every HTTP call goes through the shared `brazeGet`.
 */

import { brazeGet, validateBrazeSetup, buildDashboardUrl } from "./braze-api.js";
import { safeList, classifyBrazeError, authFailedResponse } from "./braze-read.js";

/** Behaviour types Braze can attach; only this one names a custom event. */
const CUSTOM_EVENT_BEHAVIOUR = "Performs Custom Event";

/**
 * Audit every campaign's conversion configuration against what the
 * workspace's event stream can actually produce.
 *
 * @param {object} args
 * @param {object} args.config              Runtime config (Braze credentials).
 * @param {number} [args.days=30]           Lookback window for event counts.
 * @param {number} [args.cadence_days=0]    The programme's own send cadence.
 *                                          A conversion window shorter than
 *                                          this is flagged. 0 disables.
 * @param {string[]} [args.campaign_ids]    Restrict to these campaigns.
 * @param {number} [args.max_campaigns=50]  Hard cap on details lookups.
 * @param {object} [args.resumeState]       From a previous continuation.
 * @param {Function} [args.shouldYield]     Budget predicate.
 */
export async function auditConversionEvents({
  config,
  days = 30,
  cadence_days: cadenceDays = 0,
  campaign_ids: campaignIds,
  max_campaigns: maxCampaigns = 50,
  resumeState,
  shouldYield
} = {}) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  const yieldIf = typeof shouldYield === "function" ? shouldYield : () => false;

  const state = resumeState ?? {
    startedAt: new Date().toISOString(),
    campaigns: null,     // [{id, name, tags}] once the list step is done
    knownEvents: null,   // [name] from /events/list
    eventCounts: {},     // name -> { count, abstained, reason }
    rows: [],            // finished campaign rows
    cursor: 0            // index into state.campaigns
  };

  // ── Step 1: the campaign list ────────────────────────────────────
  if (state.campaigns === null) {
    const listed = await safeList(config, "/campaigns/list", "campaigns");
    if (listed.authFailed) return authFailedResponse(listed);
    if (listed.error) {
      return {
        status: "unavailable",
        reason: listed.error,
        message:
          "Could not list campaigns, so no conversion configuration was read. " +
          "This is not a clean audit — nothing below was checked."
      };
    }
    let items = listed.items;
    if (Array.isArray(campaignIds) && campaignIds.length > 0) {
      const wanted = new Set(campaignIds);
      items = items.filter((c) => wanted.has(c.id));
    }
    state.campaigns = items.slice(0, maxCampaigns).map((c) => ({
      id: c.id,
      name: c.name,
      tags: c.tags ?? []
    }));
    // Truncated by EITHER the caller's cap or the paginator's. Comparing the
    // returned length against maxCampaigns could only ever see the cap, so a
    // partial list read reported `truncated: false` on a third of a workspace.
    state.truncated = items.length > maxCampaigns || Boolean(listed.truncated);
    state.campaignsListTruncated = Boolean(listed.truncated);
  }

  // ── Step 2: the workspace event vocabulary ───────────────────────
  if (state.knownEvents === null) {
    const events = await safeList(config, "/events/list", "events");
    if (events.authFailed) return authFailedResponse(events);
    if (events.error) {
      // Without the vocabulary, "this event does not exist" is unprovable.
      // Abstain on that one check rather than report every event missing.
      state.knownEvents = null;
      state.eventsListError = events.error;
    } else {
      state.knownEvents = events.items.map((e) => e.name ?? e).filter(Boolean);
      state.eventsListTruncated = Boolean(events.truncated);
    }
  }
  const knownEvents = state.knownEvents === null ? null : new Set(state.knownEvents);

  // ── Step 3: per-campaign join, checkpointed ──────────────────────
  while (state.cursor < state.campaigns.length) {
    const campaign = state.campaigns[state.cursor];
    const row = await auditOneCampaign({
      config,
      campaign,
      days,
      cadenceDays,
      knownEvents,
      knownEventsPartial: Boolean(state.eventsListTruncated),
      eventsListError: state.eventsListError ?? null,
      eventCounts: state.eventCounts
    });
    if (row.authFailed) return authFailedResponse(row);
    state.rows.push(row);
    state.cursor += 1;

    if (yieldIf() && state.cursor < state.campaigns.length) {
      return {
        status: "continuation_required",
        conversion_audit_partial: {
          audited: state.cursor,
          total: state.campaigns.length,
          progress: `${state.cursor}/${state.campaigns.length} campaigns joined`
        },
        resume_state: state
      };
    }
  }

  return buildReport({ state, days, cadenceDays });
}

/**
 * Join one campaign's conversion behaviours against the event stream.
 * Returns a row; `authFailed` on it aborts the whole audit upstream.
 */
async function auditOneCampaign({
  config,
  campaign,
  days,
  cadenceDays,
  knownEvents,
  knownEventsPartial = false,
  eventsListError,
  eventCounts
}) {
  let details;
  try {
    details = await brazeGet({
      config,
      endpoint: "/campaigns/details",
      params: { campaign_id: campaign.id }
    });
  } catch (err) {
    const classified = classifyBrazeError(err, "/campaigns/details");
    if (classified.authFailed) return { ...classified, authFailed: true };
    return {
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      verdict: "abstain",
      findings: [],
      notes: [`Could not read conversion configuration: ${classified.error}`]
    };
  }

  const behaviours = Array.isArray(details.conversion_behaviors)
    ? details.conversion_behaviors
    : [];

  const findings = [];
  const notes = [];

  if (behaviours.length === 0) {
    findings.push({
      check: "unmeasurable",
      severity: "high",
      detail:
        "No conversion behaviour is configured, so this campaign has no " +
        "conversion rate to read. Whatever the dashboard shows next to it " +
        "is not measuring this campaign."
    });
  }

  // EVERY behaviour is evaluated. Reading only behaviors[0] is the
  // first-row-of-a-multi-row-response bug that has already shipped once in
  // this repo; a campaign with a primary and a secondary conversion event
  // is exactly where it hides.
  const behaviourRows = [];
  for (let i = 0; i < behaviours.length; i += 1) {
    const behaviour = behaviours[i] ?? {};
    const entry = {
      index: i,
      type: behaviour.type ?? "unknown",
      window_days: numberOrNull(behaviour.window),
      custom_event_name: behaviour.custom_event_name ?? null,
      event_occurrences: null
    };

    if (
      cadenceDays > 0 &&
      entry.window_days !== null &&
      entry.window_days < cadenceDays
    ) {
      findings.push({
        check: "window_shorter_than_cadence",
        severity: "medium",
        behaviour_index: i,
        detail:
          `Conversion window is ${entry.window_days} day(s) but the programme ` +
          `sends every ${cadenceDays} day(s). Conversions landing after the ` +
          "window close are attributed to the next send, or to nothing."
      });
    }

    if (entry.type === CUSTOM_EVENT_BEHAVIOUR) {
      const name = entry.custom_event_name;
      if (!name) {
        findings.push({
          check: "event_not_in_workspace",
          severity: "high",
          behaviour_index: i,
          detail:
            "A \"Performs Custom Event\" behaviour with no event name. " +
            "Nothing can satisfy it."
        });
      } else if (knownEvents === null) {
        notes.push(
          `Could not verify "${name}" against the workspace event list ` +
            `(${eventsListError}). Existence NOT checked for this campaign.`
        );
      } else if (!knownEvents.has(name) && knownEventsPartial) {
        // Absence cannot be proved from a partial list. This is the rule
        // eventOccurrences already follows for a failed read, applied to the
        // vocabulary: an event missing from a truncated page walk is a note,
        // not a high-severity accusation with a causal story attached.
        notes.push(
          `"${name}" was not in the event list, but the event list read hit its ` +
            "page cap and is INCOMPLETE. Absence is unprovable from a partial " +
            "list, so this is not reported as a missing event. Raise the cap, or " +
            "check the name in the dashboard."
        );
      } else if (!knownEvents.has(name)) {
        findings.push({
          check: "event_not_in_workspace",
          severity: "high",
          behaviour_index: i,
          detail:
            `Conversion event "${name}" is not in this workspace's event list. ` +
            "It can never fire, so this campaign's conversion rate is a " +
            "structurally guaranteed 0%. Usually a rename or a typo."
        });
      } else {
        const counted = await eventOccurrences({ config, name, days, eventCounts });
        entry.event_occurrences = counted.count;
        if (counted.abstained) {
          // A failed read is NOT zero. Naming the campaign matters: a
          // silent skip here is how a whole cohort of dead events stays
          // invisible.
          notes.push(
            `Occurrence count for "${name}" is unknown — ${counted.reason}. ` +
              "Not reported as zero."
          );
        } else if (counted.count === 0) {
          findings.push({
            check: "event_never_fires",
            severity: "high",
            behaviour_index: i,
            detail:
              `Conversion event "${name}" exists but recorded 0 occurrences in ` +
              `the last ${days} day(s). Dead instrumentation: the event was ` +
              "defined and the code that emits it never shipped, or stopped."
          });
        }
      }
    }

    behaviourRows.push(entry);
  }

  // The fifth check needs send/conversion volume, which lives on the
  // campaign's own data series.
  const series = await campaignVolume({ config, campaignId: campaign.id, days });
  if (series.authFailed) return { ...series, authFailed: true };
  if (series.abstained) {
    notes.push(`Send volume unknown — ${series.reason}. Attribution gap not checked.`);
  } else if (
    series.sent > 0 &&
    series.conversions === 0 &&
    behaviours.length > 0 &&
    // Only meaningful when the event demonstrably does fire elsewhere.
    behaviourRows.some((b) => (b.event_occurrences ?? 0) > 0)
  ) {
    findings.push({
      check: "attribution_gap",
      severity: "medium",
      detail:
        `${series.sent} send(s) and 0 conversions in the window, but the ` +
        "conversion event fires elsewhere in the workspace. The event is " +
        "alive; the attribution or the targeting is the mismatch."
    });
  }

  return {
    campaign_id: campaign.id,
    campaign_name: campaign.name,
    tags: campaign.tags,
    verdict: findings.length > 0 ? "fail" : notes.length > 0 ? "abstain" : "pass",
    conversion_behaviors: behaviourRows,
    sends_in_window: series.abstained ? null : series.sent,
    conversions_in_window: series.abstained ? null : series.conversions,
    findings,
    notes,
    dashboard_url: buildDashboardUrl(config.brazeRestEndpoint, "campaigns", campaign.id)
  };
}

/**
 * Occurrences of a custom event over the window, memoised per audit run —
 * several campaigns commonly converge on one event.
 *
 * A 404/429/500 ABSTAINS. Returning 0 here would manufacture the exact
 * finding this tool exists to report.
 */
async function eventOccurrences({ config, name, days, eventCounts }) {
  if (Object.prototype.hasOwnProperty.call(eventCounts, name)) {
    return eventCounts[name];
  }
  let outcome;
  try {
    const response = await brazeGet({
      config,
      endpoint: "/events/data_series",
      params: { event: name, length: days, unit: "day" }
    });
    const points = Array.isArray(response?.data) ? response.data : [];
    const count = points.reduce((total, p) => total + (Number(p?.count) || 0), 0);
    outcome = { count, abstained: false, reason: null };
  } catch (err) {
    const classified = classifyBrazeError(err, "/events/data_series");
    outcome = { count: null, abstained: true, reason: classified.error };
  }
  eventCounts[name] = outcome;
  return outcome;
}

/** Sends and conversions over the window, from the campaign data series. */
async function campaignVolume({ config, campaignId, days }) {
  try {
    const response = await brazeGet({
      config,
      endpoint: "/campaigns/data_series",
      params: { campaign_id: campaignId, length: days }
    });
    const points = Array.isArray(response?.data) ? response.data : [];
    let sent = 0;
    let conversions = 0;
    for (const point of points) {
      conversions += Number(point?.conversions) || 0;
      const channels = point?.messages ?? {};
      for (const variants of Object.values(channels)) {
        for (const variant of Array.isArray(variants) ? variants : []) {
          sent += Number(variant?.sent) || 0;
        }
      }
    }
    return { sent, conversions, abstained: false, authFailed: false };
  } catch (err) {
    const classified = classifyBrazeError(err, "/campaigns/data_series");
    if (classified.authFailed) return { ...classified, authFailed: true };
    return { abstained: true, reason: classified.error, authFailed: false };
  }
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildReport({ state, days, cadenceDays }) {
  const rows = state.rows;
  const counts = {};
  for (const row of rows) {
    for (const finding of row.findings) {
      counts[finding.check] = (counts[finding.check] ?? 0) + 1;
    }
  }

  const failing = rows.filter((r) => r.verdict === "fail");
  const abstaining = rows.filter((r) => r.verdict === "abstain");

  return {
    status: "ok",
    timestamp: state.startedAt,
    window: { days, cadence_days: cadenceDays || null },
    scope: {
      campaigns_audited: rows.length,
      truncated: Boolean(state.truncated),
      campaign_list_incomplete: Boolean(state.campaignsListTruncated),
      event_list_incomplete: Boolean(state.eventsListTruncated),
      canvases:
        "not audited — /canvas/details does not return conversion behaviours, " +
        "so a Canvas's conversion configuration cannot be read over the API"
    },
    summary: {
      failing: failing.length,
      abstaining: abstaining.length,
      passing: rows.length - failing.length - abstaining.length,
      by_check: counts,
      headline:
        failing.length === 0
          ? abstaining.length === 0
            ? "Every audited campaign measures conversion on an event that exists and fires."
            : `No failures, but ${abstaining.length} campaign(s) could not be fully checked — see notes.`
          : `${failing.length} of ${rows.length} campaign(s) are measuring conversion on something that cannot report honestly.`
    },
    campaigns: rows
  };
}
