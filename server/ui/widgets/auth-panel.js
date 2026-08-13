/**
 * Auth panel — the widget behind orbit_check_email_auth.
 *
 * The tool resolves three real DNS records and returns them as nested
 * JSON. Two of the three findings it produces are POSITIONS on a scale,
 * and a position written as a sentence is the one thing prose is worst at:
 *
 *   "SPF record uses 12 DNS lookups (RFC 7208 limit: 10)" is a place on a
 *   budget. Twelve pips overflowing a ten-pip track says how far over,
 *   and therefore how many include: chains have to go.
 *
 *   "Policy is p=none (monitor-only)" is a rung on a ladder with three
 *   rungs and a floor Gmail enforces. Drawn, the next step is the thing
 *   you are looking at. Written, you have to already know the ladder.
 *
 * THREE RULES THIS FILE IS BUILT AROUND
 *
 *   1. ABSENT IS NOT ZERO. `lookup_count` only exists when a single SPF
 *      record was found and parsed. On the no-record and multiple-record
 *      paths the key is missing — and a meter that renders a missing
 *      count as 0/10 draws a comfortable, healthy, entirely fictional
 *      budget on a domain that cannot pass SPF at all. Every scale in
 *      this file abstains in words when its input is absent. Same for
 *      the ladder: "no DMARC record published" is a different state from
 *      "p=none published", and conflating them tells a sender they are
 *      one rung from enforcement when they are not on the ladder.
 *
 *   2. Verdicts are a glyph AND a word, never a hue. This is a
 *      deliverability report; it gets read in screenshots, forwarded to
 *      an IT team, and printed.
 *
 *   3. The literal TXT strings are shown. This is the artifact a
 *      marketer forwards to whoever actually owns the DNS zone, and that
 *      person does not want the summary — they want the record.
 */

import { buildWidgetHtml, WIDGET_PRELUDE } from "../shell.js";

/**
 * The two scale readings, as plain source, so a test can execute them.
 *
 * Both are pure functions of the tool's payload and both have an
 * abstention path that no DOM assertion would ever notice was missing —
 * an SPF meter reading 0/10 and one reading "not counted" are the same
 * markup shape and opposite claims. That is exactly the sort of thing
 * that belongs where a test can call it.
 */
