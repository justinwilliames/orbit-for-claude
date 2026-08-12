/**
 * Braze forward send-calendar audit.
 *
 * Braze's dashboard has a calendar view. It will show you that eleven things
 * go out next Tuesday. It will not tell you that four of them carry no tags,
 * that one is scheduled at 03:00, or that half the Tuesday sends use
 * `local_time_zones` while the other half use `intelligent_delivery` — so the
 * "9am send" actually lands across a twenty-four hour smear. Governance drift
 * on a forward calendar is invisible everywhere else.
 *
 * HARD LIMITATION, stated rather than glossed. Neither `/campaigns/details`
 * nor `/canvas/details` exposes the target audience, so true audience-overlap
 * collision detection is NOT possible over Braze's public API. This tool can
 * only proxy overlap through tags and naming convention, and the output says
 * exactly that in `overlap_basis`. Inferring an audience here would be the
 * confident-wrong-answer shape the rest of this codebase keeps having to fix.
 *
 * Read-only. Every HTTP call goes through the shared `brazeGet`.
 */

import { brazeGet, validateBrazeSetup } from "./braze-api.js";
import { classifyBrazeError, authFailedResponse } from "./braze-read.js";
import { listBrazeNamerDimensions } from "./braze-namer.js";

/**
 * Schedule types Braze returns whose delivery time is NOT a single instant.
 * Mixing these with a fixed-timezone send inside one day is the smear.
 */
const SPREAD_SCHEDULES = new Set(["local_time_zones", "intelligent_delivery"]);

