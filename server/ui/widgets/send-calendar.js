/**
 * Send calendar — the widget behind orbit_audit_send_calendar.
 *
 * The tool answers two questions: what is going out, and where does it
 * break policy. The first one is a calendar — literally the object every
 * marketing team already keeps on a wall — and JSON is the worst
 * possible rendering of it. Reading `calendar[]` as text, a reader has
 * to reconstruct which days are crowded, which sends land in the quiet
 * window, and which ones stack on top of each other, from a list sorted
 * by date. All three are positions on a grid.
 *
 * THREE RULES THIS FILE IS BUILT AROUND
 *
 *   1. A send is only drawn at a time the SERVER read. The tool derives
 *      each send's wall clock from the offset Braze returned (or from an
 *      IANA zone through Intl) and runs the quiet-hours check against
 *      it. The widget must never re-parse the timestamp itself: a second
 *      implementation would drift from the first, and then the picture
 *      would put a send at 09:00 while the finding underneath it said
 *      23:00. So the wall clock arrives pre-computed, and a send whose
 *      clock the server could not read is NOT plotted — it goes to an
 *      explicit unplaced strip, by name, with the reason.
 *
 *   2. A spread send has no single time, and is never drawn as if it
 *      does. local_time_zones and intelligent_delivery deliver across a
 *      24-hour window; the tool refuses to run a quiet-hours check on
 *      them for exactly that reason. Drawing one as a block at its
 *      nominal hour would re-assert the fiction the tool declined to
 *      make. They render as a full-day band instead.
 *
 *   3. Every finding is anchored to the thing it is about. The tool
 *      overloads one field: `send` holds a campaign name for a
 *      send-level check, a DATE for the mixed-delivery check, and a TAG
 *      for the density check. Matching all of them against send names
 *      would silently drop the two that are not send names. The
 *      anchoring rule lives in CALENDAR_ANCHOR_JS as plain source so a
 *      test can run it, and an unrecognised check lands in "other"
 *      rather than nowhere.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * Placement and finding-anchoring, as plain source.
 *
 * Both decide whether the reader is shown a measurement or an
 * admission, and both fail invisibly: a mis-anchored finding just isn't
 * there, and a send plotted at a fabricated hour looks exactly like one
 * plotted at a real hour.
 */
export const CALENDAR_ANCHOR_JS = `
// Which object a finding is ABOUT. The tool writes all three kinds into
// one \`send\` field, so the check name is the only reliable discriminator.
var SEND_LEVEL_CHECKS = ["untagged", "naming_nonconformant", "no_send_time", "quiet_hours", "disallowed_day"];
var DAY_LEVEL_CHECKS = ["mixed_delivery_semantics"];
var TAG_LEVEL_CHECKS = ["tag_density"];

function anchorOf(finding) {
  var check = (finding && finding.check) || "";
  if (SEND_LEVEL_CHECKS.indexOf(check) !== -1) return { kind: "send", key: finding.send };
  if (DAY_LEVEL_CHECKS.indexOf(check) !== -1) return { kind: "day", key: finding.send };
  if (TAG_LEVEL_CHECKS.indexOf(check) !== -1) return { kind: "tag", key: finding.send };
  // A check this widget has never heard of is still a finding. It is
  // shown unanchored rather than dropped, which is what an index-based
  // or name-matched lookup would have done to it.
  return { kind: "other", key: finding && finding.send };
}

function findingsForSend(findings, sendName) {
  return (findings || []).filter(function (f) {
    var a = anchorOf(f);
    return a.kind === "send" && a.key === sendName;
  });
}

// How a send can honestly be drawn.
//   point       — the server read a wall clock; plot it at that hour
//   spread      — delivery is smeared across timezones; a single hour
//                 would be a claim the tool explicitly refused to make
//   unplaceable — no readable clock; name it, never place it
function sendPlacement(send) {
  if (!send) return { kind: "unplaceable", reason: "no send record" };
  if (send.delivery === "spread") {
    return {
      kind: "spread",
      reason: "schedule_type \\"" + (send.schedule_type || "spread") +
        "\\" delivers across recipient timezones, so it has no single send time"
    };
  }
  var wc = send.wall_clock;
  if (!wc || typeof wc.hour !== "number") {
    return {
      kind: "unplaceable",
      reason: "no readable local send time \\u2014 not placed on the grid rather than guessed"
    };
  }
  return { kind: "point", hour: wc.hour, minute: wc.minute || 0, basis: wc.basis || null };
}

// The grid can only draw what \`calendar[]\` contains — and a send with no
// parseable send time never enters it, because the tool buckets by local
// DATE and it has none. So the picture quietly held ten of eleven
// scheduled sends while the header counted eleven. Reconcile the two and
// say the difference out loud, naming whatever the findings can name.
function unaccountedSends(totalScheduled, drawnCount, findings) {
  var total = Number(totalScheduled);
  if (!isFinite(total) || total <= drawnCount) return { missing: 0, named: [] };
  var named = (findings || [])
    .filter(function (f) { return f && f.check === "no_send_time"; })
    .map(function (f) { return f.send; });
  return { missing: total - drawnCount, named: named };
}

// Quiet hours may wrap midnight (21 -> 8), which is two bands on a
// 0-24 axis, not one.
function quietBands(quiet) {
  var start = quiet && typeof quiet.start === "number" ? quiet.start : null;
  var end = quiet && typeof quiet.end === "number" ? quiet.end : null;
  if (start === null || end === null || start === end) return [];
  if (start < end) return [{ from: start, to: end }];
  return [{ from: start, to: 24 }, { from: 0, to: end }];
}
`;