export const AUTH_SCALE_JS = `
/**
 * Where the SPF record sits against RFC 7208's 10-lookup budget.
 *
 * Returns { known:false, why } when the tool did not count — which it
 * cannot do when there is no single record to walk. Returning 0 there
 * would draw an empty, healthy-looking budget on a domain with no SPF.
 */
function spfBudget(spf) {
  if (!spf) return { known: false, why: "no SPF result in the payload" };
  // not_measured FIRST, and quoting the tool's own reason. Falling through
  // to the record count said "no SPF record to count lookups in" over a
  // lookup that never returned an answer — a claim about the zone, made
  // from nothing, in the artifact that gets forwarded to whoever owns it.
  if (spf.not_measured) {
    return { known: false, measured: false, why: laneReason(spf, "the SPF lookup did not return an answer") };
  }
  var n = spf.lookup_count;
  if (typeof n !== "number" || !isFinite(n)) {
    // A walk that started and did not finish reports a floor. Saying "the
    // tool did not report a lookup count" discards a number it did report.
    if (typeof spf.lookup_count_at_least === "number") {
      return {
        known: false,
        why: "the include: chain could not be walked to the end (" +
          (spf.lookup_count_incomplete_reason || "reason not given") +
          "), so at least " + spf.lookup_count_at_least +
          " lookups are used and the real total is higher"
      };
    }
    var recs = (spf.records || []).length;
    return {
      known: false,
      why: recs === 0
        ? "no SPF record to count lookups in"
        : recs > 1
          ? "more than one SPF record published \\u2014 the count is undefined until they are merged"
          : "the tool did not report a lookup count"
    };
  }
  return { known: true, used: n, cap: 10, over: Math.max(0, n - 10) };
}

/** The tool's own words for why a lane abstained, or a neutral fallback. */
function laneReason(lane, fallback) {
  if (lane && lane.issues && lane.issues.length) return String(lane.issues[0]);
  if (lane && lane.reason) return "the lookup did not return an answer (" + String(lane.reason) + ")";
  return fallback;
}

/**
 * Which rung of the DMARC enforcement ladder this domain is on.
 *
 * stop is null when NOTHING is published. "not on the ladder" and "on
 * the bottom rung" are different facts about a sender and the drawing
 * must not merge them.
 */
function dmarcRung(dmarc) {
  var rungs = ["none", "quarantine", "reject"];
  if (!dmarc) return { stop: null, rungs: rungs, why: "no DMARC result in the payload" };
  // Same rule as the SPF meter: an unanswered lookup is not an absent
  // record. "No DMARC record published at _dmarc" is a fact about the
  // zone and this branch never looked at the zone.
  if (dmarc.not_measured) {
    return {
      stop: null, rungs: rungs, measured: false,
      why: laneReason(dmarc, "the DMARC lookup did not return an answer")
    };
  }
  var published = (dmarc.records || []).length > 0;
  var p = String((dmarc.tags && dmarc.tags.p) || "").toLowerCase();
  if (!published) return { stop: null, rungs: rungs, why: "no DMARC record published at _dmarc" };
  if (rungs.indexOf(p) === -1) {
    return { stop: null, rungs: rungs, published: true, why: p ? ("unrecognised policy p=" + p) : "record published with no p= tag" };
  }
  return { stop: rungs.indexOf(p), rungs: rungs, published: true, policy: p, floor: 1 };
}

var V = {
  pass: { glyph: "\\u2713", word: "Pass", cls: "ok" },
  warn: { glyph: "\\u25B3", word: "Warn", cls: "active" },
  fail: { glyph: "\\u2715", word: "Fail", cls: "warn" },
  // The state email-auth.js was deliberately given and this file had no
  // word for. verdict is null on a lane that never got an answer, and
  // null fell through V[verdict] straight onto warn.
  not_measured: { glyph: "\\u25CB", word: "Not measured", cls: "pending" }
};

/**
 * The verdict chip. It lives here, beside the scales, for the same
 * reason they do: whether a null verdict draws "Warn" or "Not measured"
 * is the difference between a claim about a domain and an abstention,
 * and no DOM assertion would ever notice — both are one pill in one slot.
 */
function pill(verdict, notMeasured) {
  // not_measured is checked BEFORE the fall-through, never after it.
  var v = notMeasured ? V.not_measured : (V[verdict] || V.warn);
  return '<span class="o-pill o-pill--' + v.cls + '">' + v.glyph + " " + v.word + "</span>";
}
`;