/** Conservative defaults; every one is caller-overridable. */
const DEFAULTS = {
  quiet_hours: { start: 21, end: 8 }, // 21:00–08:00 on the workspace's own clock
  allowed_days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  max_sends_per_tag: 3, // per 7-day window
  window_days: 14
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Build the forward calendar and audit it against send policy.
 *
 * @param {object} args
 * @param {object} args.config
 * @param {number} [args.window_days=14]      How far forward to look.
 * @param {object} [args.quiet_hours]         { start, end } as 0-23 hours.
 * @param {string[]} [args.allowed_days]      Mon…Sun subset.
 * @param {number} [args.max_sends_per_tag=3] Per tag, per window.
 * @param {boolean} [args.enrich=true]        Pull details for channel/state.
 * @param {number} [args.max_enrich=40]       Cap on detail lookups.
 */
export async function auditSendCalendar({
  config,
  window_days: windowDays = DEFAULTS.window_days,
  quiet_hours: quietHours = DEFAULTS.quiet_hours,
  allowed_days: allowedDays = DEFAULTS.allowed_days,
  max_sends_per_tag: maxSendsPerTag = DEFAULTS.max_sends_per_tag,
  workspace_timezone: workspaceTimezone = null,
  enrich = true,
  max_enrich: maxEnrich = 40,
  resumeState,
  shouldYield
} = {}) {
  const setupError = validateBrazeSetup(config);
  if (setupError) return setupError;

  const yieldIf = typeof shouldYield === "function" ? shouldYield : () => false;

  const state = resumeState ?? {
    startedAt: new Date().toISOString(),
    endTime: new Date(Date.now() + windowDays * 86400000).toISOString(),
    broadcasts: null,
    rows: [],
    cursor: 0
  };

  // ── Step 1: the forward schedule ─────────────────────────────────
  if (state.broadcasts === null) {
    try {
      const response = await brazeGet({
        config,
        endpoint: "/messages/scheduled_broadcasts",
        params: { end_time: state.endTime }
      });
      state.broadcasts = Array.isArray(response?.scheduled_broadcasts)
        ? response.scheduled_broadcasts
        : [];
    } catch (err) {
      const classified = classifyBrazeError(err, "/messages/scheduled_broadcasts");
      if (classified.authFailed) return authFailedResponse(classified);
      return {
        status: "unavailable",
        reason: classified.error,
        message:
          "Could not read the forward schedule, so no calendar was built. " +
          "This is not a clean calendar — nothing was checked. The endpoint " +
          "needs the `messages.schedule_broadcasts` permission."
      };
    }
  }

  // An empty read is NOT a pass. "Nothing scheduled" and "calendar clean"
  // are different sentences and only one of them is true here.
  if (state.broadcasts.length === 0) {
    return {
      status: "ok",
      timestamp: state.startedAt,
      window: { days: windowDays, end_time: state.endTime },
      verdict: "nothing_scheduled",
      overlap_basis: "tags_and_naming",
      caveats: [OVERLAP_CAVEAT],
      summary: {
        headline:
          `Nothing is scheduled in the next ${windowDays} day(s). That is an ` +
          "empty read, not a clean calendar — no policy check ran because " +
          "there was nothing to check.",
        total: 0,
        findings: 0
      },
      calendar: [],
      findings: []
    };
  }

  // ── Step 2: enrich each row, checkpointed ────────────────────────
  while (state.cursor < state.broadcasts.length) {
    const broadcast = state.broadcasts[state.cursor];
    const row = await buildRow({
      config,
      broadcast,
      enrich: enrich && state.cursor < maxEnrich
    });
    if (row.authFailed) return authFailedResponse(row);
    state.rows.push(row);
    state.cursor += 1;

    if (yieldIf() && state.cursor < state.broadcasts.length) {
      return {
        status: "continuation_required",
        calendar_partial: {
          enriched: state.cursor,
          total: state.broadcasts.length,
          progress: `${state.cursor}/${state.broadcasts.length} scheduled sends read`
        },
        resume_state: state
      };
    }
  }

  return buildCalendarReport({
    state,
    windowDays,
    quietHours,
    allowedDays,
    maxSendsPerTag,
    workspaceTimezone
  });
}

const OVERLAP_CAVEAT =
  "Collision detection here is proxied through tags and naming convention " +
  "only. Braze exposes no target segment on either /campaigns/details or " +
  "/canvas/details, so two sends can share an audience and look unrelated to " +
  "this tool. Treat a clean density check as 'no tag collision', never as " +
  "'no audience overlap'.";

/** One calendar row: the broadcast plus whatever details adds. */
async function buildRow({ config, broadcast, enrich }) {
  const row = {
    id: broadcast.id ?? null,
    name: broadcast.name ?? null,
    type: broadcast.type ?? null, // "Campaign" | "Canvas"
    tags: Array.isArray(broadcast.tags) ? broadcast.tags : [],
    next_send_time: broadcast.next_send_time ?? null,
    schedule_type: broadcast.schedule_type ?? null,
    channels: null,
    state: null,
    notes: []
  };

  if (!enrich || !row.id || !row.type) return row;

  const endpoint = row.type === "Canvas" ? "/canvas/details" : "/campaigns/details";
  const param = row.type === "Canvas" ? "canvas_id" : "campaign_id";
  try {
    const details = await brazeGet({ config, endpoint, params: { [param]: row.id } });
    row.channels = details.channels ?? deriveChannels(details);
    row.state = details.archived
      ? "archived"
      : details.draft ?? details.is_draft
        ? "draft"
        : "active";
  } catch (err) {
    const classified = classifyBrazeError(err, endpoint);
    if (classified.authFailed) return { ...classified, authFailed: true };
    row.notes.push(`Channel/state unknown — ${classified.error}`);
  }
  return row;
}

/** Campaigns return `messages` keyed by variant, not a `channels` array. */
function deriveChannels(details) {
  const messages = details?.messages;
  if (!messages || typeof messages !== "object") return null;
  const channels = new Set();
  for (const message of Object.values(messages)) {
    if (message?.channel) channels.add(message.channel);
  }
  return channels.size > 0 ? [...channels] : null;
}

function buildCalendarReport({ state, windowDays, quietHours, allowedDays, maxSendsPerTag, workspaceTimezone = null }) {
  const rows = state.rows;
  const findings = [];
  const allowed = new Set(allowedDays);

  // Known naming vocabulary, so the calendar and the convention are
  // enforced by one tool rather than two that can disagree.
  const namer = listBrazeNamerDimensions();
  const knownTokens = new Set();
  for (const dimension of namer.dimensions ?? []) {
    for (const value of dimension.values ?? []) {
      knownTokens.add(String(value).toLowerCase());
    }
  }

  const perDay = new Map();   // "YYYY-MM-DD" -> rows
  const perTag = new Map();   // tag -> count

  for (const row of rows) {
    // (1) Untagged. Flagged, never skipped — an untagged send is invisible
    //     to every density and collision check below, so silently passing
    //     it over is how the calendar reports clean while being blind.
    if (row.tags.length === 0) {
      findings.push({
        check: "untagged",
        severity: "medium",
        send: row.name,
        detail:
          "No tags. This send is excluded from every density and collision " +
          "check by construction, so its absence from the findings below " +
          "means nothing."
      });
    }

    // (2) Naming conformance against the namer's own vocabulary.
    if (row.name) {
      const tokens = String(row.name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
      if (!tokens.some((t) => knownTokens.has(t))) {
        findings.push({
          check: "naming_nonconformant",
          severity: "low",
          send: row.name,
          detail:
            "The name carries no recognised program, channel or audience " +
            "token. A year from now nobody will be able to tell what this was."
        });
      }
    }

    // (3) Schedule / quiet hours. A spread schedule has no single instant,
    //     so a quiet-hours verdict on it would be fiction.
    const when = row.next_send_time ? new Date(row.next_send_time) : null;
    const validWhen = when && !Number.isNaN(when.getTime());
    if (!validWhen) {
      findings.push({
        check: "no_send_time",
        severity: "medium",
        send: row.name,
        detail: "Braze returned no parseable next_send_time for this broadcast."
      });
    } else if (SPREAD_SCHEDULES.has(row.schedule_type)) {
      row.notes.push(
        `schedule_type "${row.schedule_type}" delivers across recipient ` +
          "timezones or per-user optimal times, so a quiet-hours check on the " +
          "nominal time would be meaningless. Not checked."
      );
    } else {
      const wall = wallClock(row.next_send_time, workspaceTimezone);
      if (!wall) {
        // No wall clock means no honest quiet-hours answer. Abstain by name,
        // the same treatment a spread schedule already gets above.
        row.notes.push(
          "next_send_time carries no readable local wall clock, so quiet " +
            "hours and allowed days were not checked for this send."
        );
      } else {
        if (inQuietHours(wall.hour, quietHours)) {
          findings.push({
            check: "quiet_hours",
            severity: "high",
            send: row.name,
            detail:
              `Scheduled at ${String(wall.hour).padStart(2, "0")}:` +
              `${String(wall.minute).padStart(2, "0")} ${wall.basis}, inside the ` +
              `stated quiet window ${quietHours.start}:00–${quietHours.end}:00.`
          });
        }
        if (!allowed.has(wall.day)) {
          findings.push({
            check: "disallowed_day",
            severity: "medium",
            send: row.name,
            detail: `Scheduled on ${wall.day} ${wall.basis}, which is not in the allowed send days.`
          });
        }
      }
    }

    // Bucket the calendar on the LOCAL date too. Bucketing on the UTC date
    // splits one working day across two calendar days for any workspace east
    // or west of Greenwich, and then feeds that invented calendar to the
    // mixed-delivery and busiest-day checks below.
    const bucket = wallClock(row.next_send_time, workspaceTimezone);
    if (bucket) {
      if (!perDay.has(bucket.date)) perDay.set(bucket.date, []);
      perDay.get(bucket.date).push(row);
    }
    for (const tag of row.tags) {
      perTag.set(tag, (perTag.get(tag) ?? 0) + 1);
    }
  }

  // (4) Mixed delivery semantics inside one day — the "9am" smear.
  for (const [dayKey, dayRows] of perDay) {
    const kinds = new Set(dayRows.map((r) => r.schedule_type ?? "unknown"));
    const spread = [...kinds].filter((k) => SPREAD_SCHEDULES.has(k));
    if (spread.length > 0 && kinds.size > 1) {
      findings.push({
        check: "mixed_delivery_semantics",
        severity: "medium",
        send: dayKey,
        detail:
          `${dayKey} mixes ${[...kinds].join(", ")}. Sends nominally on the ` +
          "same day land across a 24-hour spread relative to each other, so " +
          "the ordering a recipient experiences is not the ordering here."
      });
    }
  }

  // (5) Tag density.
  for (const [tag, count] of perTag) {
    if (count > maxSendsPerTag) {
      findings.push({
        check: "tag_density",
        severity: "high",
        send: tag,
        detail:
          `${count} sends tagged "${tag}" in a ${windowDays}-day window ` +
          `(limit ${maxSendsPerTag}). Proxy for audience collision only — see caveats.`
      });
    }
  }

  // Recurring broadcasts. Braze returns a recurring send ONCE, at its next
  // occurrence, so counting rows as sends understates real density. Say so
  // rather than projecting a number the API did not give us.
  const recurring = rows.filter((r) => r.schedule_type && /recur|daily|weekly/i.test(r.schedule_type));
  const caveats = [OVERLAP_CAVEAT];
  if (recurring.length > 0) {
    caveats.push(
      `${recurring.length} broadcast(s) look recurring. Braze lists a ` +
        "recurring send once, at its NEXT occurrence only, so the density " +
        "counts below are a floor, not a projection."
    );
  }

  return {
    status: "ok",
    timestamp: state.startedAt,
    window: { days: windowDays, end_time: state.endTime },
    policy: {
      quiet_hours: quietHours,
      allowed_days: allowedDays,
      max_sends_per_tag: maxSendsPerTag,
      // Which clock every hour and day below was read on. Without this the
      // reader cannot tell a real 03:00 send from a timezone artefact.
      clock_basis: workspaceTimezone
        ? `workspace_timezone ${workspaceTimezone} (converted through Intl)`
        : "the offset Braze returned in next_send_time — pass workspace_timezone " +
          "if your workspace normalises that field to UTC"
    },
    overlap_basis: "tags_and_naming",
    caveats,
    summary: {
      total_scheduled: rows.length,
      findings: findings.length,
      by_check: findings.reduce((acc, f) => {
        acc[f.check] = (acc[f.check] ?? 0) + 1;
        return acc;
      }, {}),
      busiest_day: busiestDay(perDay),
      headline:
        findings.length === 0
          ? `${rows.length} scheduled send(s), no policy findings on the checks this tool can actually run.`
          : `${findings.length} finding(s) across ${rows.length} scheduled send(s).`
    },
    calendar: [...perDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayRows]) => ({
        date,
        day: DAY_NAMES[new Date(date + "T00:00:00Z").getUTCDay()],
        sends: dayRows.map((r) => ({
          name: r.name,
          type: r.type,
          tags: r.tags,
          channels: r.channels,
          state: r.state,
          next_send_time: r.next_send_time,
          schedule_type: r.schedule_type,
          // The wall clock the CHECKS above were run against, carried
          // alongside the raw timestamp rather than left to be re-derived.
          // Anything reading next_send_time itself — a widget, a
          // spreadsheet, a second script — reimplements the offset/Intl
          // logic in wallClock() and drifts from it, and then the picture
          // says 09:00 while the quiet-hours finding underneath it says
          // 23:00. Null when no local clock was readable, which is the
          // same condition that made the check abstain.
          wall_clock: wallClock(r.next_send_time, workspaceTimezone),
          // Whether this send HAS a single moment at all. A spread
          // schedule does not, which is why no quiet-hours verdict was
          // issued for it, and anything drawing a calendar needs that as
          // a fact rather than as a schedule_type string to pattern-match.
          delivery: SPREAD_SCHEDULES.has(r.schedule_type) ? "spread" : "point",
          notes: r.notes
        }))
      })),
    findings
  };
}