const CSS = `
body { height: 100vh; overflow: hidden; }
.wrap { display: flex; flex-direction: column; height: 100vh; }

.head { padding: 13px 18px 11px; border-bottom: 1px solid var(--rule); background: var(--card); }
.head-top { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.spacer { flex: 1; }
.head-meta { margin-top: 7px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 11.5px; color: var(--ink-3); }
.head-meta b { color: var(--ink-2); font-weight: 600; }
.headline { margin-top: 6px; font-size: 12px; color: var(--ink-2); }

body:not([data-ready]) .until-ready { display: none !important; }

.body { flex: 1; min-height: 0; padding: 14px 18px 18px; }
.card { padding: 13px 15px; margin-bottom: 13px; }
.card h2 { margin-bottom: 3px; }
.card-note { font-size: 11.5px; color: var(--ink-3); margin-bottom: 10px; }

/* ---- the grid --------------------------------------------------------- */
.cal { display: flex; gap: 0; overflow-x: auto; }
.hours { flex: none; width: 46px; }
/* The hour rail is positioned against the SAME height as the columns.
   Stacked fixed-height rows put 24:00 a third of the way down a 480px
   grid, so every send appeared hours away from its own label. */
.hours-inner { position: relative; }
.hour-row {
  position: absolute; right: 7px;
  font-size: 10px; font-family: var(--mono); color: var(--ink-3); line-height: 1;
}
.days { display: flex; gap: 7px; flex: 1; padding-top: 0; }
.day { flex: 1 0 132px; min-width: 132px; }
.day-head { height: 34px; }

/* All-day tray. A spread send has no hour, so it cannot live in the
   hour grid without inventing one — it goes above it, the way every
   calendar application has handled an all-day event for thirty years. */
.tray { display: flex; flex-direction: column; gap: 3px; margin-bottom: 4px; }
.tray-chip {
  padding: 2px 6px; border-radius: 5px; font-size: 10.5px; line-height: 1.35;
  background: var(--brand-wash); border: 1px dashed var(--brand-line); color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tray-chip b { font-weight: 600; }
.tray-chip span { color: var(--ink-3); font-family: var(--mono); font-size: 10px; }
.day-date { font-size: 12px; font-weight: 650; color: var(--ink); }
.day-sub { font-size: 10.5px; color: var(--ink-3); }
.day-sub--blocked { color: var(--warn); }

.col {
  position: relative; height: 480px;
  background: var(--sunk); border: 1px solid var(--rule); border-radius: var(--radius-sm);
  overflow: hidden;
}
.col--blocked {
  background: repeating-linear-gradient(
    135deg, var(--sunk), var(--sunk) 5px, var(--warn-wash) 5px, var(--warn-wash) 6px
  );
}
.quiet { position: absolute; left: 0; right: 0; background: var(--ink-3); opacity: .13; }
.quiet-tag {
  position: absolute; left: 4px; font-size: 9.5px; font-family: var(--mono);
  color: var(--ink-3); letter-spacing: .04em;
}
.hline { position: absolute; left: 0; right: 0; border-top: 1px solid var(--rule); opacity: .7; }
.hline--end { border-top: 1px solid var(--ink-3); opacity: .55; }

.send {
  position: absolute; left: 4px; right: 4px;
  padding: 3px 6px; border-radius: 5px;
  background: var(--card); border: 1px solid var(--brand-line);
  border-left: 3px solid var(--brand-strong);
  box-shadow: 0 1px 2px var(--shadow);
  overflow: hidden;
}
.send--flag { border-color: var(--warn-line); border-left-color: var(--warn); }
.send-time { display: block; font-size: 10px; font-family: var(--mono); color: var(--ink-3); }
.send-name {
  display: block; font-size: 11px; font-weight: 600; color: var(--ink);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.send-flag { display: block; font-size: 10px; color: var(--warn); font-weight: 600; }

.unplaced { margin-top: 12px; padding: 9px 11px; border-radius: var(--radius-sm); background: var(--sunk); }
.unplaced h3 { margin-bottom: 4px; }
.unplaced div { font-size: 11.5px; color: var(--ink-2); margin-top: 3px; }

.legend { margin-top: 10px; display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: var(--ink-3); align-items: center; }
.legend .swatch { width: 20px; height: 12px; border-radius: 3px; display: inline-block; vertical-align: -2px; margin-right: 5px; }
.legend .swatch--quiet { background: var(--ink-3); opacity: .3; }
.legend .swatch--spread { background: var(--brand-wash); border: 1px dashed var(--brand-line); }
.legend .swatch--blocked { background: repeating-linear-gradient(135deg, var(--sunk), var(--sunk) 4px, var(--warn-wash) 4px, var(--warn-wash) 5px); border: 1px solid var(--warn-line); }

/* ---- findings ---------------------------------------------------------- */
.f-row { display: flex; gap: 9px; padding: 8px 0; border-bottom: 1px solid var(--rule); }
.f-row:last-child { border-bottom: 0; }
.f-main { flex: 1; min-width: 0; }
.f-target { font-size: 12px; font-weight: 650; color: var(--ink); }
.f-kind { font-size: 10.5px; color: var(--ink-3); font-family: var(--mono); }
.f-detail { font-size: 11.5px; color: var(--ink-2); line-height: 1.45; margin-top: 2px; }

.caveats { font-size: 11.5px; color: var(--ink-2); line-height: 1.5; }
.caveats li { margin-bottom: 6px; }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }
`;