const CSS = `
body { height: 100vh; overflow: hidden; }
.wrap { display: flex; flex-direction: column; height: 100vh; }

.head { padding: 13px 18px 11px; border-bottom: 1px solid var(--rule); background: var(--card); }
.head-top { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.spacer { flex: 1; }
.domain { font-family: var(--mono); font-size: 12.5px; color: var(--ink-2); }
.head-meta { margin-top: 7px; display: flex; gap: 8px; flex-wrap: wrap; }

body:not([data-ready]) .until-ready { display: none !important; }
body[data-ready] .when-empty { display: none !important; }
.body { flex: 1; min-height: 0; padding: 14px 18px 18px; }
.card { padding: 12px 14px; margin-bottom: 14px; }
.card-top { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; margin-bottom: 8px; }
.card-note { font-size: 11.5px; color: var(--ink-3); }
.cap { margin-top: 9px; font-size: 11px; color: var(--ink-3); line-height: 1.45; }

/* ---- the three lanes ------------------------------------------------- */
.lane { padding: 11px 0; border-top: 1px solid var(--rule); }
.lane:first-child { border-top: 0; padding-top: 2px; }
.lane-top { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.lane-name { font-size: 13px; font-weight: 700; letter-spacing: .02em; }
.lane-say { font-size: 11.5px; color: var(--ink-3); }

/* ---- the SPF lookup budget ------------------------------------------- */
.budget { margin-top: 9px; }
.pips { display: flex; align-items: flex-end; gap: 3px; flex-wrap: wrap; }
.pip {
  width: 15px; height: 19px; border-radius: 3px;
  background: var(--sunk); border: 1px solid var(--rule);
}
.pip--used { background: var(--ok); border-color: var(--ok-strong); }
.pip--over { background: var(--warn); border-color: var(--warn); }
.pip--cap {
  width: 0; height: 25px; border: 0; border-left: 2px dashed var(--ink-3);
  margin: 0 4px; background: transparent; border-radius: 0;
}
.pip-more { align-self: center; margin-left: 4px; font-size: 11px; font-weight: 700; color: var(--warn); }
.budget-say { margin-top: 5px; font-size: 11.5px; color: var(--ink-2); }
.budget-say b { font-variant-numeric: tabular-nums; }
.abstain {
  margin-top: 9px; padding: 7px 10px; border-radius: var(--radius-sm);
  background: var(--sunk); border: 1px dashed var(--rule);
  font-size: 11.5px; color: var(--ink-2);
}

/* ---- the DMARC enforcement ladder ------------------------------------ */
.ladder { margin-top: 11px; display: flex; align-items: stretch; gap: 0; }
.rung {
  flex: 1; padding: 7px 9px 8px; text-align: center;
  border: 1px solid var(--rule); border-right-width: 0; background: var(--card);
}
.rung:first-child { border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
.rung:last-child { border-right-width: 1px; border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
.rung-name { font-family: var(--mono); font-size: 11.5px; font-weight: 700; color: var(--ink-2); }
.rung-note { display: block; margin-top: 2px; font-size: 10px; color: var(--ink-3); line-height: 1.3; }
.rung--here { background: var(--brand-wash); border-color: var(--brand-line); }
.rung--here .rung-name { color: var(--brand-ink); }
.rung--here .rung-you {
  display: block; margin-bottom: 1px;
  font-size: 9.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
  color: var(--brand-ink);
}
.rung--past { background: var(--sunk); }
.rung--floor .rung-name::after {
  content: " \\2691"; color: var(--active-strong);
}
.ladder-say { margin-top: 6px; font-size: 11.5px; color: var(--ink-2); }

/* ---- DKIM selectors --------------------------------------------------- */
.sels { margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap; }
.sel {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: 999px;
  font-family: var(--mono); font-size: 11px; font-weight: 600;
  background: var(--ok-wash); color: var(--ok-strong); border: 1px solid var(--ok-line);
}
.sel--empty { background: var(--warn-wash); color: var(--warn); border-color: var(--warn-line); }

/* ---- the records themselves ------------------------------------------ */
.rec { margin-bottom: 10px; }
.rec:last-child { margin-bottom: 0; }
.rec-host {
  display: block; font-size: 9.5px; font-family: var(--mono); font-weight: 700;
  letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); margin-bottom: 3px;
}
.rec-txt {
  display: block; padding: 8px 10px; border-radius: var(--radius-sm);
  background: var(--sunk); border: 1px solid var(--rule);
  font-family: var(--mono); font-size: 11.5px; line-height: 1.55;
  color: var(--ink); word-break: break-all; white-space: pre-wrap;
}
.rec-none { font-size: 11.5px; color: var(--ink-3); }

/* ---- issues ---------------------------------------------------------- */
.iss-card { padding: 0; }
.iss { display: flex; gap: 10px; align-items: flex-start; padding: 9px 14px; border-bottom: 1px solid var(--rule); }
.iss:last-child { border-bottom: 0; }
.iss-body { min-width: 0; }
.iss-text { font-size: 12.5px; color: var(--ink); }
.iss-fix { display: block; margin-top: 2px; font-size: 11.5px; color: var(--ink-3); }

.foot { border-top: 1px solid var(--rule); background: var(--card); padding: 10px 18px; display: flex; gap: 8px; align-items: center; }
.sent { font-size: 11.5px; color: var(--ok-strong); }
`;