/**
 * The wall clock the SEND was scheduled at, never the one this process runs in.
 *
 * `next_send_time` comes back from Braze carrying an offset — the workspace's
 * own, e.g. "2026-08-18T09:00:00+10:00". Reading it with getUTCHours() moves
 * every send to Greenwich: a 09:00 Brisbane send became 23:00 the previous
 * day, which is a HIGH quiet-hours finding with a fabricated clock time and
 * the wrong calendar date, while a genuine 23:30 local violation (13:30 UTC)
 * went unreported. Wrong in both directions on the same run, against a policy
 * this file's own line 33 calls "recipient-local".
 *
 * So: read the wall clock straight out of the string Braze sent. A caller who
 * knows better can pass an IANA `workspace_timezone` and the instant is
 * converted through Intl instead — that is the only path that survives Braze
 * normalising the field to Z.
 */
function wallClock(iso, timeZone) {
  const raw = String(iso ?? "");
  if (!raw) return null;

  if (timeZone) {
    const t = new Date(raw);
    if (Number.isNaN(t.getTime())) return null;
    let parts;
    try {
      parts = new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour12: false,
        weekday: "short",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).formatToParts(t);
    } catch {
      return null; // unknown IANA zone — abstain rather than guess
    }
    const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
    return {
      hour: Number(get("hour")) % 24,
      minute: Number(get("minute")),
      day: get("weekday").slice(0, 3),
      date: `${get("year")}-${get("month")}-${get("day")}`,
      basis: `in ${timeZone}`
    };
  }

  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  const offset = raw.slice(19).match(/^(Z|[+-]\d{2}:?\d{2})/)?.[1] ?? null;
  return {
    hour: Number(hh),
    minute: Number(mm),
    // getUTCDay on a date built from the same Y-M-D gives that calendar
    // date's weekday, with no timezone arithmetic applied to it.
    day: DAY_NAMES[new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDay()],
    date: `${y}-${mo}-${d}`,
    basis: offset && offset !== "Z" ? `at the workspace offset ${offset}` : "UTC"
  };
}

/** Quiet hours may wrap midnight (21 → 8). */
function inQuietHours(hour, { start, end }) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

function busiestDay(perDay) {
  let best = null;
  for (const [date, rows] of perDay) {
    if (!best || rows.length > best.sends) best = { date, sends: rows.length };
  }
  return best;
}