const JS = `
${WIDGET_PRELUDE}
${CALENDAR_ANCHOR_JS}

var data = null;
var GRID_H = 480;
// Room below the 24:00 rule for a late-evening send's block to hang into,
// so it can be positioned by its real time instead of shoved upward.
var SPILL_H = 52;

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};
var hhmm = function (h, m) {
  return String(h).padStart(2, "0") + ":" + String(m || 0).padStart(2, "0");
};

// Severity always travels as glyph + word + tone, never tone alone.
var SEVERITY = {
  high: { glyph: "\\u25cf", word: "HIGH", pill: "o-pill--warn" },
  medium: { glyph: "\\u25d0", word: "MEDIUM", pill: "o-pill--active" },
  low: { glyph: "\\u25cb", word: "LOW", pill: "o-pill--pending" }
};
function sevOf(s) { return SEVERITY[s] || SEVERITY.low; }
var SEV_ORDER = { high: 0, medium: 1, low: 2 };

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && Array.isArray(sc.calendar)) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && Array.isArray(parsed.calendar) ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || !Array.isArray(next.calendar)) return false;
  data = next;
  render();
  return true;
}

var DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Days with no sends are days, and a calendar that omits them puts
// Saturday next to Thursday and hides the quiet stretch entirely. Only
// the span the tool actually returned is filled in — nothing is invented
// beyond its first and last dated day.
function fillGapDays(calendar) {
  var days = (calendar || []).filter(function (d) { return /^\\d{4}-\\d{2}-\\d{2}$/.test(d.date); });
  if (days.length < 2) return calendar || [];
  var sorted = days.slice().sort(function (a, b) { return a.date.localeCompare(b.date); });
  var byDate = {};
  sorted.forEach(function (d) { byDate[d.date] = d; });

  var out = [];
  var cursor = new Date(sorted[0].date + "T00:00:00Z");
  var last = new Date(sorted[sorted.length - 1].date + "T00:00:00Z");
  var guard = 0;
  while (cursor <= last && guard++ < 120) {
    var key = cursor.toISOString().slice(0, 10);
    out.push(byDate[key] || {
      date: key,
      day: DAY_NAMES[cursor.getUTCDay()],
      sends: [],
      empty: true
    });
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return out;
}

function renderHours(trayH) {
  var rows = "";
  for (var h = 0; h <= 21; h += 3) {
    rows += '<div class="hour-row" style="top:' + ((h / 24) * GRID_H + 1).toFixed(1) + 'px">' +
      hhmm(h, 0) + "</div>";
  }
  var el = $("#hours");
  el.innerHTML = '<div style="height:' + (34 + trayH) + 'px"></div>' +
    '<div class="hours-inner" style="height:' + GRID_H + 'px">' + rows + "</div>";
}

function renderGrid() {
  var days = data.calendar || [];
  if (days.length === 0) {
    $("#cal-slot").innerHTML =
      '<div class="o-empty">Nothing scheduled in this window. An empty read is not a clean calendar \\u2014 no policy check ran.</div>';
    return;
  }
  var policy = data.policy || {};
  var allowed = policy.allowed_days || [];
  var bands = quietBands(policy.quiet_hours);
  var findings = data.findings || [];
  var unplaced = [];

  days = fillGapDays(days);

  // One tray height for every column, so the hour grids stay on the same
  // line across the week however many all-day sends any one day carries.
  var maxSpread = 0;
  days.forEach(function (d) {
    var n = (d.sends || []).filter(function (s) { return sendPlacement(s).kind === "spread"; }).length;
    if (n > maxSpread) maxSpread = n;
  });
  var trayH = maxSpread === 0 ? 0 : maxSpread * 25 + 4;

  var cols = days.map(function (d) {
    var blocked = allowed.length > 0 && allowed.indexOf(d.day) === -1;
    var inner = "";

    // Label the TALLEST band. Labelling bands[0] put the caption in the
    // three-hour sliver at the bottom of the day on the common 21:00-08:00
    // policy, where it reads as a footnote rather than as the shading's
    // explanation.
    var tallest = bands.reduce(function (best, b) {
      return !best || (b.to - b.from) > (best.to - best.from) ? b : best;
    }, null);
    bands.forEach(function (b) {
      var top = (b.from / 24) * GRID_H;
      var h = ((b.to - b.from) / 24) * GRID_H;
      inner += '<div class="quiet" style="top:' + top.toFixed(1) + 'px;height:' +
        h.toFixed(1) + 'px"></div>';
      if (b === tallest) {
        inner += '<div class="quiet-tag" style="top:' + (top + 3).toFixed(1) +
          'px">quiet ' + hhmm(policy.quiet_hours.start, 0) + '\\u2013' +
          hhmm(policy.quiet_hours.end, 0) + '</div>';
      }
    });
    for (var h = 3; h < 24; h += 3) {
      inner += '<div class="hline" style="top:' + ((h / 24) * GRID_H).toFixed(1) + 'px"></div>';
    }
    // The end of the day, drawn solid: anything below it is a send whose
    // block spills past midnight, not a send scheduled after midnight.
    inner += '<div class="hline hline--end" style="top:' + GRID_H + 'px"></div>';

    // Chronological, so the stack-avoidance below pushes later sends
    // down rather than shuffling the order a reader expects.
    var placed = (d.sends || []).map(function (s) {
      return { send: s, place: sendPlacement(s) };
    });
    placed.sort(function (a, b) {
      var ah = a.place.kind === "point" ? a.place.hour + a.place.minute / 60 : -1;
      var bh = b.place.kind === "point" ? b.place.hour + b.place.minute / 60 : -1;
      return ah - bh;
    });

    var lastBottom = -1;
    var tray = "";
    placed.forEach(function (p) {
      var flags = findingsForSend(findings, p.send.name);
      var worst = flags.slice().sort(function (a, b) {
        return SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
      })[0];
      var flagCls = worst ? " send--flag" : "";
      var flagLine = worst
        ? '<span class="send-flag">' + sevOf(worst.severity).glyph + " " +
          esc(worst.check.replace(/_/g, " ")) +
          (flags.length > 1 ? " +" + (flags.length - 1) : "") + "</span>"
        : "";
      var title = esc(
        p.send.name + " \\u2014 " + (p.send.type || "send") +
        (p.send.state ? " (" + p.send.state + ")" : "") +
        (p.place.kind === "point"
          ? " at " + hhmm(p.place.hour, p.place.minute) + (p.place.basis ? " " + p.place.basis : "")
          : " \\u2014 " + p.place.reason) +
        (p.send.tags && p.send.tags.length ? " \\u00b7 tags: " + p.send.tags.join(", ") : " \\u00b7 untagged") +
        flags.map(function (f) { return " \\u00b7 " + f.severity.toUpperCase() + ": " + f.detail; }).join("")
      );

      if (p.place.kind === "spread") {
        // Above the grid, never inside it: it has no hour to sit at.
        tray += '<div class="tray-chip" title="' + title + '">' +
          '<span>\\u25d0 all day</span> <b>' + esc(p.send.name) + "</b></div>";
        return;
      }
      if (p.place.kind !== "point") {
        unplaced.push({ send: p.send, reason: p.place.reason, date: d.date });
        return;
      }
      var top = ((p.place.hour + p.place.minute / 60) / 24) * GRID_H;
      if (top < lastBottom) top = lastBottom;
      var height = flagLine ? 48 : 34;
      // No clamping to the bottom of the day. A 23:30 send pushed up to
      // fit inside a 24-hour box lands on the 21:30 line, and the one
      // promise this grid makes is that a block sits at the clock the
      // audit read. The column carries a spill lane below the 24:00 rule
      // instead, so a late send hangs past midnight — which is true.
      lastBottom = top + height + 3;
      inner += '<div class="send' + flagCls + '" style="top:' + top.toFixed(1) +
        'px;height:' + height + 'px" title="' + title + '">' +
        '<span class="send-time">' + hhmm(p.place.hour, p.place.minute) + "</span>" +
        '<span class="send-name">' + esc(p.send.name) + "</span>" +
        flagLine + "</div>";
    });

    var count = (d.sends || []).length;
    return '<div class="day">' +
      '<div class="day-head">' +
        '<div class="day-date">' + esc(d.day) + " " + esc(String(d.date).slice(5)) + "</div>" +
        '<div class="day-sub' + (blocked ? " day-sub--blocked" : "") + '">' +
          (blocked ? "\\u2717 not an allowed day" : count + " send" + (count === 1 ? "" : "s")) +
        "</div>" +
      "</div>" +
      (trayH > 0 ? '<div class="tray" style="height:' + trayH + 'px">' + tray + "</div>" : "") +
      '<div class="col' + (blocked ? " col--blocked" : "") + '" style="height:' +
        (GRID_H + SPILL_H) + 'px">' + inner + "</div>" +
    "</div>";
  }).join("");

  $("#cal-slot").innerHTML = '<div class="cal"><div class="hours" id="hours"></div>' +
    '<div class="days">' + cols + "</div></div>";
  renderHours(trayH);

  // Everything the grid could not draw, from both directions: sends the
  // calendar carried but could not place, and sends the calendar never
  // carried at all.
  var drawn = days.reduce(function (n, d) { return n + (d.sends || []).length; }, 0);
  var gap = unaccountedSends((data.summary || {}).total_scheduled, drawn, findings);
  var notes = unplaced.map(function (u) {
    return "\\u26a0 " + esc(u.send.name || "(unnamed)") + " \\u2014 " + esc(u.reason);
  });
  if (gap.missing > 0) {
    notes.push(
      "\\u26a0 " + gap.missing + " scheduled send(s) never reached this grid" +
      (gap.named.length ? " \\u2014 " + esc(gap.named.join(", ")) : "") +
      " \\u2014 Braze returned no parseable send time, so there is no date to file them under. " +
      "The header count includes them; the grid cannot."
    );
  }
  $("#unplaced").innerHTML = notes.length === 0 ? "" :
    "<h3>" + notes.length + " send(s) not on the grid</h3>" +
    notes.map(function (n) { return "<div>" + n + "</div>"; }).join("");
}

function renderFindings() {
  var findings = (data.findings || []).slice().sort(function (a, b) {
    return SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
  });
  if (findings.length === 0) {
    $("#findings").innerHTML =
      '<div class="o-empty">No findings on the checks this tool can actually run. That is not the same as no audience collision \\u2014 see below.</div>';
    return;
  }
  var ANCHOR_WORD = { send: "send", day: "day", tag: "tag", other: "unanchored" };
  $("#findings").innerHTML = findings.map(function (f) {
    var sev = sevOf(f.severity);
    var a = anchorOf(f);
    return '<div class="f-row">' +
      '<span class="o-pill ' + sev.pill + '">' + sev.glyph + " " + sev.word + "</span>" +
      '<div class="f-main">' +
        '<div class="f-target">' + esc(f.send || "(no target named)") +
          ' <span class="f-kind">' + esc(ANCHOR_WORD[a.kind]) + " \\u00b7 " +
          esc(String(f.check || "").replace(/_/g, " ")) + "</span></div>" +
        '<div class="f-detail">' + esc(f.detail) + "</div>" +
      "</div>" +
    "</div>";
  }).join("");
}

function render() {
  var summary = data.summary || {};
  var policy = data.policy || {};
  var findings = data.findings || [];

  $("#count").className = "o-pill " + (findings.length === 0 ? "o-pill--ok" : "o-pill--warn");
  $("#count").textContent = findings.length === 0
    ? "\\u2713 0 findings"
    : "\\u25cf " + findings.length + " finding" + (findings.length === 1 ? "" : "s");

  $("#head-meta").innerHTML =
    "<span>Window <b>" + esc(String((data.window || {}).days || "?")) + " days</b></span>" +
    "<span>Scheduled <b>" + esc(String(summary.total_scheduled != null ? summary.total_scheduled : (summary.total || 0))) + "</b></span>" +
    (policy.quiet_hours
      ? "<span>Quiet <b>" + hhmm(policy.quiet_hours.start, 0) + "\\u2013" +
        hhmm(policy.quiet_hours.end, 0) + "</b></span>"
      : "") +
    (policy.clock_basis ? "<span>Clock read from <b>" + esc(policy.clock_basis) + "</b></span>" : "");

  $("#headline").textContent = summary.headline || "";

  renderGrid();
  renderFindings();

  $("#caveats").innerHTML = (data.caveats || []).map(function (c) {
    return "<li>" + esc(c) + "</li>";
  }).join("");

  document.body.dataset.ready = "1";
}

function reportText() {
  var lines = ["Send calendar \\u2014 " + ((data.summary || {}).headline || "")];
  (data.calendar || []).forEach(function (d) {
    lines.push("");
    lines.push(d.day + " " + d.date + ":");
    (d.sends || []).forEach(function (s) {
      var p = sendPlacement(s);
      var when = p.kind === "point"
        ? hhmm(p.hour, p.minute) + (p.basis ? " " + p.basis : "")
        : p.kind === "spread" ? "spread across timezones" : "no readable send time";
      lines.push("  - " + when + "  " + s.name +
        (s.tags && s.tags.length ? "  [" + s.tags.join(", ") + "]" : "  [untagged]"));
    });
  });
  if ((data.findings || []).length > 0) {
    lines.push("");
    lines.push("Findings:");
    data.findings.forEach(function (f) {
      lines.push("  - " + String(f.severity).toUpperCase() + " " + f.check + " \\u2014 " +
        f.send + ": " + f.detail);
    });
  }
  (data.caveats || []).forEach(function (c) { lines.push("", "Caveat: " + c); });
  return lines.join("\\n");
}

async function copyReport() {
  // The static ui:// document has no result yet, and reportText()
  // dereferences data on its first line.
  if (!data) { flash("Nothing to copy yet."); return; }
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Calendar copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Calendar copied."); }
    catch (e2) { flash("Copy blocked by the host."); }
    ta.remove();
  }
}

document.addEventListener("click", function (e) {
  if (e.target.closest("#copy")) { copyReport(); return; }
  if (e.target.closest("#send")) {
    if (!data) { flash("Nothing to send yet."); return; }
    orbitNotifyHost(reportText());
    flash("Sent to Claude.");
  }
});

if (app) {
  app.ontoolresult = function (result) {
    var next = dataFromToolResult(result);
    if (next) adopt(next);
  };
}

if (!adopt(bootstrap)) {
  $("#cal-slot").innerHTML = '<div class="o-empty">Waiting for the forward schedule\\u2026</div>';
}
`;