const JS = `
${WIDGET_PRELUDE}
${AUTH_SCALE_JS}

var data = null;

var LANES = [
  { key: "spf",   name: "SPF",   say: "Who may send as you" },
  { key: "dmarc", name: "DMARC", say: "What happens when they fail" },
  { key: "dkim",  name: "DKIM",  say: "The signature on the mail" }
];

var $ = function (s) { return document.querySelector(s); };
var esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};
/** True when no lane returned an answer — nothing at all was measured. */
function nothingMeasured() {
  var lanes = LANES.map(function (l) { return data[l.key]; }).filter(Boolean);
  return lanes.length > 0 && lanes.every(function (l) { return l.not_measured === true; });
}

function dataFromToolResult(result) {
  if (!result) return null;
  var sc = result.structuredContent;
  if (sc && typeof sc.domain === "string" && sc.overall) return sc;
  var block = (result.content || []).find(function (c) { return c.type === "text"; });
  if (!block) return null;
  try {
    var parsed = JSON.parse(block.text);
    return parsed && typeof parsed.domain === "string" && parsed.overall ? parsed : null;
  } catch (e) { return null; }
}

function adopt(next) {
  if (!next || typeof next.domain !== "string" || !next.overall) return false;
  data = next;
  render();
  return true;
}

/** The SPF lane: the lookup budget, or an honest refusal to draw one. */
function renderSpf(spf) {
  var b = spfBudget(spf);
  if (b.measured === false) {
    return '<div class="abstain">\\u25CB Not measured \\u2014 ' + esc(b.why) + "</div>";
  }
  if (!b.known) {
    return '<div class="abstain">\\u25CB Lookup budget not drawn \\u2014 ' + esc(b.why) + ".</div>";
  }
  // A record can reach absurd lookup counts; past 20 pips the row stops
  // being a picture. Truncate the DRAWING and say so on it, rather than
  // drawing 20 and letting it read as 20.
  var MAX_PIPS = 20;
  var pips = "";
  var drawn = Math.min(b.used, MAX_PIPS);
  for (var i = 0; i < Math.max(drawn, b.cap); i++) {
    if (i === b.cap) pips += '<span class="pip pip--cap" aria-hidden="true"></span>';
    var cls = i >= b.used ? "pip" : i >= b.cap ? "pip pip--over" : "pip pip--used";
    pips += '<span class="' + cls + '"></span>';
  }
  if (b.used > MAX_PIPS) {
    pips += '<span class="pip-more">+' + (b.used - MAX_PIPS) + " more</span>";
  }
  var say = b.over > 0
    ? "<b>" + b.used + "</b> DNS lookups against RFC 7208's cap of <b>10</b> \\u2014 <b>" + b.over +
      "</b> over. Every send is a permerror until the include: chain is shortened."
    : "<b>" + b.used + "</b> of <b>10</b> DNS lookups used. <b>" + (10 - b.used) + "</b> left before SPF permerrors.";
  return '<div class="budget"><div class="pips" role="img" aria-label="' +
    esc(b.used + " of 10 SPF DNS lookups used") + '">' + pips + "</div>" +
    '<div class="budget-say">' + say + "</div></div>";
}

/** The DMARC lane: the enforcement ladder, with the floor Gmail enforces. */
function renderDmarc(dmarc) {
  var r = dmarcRung(dmarc);
  // No ladder at all when nothing was read. Drawing the three rungs with
  // nobody standing on them is itself the claim that we looked and found
  // the domain absent from it.
  if (r.measured === false) {
    return '<div class="abstain">\\u25CB Not measured \\u2014 ' + esc(r.why) +
      " The enforcement ladder is not drawn, because nothing was read.</div>";
  }
  var NOTE = {
    none: "monitor only",
    quarantine: "spam folder",
    reject: "bounced"
  };
  var html = '<div class="ladder" role="img" aria-label="' +
    esc(r.stop === null ? "DMARC policy not on the ladder" : "DMARC policy is p=" + r.rungs[r.stop]) + '">';
  r.rungs.forEach(function (name, i) {
    var cls = "rung";
    if (r.stop !== null && i < r.stop) cls += " rung--past";
    if (r.stop === i) cls += " rung--here";
    if (i === 1) cls += " rung--floor";
    html += '<div class="' + cls + '">' +
      (r.stop === i ? '<span class="rung-you">you are here</span>' : "") +
      '<span class="rung-name">p=' + esc(name) + "</span>" +
      '<span class="rung-note">' + esc(NOTE[name]) + "</span></div>";
  });
  html += "</div>";
  if (r.stop === null) {
    html += '<div class="abstain">\\u25CB Not placed on the ladder \\u2014 ' + esc(r.why) + ".</div>";
  } else {
    var rua = dmarc && dmarc.tags && dmarc.tags.rua;
    html += '<div class="ladder-say">' +
      (r.stop >= 1
        ? "\\u2713 At or above the p=quarantine floor \\u2691 that Gmail and Yahoo require of senders over 5k/day."
        : "\\u25B3 Below the p=quarantine floor \\u2691 that Gmail and Yahoo require of senders over 5k/day \\u2014 one rung to go.") +
      " " + (rua ? "Aggregate reports go to " + esc(String(rua)) + "." : "No rua= address, so nothing reports who is spoofing you.") +
      "</div>";
  }
  return html;
}

/** The DKIM lane: which selectors answered, and whether the key is live. */
function renderDkim(dkim) {
  if (!dkim) return "";
  if (dkim.not_measured) {
    return '<div class="abstain">\\u25CB Not measured \\u2014 ' +
      esc(laneReason(dkim, "no selector lookup returned an answer")) + "</div>";
  }
  var recs = dkim.records || [];
  if (!recs.length) {
    var probed = typeof dkim.selectors_checked === "number"
      ? dkim.selectors_checked + " common selectors were probed and none answered"
      : "none of the common selectors answered";
    return '<div class="abstain">\\u25CB ' + probed +
      ". That is not proof of no DKIM \\u2014 an ESP-specific selector would not be in the list. Pass yours to settle it.</div>";
  }
  var chips = recs.map(function (r) {
    var dead = (r.issues || []).length > 0;
    return '<span class="sel' + (dead ? " sel--empty" : "") + '">' +
      (dead ? "\\u2715" : "\\u2713") + " " + esc(r.selector) +
      (dead ? " \\u00b7 empty key" : " \\u00b7 key live") + "</span>";
  }).join("");
  return '<div class="sels">' + chips + "</div>";
}

function renderLanes() {
  $("#lanes").innerHTML = LANES.map(function (l) {
    var lane = data[l.key];
    if (!lane) return "";
    var scale = l.key === "spf" ? renderSpf(lane)
      : l.key === "dmarc" ? renderDmarc(lane)
      : renderDkim(lane);
    return '<div class="lane"><div class="lane-top">' + pill(lane.verdict, lane.not_measured) +
      '<span class="lane-name">' + esc(l.name) + "</span>" +
      '<span class="lane-say">' + esc(l.say) + "</span></div>" + scale + "</div>";
  }).join("");
}

function renderRecords() {
  var out = [];
  var spf = data.spf || {};
  var dmarc = data.dmarc || {};
  var dkim = data.dkim || {};
  out.push(rec("TXT " + data.domain + "  (SPF)", spf.records || [], spf.not_measured));
  out.push(rec("TXT _dmarc." + data.domain + "  (DMARC)", dmarc.records || [], dmarc.not_measured));
  (dkim.records || []).forEach(function (r) {
    out.push(rec("TXT " + (r.host || r.selector) + "  (DKIM)", [r.record]));
  });
  $("#records").innerHTML = out.join("");
}
function rec(host, values, notMeasured) {
  // "Nothing published at this name" is a statement about the zone. This
  // card is the thing a marketer forwards to whoever owns that zone, so an
  // unresolved name has to say unresolved, not absent.
  var empty = notMeasured
    ? '<span class="rec-none">\\u25CB Not resolved \\u2014 this is not a claim about the zone.</span>'
    : '<span class="rec-none">\\u2715 Nothing published at this name.</span>';
  return '<div class="rec"><span class="rec-host">' + esc(host) + "</span>" +
    (values.length
      ? values.map(function (v) { return '<code class="rec-txt">' + esc(v) + "</code>"; }).join("")
      : empty) +
    "</div>";
}

function issueList() {
  var out = [];
  LANES.forEach(function (l) {
    var lane = data[l.key];
    if (!lane) return;
    (lane.issues || []).forEach(function (text) {
      out.push({
        lane: l.name, verdict: lane.verdict, not_measured: lane.not_measured,
        text: text, fix: lane.recommendation
      });
    });
  });
  return out;
}

function renderIssues() {
  var issues = issueList();
  if (!issues.length) {
    $("#issues").innerHTML = '<div class="o-empty">\\u2713 Nothing flagged on SPF, DMARC or DKIM.</div>';
    return;
  }
  var seen = {};
  $("#issues").innerHTML = issues.map(function (i) {
    var fix = seen[i.lane] ? "" : i.fix;
    seen[i.lane] = true;
    return '<div class="iss">' + pill(i.verdict, i.not_measured) + '<div class="iss-body">' +
      '<span class="iss-text">' + esc(i.lane) + " \\u2014 " + esc(i.text) + "</span>" +
      (fix ? '<span class="iss-fix">Fix: ' + esc(fix) + "</span>" : "") +
      "</div></div>";
  }).join("");
}

function render() {
  // worstVerdict() downgrades to "warn" when any lane abstained, which is
  // right when SOMETHING was measured. When nothing was, "Warn" is a
  // verdict on a domain nobody looked at.
  var none = nothingMeasured();
  var v = none ? V.not_measured : (V[data.overall] || V.warn);
  var p = $("#overall");
  p.className = "o-pill o-pill--" + v.cls;
  p.textContent = v.glyph + " " + v.word;
  $("#domain").textContent = data.domain;
  $("#head-meta").innerHTML = LANES.map(function (l) {
    var lane = data[l.key];
    if (!lane) return "";
    var lv = lane.not_measured ? V.not_measured : (V[lane.verdict] || V.warn);
    return '<span class="o-pill o-pill--' + lv.cls + '">' + lv.glyph + " " + esc(l.name) + "</span>";
  }).join("");

  document.body.dataset.ready = "1";
  renderLanes();
  renderRecords();
  renderIssues();
}

function reportText() {
  // This is the artifact that gets forwarded to whoever owns the DNS, so
  // every line of it obeys the same rule the panel does: an unresolved
  // lookup is reported as unresolved, never as an absent record.
  var laneWord = function (lane) {
    return lane && lane.not_measured ? "NOT MEASURED" : String((lane || {}).verdict || "?").toUpperCase();
  };
  var lines = [
    "Email auth \\u2014 " + data.domain,
    "Overall: " + (nothingMeasured() ? "NOT MEASURED \\u2014 no lookup returned an answer"
                                     : String(data.overall || "").toUpperCase()),
    ""
  ];
  var spf = data.spf || {};
  var b = spfBudget(data.spf);
  lines.push("SPF: " + laneWord(data.spf) + " \\u2014 " +
    (b.known ? b.used + " of 10 DNS lookups used" + (b.over ? " (" + b.over + " OVER the cap)" : "")
             : (b.measured === false ? b.why : "lookup budget not counted (" + b.why + ")")));
  var r = dmarcRung(data.dmarc);
  lines.push("DMARC: " + laneWord(data.dmarc) + " \\u2014 " +
    (r.measured === false ? r.why
      : r.stop === null ? "not on the enforcement ladder (" + r.why + ")"
                        : "p=" + r.rungs[r.stop] + (r.stop >= 1 ? " (at or above the Gmail/Yahoo floor)" : " (below the Gmail/Yahoo p=quarantine floor)")));
  var dk = data.dkim || {};
  lines.push("DKIM: " + laneWord(data.dkim) + " \\u2014 " +
    (dk.not_measured ? laneReason(dk, "no selector lookup returned an answer")
      : (dk.records || []).length
        ? (dk.records || []).map(function (x) { return x.selector + ((x.issues || []).length ? " (empty key)" : ""); }).join(", ")
        : "no selector answered among the common defaults"));
  lines.push("");
  issueList().forEach(function (i) { lines.push("[" + i.lane + "] " + i.text); });
  lines.push("");
  lines.push("Records as published:");
  var published = 0;
  (spf.records || []).forEach(function (x) { published++; lines.push("  " + data.domain + " : " + x); });
  (data.dmarc && data.dmarc.records || []).forEach(function (x) { published++; lines.push("  _dmarc." + data.domain + " : " + x); });
  (dk.records || []).forEach(function (x) { published++; lines.push("  " + (x.host || x.selector) + " : " + x.record); });
  if (!published) {
    lines.push(nothingMeasured()
      ? "  (none read \\u2014 no lookup returned an answer, so this list is empty for want of a reply, not for want of records)"
      : "  (none found)");
  }
  return lines.join("\\n");
}

async function copyReport() {
  var text = reportText();
  try {
    await navigator.clipboard.writeText(text);
    flash("Auth read-out copied.");
  } catch (e) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); flash("Auth read-out copied."); }
    catch (e2) { flash("Copy blocked by the host."); }
    ta.remove();
  }
}

document.addEventListener("click", function (e) {
  var hit = e.target.closest("#copy") || e.target.closest("#send");
  if (!hit) return;
  // The static ui:// resource is rendered with no data and both buttons
  // are live on it. Reading the read-out off a null payload throws before
  // anything reaches the clipboard, and the user sees a button that did
  // nothing at all.
  if (!data) { flash("Nothing to copy yet \\u2014 waiting for a result."); return; }
  if (hit.id === "copy") { copyReport(); return; }
  orbitNotifyHost(reportText());
  flash("Sent to Claude.");
});

if (app) {
  app.ontoolresult = function (result) {
    var next = dataFromToolResult(result);
    if (next) adopt(next);
  };
}

adopt(bootstrap);
`;

const BODY = `
<div class="wrap">
  <header class="head">
    <div class="head-top">
      <h1>Email auth</h1>
      <span class="o-pill o-pill--pending until-ready" id="overall">—</span>
      <span class="domain until-ready" id="domain"></span>
      <span class="spacer"></span>
    </div>
    <div class="head-meta" id="head-meta"></div>
  </header>

  <div class="body o-scroll">
    <section class="o-card card when-empty">
      <div class="o-empty">
        Waiting for a domain — run orbit_check_email_auth to see how SPF, DMARC and DKIM
        are actually published.
      </div>
    </section>

    <section class="o-card card until-ready">
      <div class="card-top">
        <h2>The three records</h2>
        <span class="card-note">Resolved live from DNS.</span>
      </div>
      <div id="lanes"></div>
      <div class="cap">
        The SPF budget and the DMARC ladder are drawn only when the lookup ran. Where a count or a
        policy is absent the scale says so rather than showing an empty one — a missing SPF record
        and a clean one are not the same picture.
      </div>
    </section>

    <section class="o-card card until-ready">
      <div class="card-top">
        <h2>As published</h2>
        <span class="card-note">The exact TXT strings — this is the part your DNS owner needs.</span>
      </div>
      <div id="records"></div>
    </section>

    <section class="o-card iss-card until-ready" id="issues"></section>
  </div>

  <footer class="foot">
    <span class="sent" id="sent" role="status" aria-live="polite"></span>
    <span class="spacer"></span>
    <button class="o-btn" id="copy">Copy read-out</button>
    <button class="o-btn o-btn--primary" id="send">Send to Claude</button>
  </footer>
</div>
`;

/** Build the auth-panel document for an orbit_check_email_auth result. */
export function renderAuthPanel(data, options) {
  return buildWidgetHtml({
    title: "Orbit — email auth",
    body: BODY,
    css: CSS,
    js: JS,
    data,
    bridge: options?.bridge !== false,
    branding: options?.branding !== false,
  });
}

export const AUTH_PANEL_URI = "ui://orbit/auth-panel.html";