const BODY = `
<div class="wrap">
  <header class="head">
    <div class="head-top">
      <h1>Send calendar</h1>
      <span class="o-pill o-pill--pending until-ready" id="count">—</span>
    </div>
    <div class="head-meta" id="head-meta"></div>
    <div class="headline" id="headline"></div>
  </header>

  <div class="body o-scroll">
    <section class="o-card card">
      <h2>The forward window</h2>
      <div class="card-note">
        Each send at the local wall clock the audit read it on. Nothing is
        drawn at a time the server could not resolve.
      </div>
      <div id="cal-slot"></div>
      <div class="unplaced" id="unplaced"></div>
      <div class="legend until-ready">
        <span><span class="swatch swatch--quiet"></span>quiet hours</span>
        <span><span class="swatch swatch--spread"></span>all-day tray: spread delivery, no single send time</span>
        <span><span class="swatch swatch--blocked"></span>not an allowed send day</span>
      </div>
    </section>

    <section class="o-card card until-ready">
      <h2>Findings</h2>
      <div class="card-note">Each one named against the send, day or tag it concerns.</div>
      <div id="findings"></div>
    </section>

    <section class="o-card card until-ready">
      <h2>What this calendar cannot see</h2>
      <ul class="caveats" id="caveats"></ul>
    </section>
  </div>

  <footer class="foot">
    <span class="sent" id="sent" role="status" aria-live="polite"></span>
    <span class="spacer"></span>
    <button class="o-btn" id="copy">Copy calendar</button>
    <button class="o-btn o-btn--primary" id="send">Send to Claude</button>
  </footer>
</div>
`;

/** Build the send-calendar document for an orbit_audit_send_calendar result. */
export function renderSendCalendar(data, options) {
  return buildWidgetHtml({
    title: "Orbit — send calendar",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
  });
}

export const SEND_CALENDAR_URI = "ui://orbit/send-calendar.html";
