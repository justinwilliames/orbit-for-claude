// Gmail Postmaster Tools data interpreter. Users paste either a raw
// CSV export from Postmaster (the data Google exposes via the UI
// download) OR a structured snapshot { domain_reputation, ip_reputation,
// spam_rate_pct, authenticated_traffic_pct, ... } and Orbit produces
// a readable diagnosis with urgency ratings and specific actions.
//
// No network I/O — purely a parser + interpreter. Users own their
// Postmaster access; Orbit never fetches from Google directly.

const REPUTATION_BANDS = ["bad", "low", "medium", "high"];
const BAND_RANK = { bad: 0, low: 1, medium: 2, high: 3 };

export function parsePostmasterSignal({ csv, snapshot }) {
  if ((!csv || typeof csv !== "string") && !snapshot) {
    return {
      status: "needs_inputs",
      missing: ["csv or snapshot"],
      message:
        "Provide Postmaster data as a CSV export string, or as a snapshot object with { spam_rate_pct, domain_reputation, ip_reputation, authenticated_traffic_pct, delivery_errors_pct }.",
    };
  }

  const parsed = csv ? parseCsvSeries(csv) : { snapshot: normaliseSnapshot(snapshot), source: "snapshot" };
  if (!parsed || parsed.error || !parsed.snapshot || parsed.snapshot.error) {
    return {
      status: "error",
      message:
        parsed?.error ??
        parsed?.snapshot?.error ??
        "Could not parse the supplied Postmaster data. Use the CSV export from Postmaster's UI or pass a snapshot object.",
    };
  }
  const data = parsed.snapshot;

  const findings = [];

  // 1. Spam rate — hardest signal Gmail uses.
  if (data.spam_rate_pct != null) {
    if (data.spam_rate_pct >= 0.3) {
      findings.push({
        severity: "fail",
        metric: "spam_rate",
        value: data.spam_rate_pct,
        threshold: 0.3,
        message:
          `Spam rate ${data.spam_rate_pct}% — above Gmail's 0.3% red zone. Sustained over this, inbox placement will collapse.`,
        action:
          "Stop sending to cold / disengaged segments immediately. Diagnose the trigger (new segment, new content, auth change) before resuming full volume.",
      });
    } else if (data.spam_rate_pct >= 0.1) {
      findings.push({
        severity: "warn",
        metric: "spam_rate",
        value: data.spam_rate_pct,
        threshold: 0.1,
        message: `Spam rate ${data.spam_rate_pct}% — above the 0.1% green-band target.`,
        action:
          "Tighten your engaged-sender segment; suppress 90+ day inactives; review any recent content/segment changes.",
      });
    } else {
      findings.push({
        severity: "pass",
        metric: "spam_rate",
        value: data.spam_rate_pct,
        message: `Spam rate ${data.spam_rate_pct}% — within the green band.`,
      });
    }
  }

  // 2. Domain reputation band.
  if (data.domain_reputation) {
    const band = String(data.domain_reputation).toLowerCase();
    if (band === "bad") {
      findings.push({
        severity: "fail",
        metric: "domain_reputation",
        value: band,
        message: "Domain reputation is bad — Gmail will actively spam-folder mail from this domain.",
        action:
          "Run the reputation-recovery protocol. Cut volume to top-engaged tier only, hold there until reputation climbs to medium for 7+ consecutive days.",
      });
    } else if (band === "low") {
      findings.push({
        severity: "warn",
        metric: "domain_reputation",
        value: band,
        message: "Domain reputation is low — inbox placement will be inconsistent.",
        action:
          "Audit complaint rate, bounce rate, and authentication alignment. Avoid volume spikes for 2-4 weeks.",
      });
    } else if (band === "medium" || band === "high") {
      findings.push({
        severity: "pass",
        metric: "domain_reputation",
        value: band,
        message: `Domain reputation is ${band} — healthy.`,
      });
    }
  }

  // 3. IP reputation band(s).
  if (data.ip_reputation) {
    if (Array.isArray(data.ip_reputation)) {
      for (const ip of data.ip_reputation) {
        const band = String(ip.reputation ?? "").toLowerCase();
        const baseMsg = `IP ${ip.ip ?? "(unnamed)"} reputation: ${band}.`;
        if (band === "bad" || band === "low") {
          findings.push({
            severity: band === "bad" ? "fail" : "warn",
            metric: "ip_reputation",
            value: { ip: ip.ip, reputation: band },
            message: baseMsg,
            action:
              band === "bad"
                ? "Stop using this IP for bulk sending. Migrate volume to a healthy IP while you diagnose."
                : "Tighten audience selection on this IP; avoid volume spikes.",
          });
        } else if (band === "medium" || band === "high") {
          findings.push({
            severity: "pass",
            metric: "ip_reputation",
            value: { ip: ip.ip, reputation: band },
            message: `${baseMsg} Healthy.`,
          });
        }
      }
    } else {
      const band = String(data.ip_reputation).toLowerCase();
      if (band === "bad" || band === "low") {
        findings.push({
          severity: band === "bad" ? "fail" : "warn",
          metric: "ip_reputation",
          value: band,
          message: `IP reputation is ${band}.`,
          action:
            band === "bad"
              ? "Migrate bulk volume to a healthy IP; investigate the trigger immediately."
              : "Tighten audience selection on this IP; avoid volume spikes.",
        });
      } else if (band === "medium" || band === "high") {
        // The array branch has always scored a healthy IP; the scalar branch
        // dropped it on the floor. A snapshot carrying nothing but a healthy
        // scalar IP therefore produced zero findings — which now means
        // "nothing was checked", so the omission would read as an abstention
        // on data that was in fact read and was in fact fine.
        findings.push({
          severity: "pass",
          metric: "ip_reputation",
          value: band,
          message: `IP reputation is ${band} — healthy.`,
        });
      }
    }
  }

  // 4. Authenticated traffic — DMARC / SPF / DKIM alignment.
  if (data.authenticated_traffic_pct != null && data.authenticated_traffic_pct < 99) {
    findings.push({
      severity: data.authenticated_traffic_pct < 95 ? "fail" : "warn",
      metric: "authentication",
      value: data.authenticated_traffic_pct,
      message: `Authenticated traffic ${data.authenticated_traffic_pct}% — under 99% indicates DKIM or DMARC alignment gaps.`,
      action:
        "Run orbit_check_email_auth; fix any selector / alignment issues; confirm every sending source signs with DKIM and aligns with DMARC.",
    });
  }

  // 5. Delivery errors — transient or permanent send failures.
  if (data.delivery_errors_pct != null && data.delivery_errors_pct >= 2) {
    findings.push({
      severity: data.delivery_errors_pct >= 5 ? "fail" : "warn",
      metric: "delivery_errors",
      value: data.delivery_errors_pct,
      message: `Delivery errors ${data.delivery_errors_pct}% — Gmail is rate-limiting or rejecting.`,
      action:
        "Slow volume ramp, verify reverse DNS (PTR) is set, check for IP / domain blacklist entries.",
    });
  }

  // 6. Feedback loop complaints (if present).
  if (data.feedback_loop_pct != null && data.feedback_loop_pct >= 0.1) {
    findings.push({
      severity: data.feedback_loop_pct >= 0.3 ? "fail" : "warn",
      metric: "feedback_loop",
      value: data.feedback_loop_pct,
      message: `Feedback loop complaint rate ${data.feedback_loop_pct}%.`,
      action:
        "Audit the segments generating complaints; likely candidates: stale re-engagement sends, imported lists, consent-unclear cohorts.",
    });
  }

  // NOTHING PARSED IS NOT A PASS.
  //
  // worstSeverity([]) is "pass" and findings only gain entries for metrics
  // that parsed, so a CSV whose columns we did not recognise — a renamed
  // export, a localised one, a per-chart download — produced status ok,
  // overall_verdict pass, and the sentence "0 signal(s) checked — all
  // green." over data this tool never read. Healthy and junk were
  // indistinguishable in the verdict. This is the highest-stakes advice in
  // the box and one of the first tools a stranger reaches, so it abstains,
  // in the same vocabulary the render gate already uses.
  if (findings.length === 0) {
    // Two ways to arrive here, and they need different sentences: the file's
    // columns were not ones we grade, or the columns were right and the day
    // we graded was blank (Postmaster reports nothing for a day whose volume
    // to Gmail was too low — most weekends, for a small sender).
    const anyRowHadData = parsed.series
      ? parsed.series.points.some((p) => signalsPresent(p) > 0)
      : false;
    return {
      status: "needs_inputs",
      overall_verdict: null,
      finding_count: 0,
      findings: [],
      parsed_snapshot: data,
      snapshot_source: parsed.source,
      signals_checked: 0,
      unrecognised_input: anyRowHadData ? null : parsed.header ?? null,
      // The series is real data the tool DID read. Withholding it because
      // the graded row was empty would hide the very rows that explain why.
      thresholds: THRESHOLDS,
      series: parsed.series ?? null,
      message: anyRowHadData
        ? `The row this verdict would be graded on (${parsed.series.graded_on}) ` +
          "carries no readable values, so NOTHING was checked and there is no " +
          "verdict. Postmaster reports nothing for a day whose Gmail volume was " +
          "too low. Earlier rows in this export do have data — read the series, " +
          "or re-export a window ending on a day you sent."
        : "None of the Postmaster signals this tool grades were present in the " +
          "data supplied, so NOTHING was checked and there is no verdict. " +
          (parsed.header ? `The header row read: ${parsed.header.join(", ")}. ` : "") +
          "Expected one of: spam rate, domain reputation, IP reputation, " +
          "authenticated traffic, delivery errors, feedback loop. Export the " +
          "combined table from Postmaster rather than a single chart, or pass a " +
          "snapshot object with those keys.",
    };
  }

  const overall = worstSeverity(findings);
  return {
    status: "ok",
    overall_verdict: overall,
    finding_count: findings.length,
    findings,
    parsed_snapshot: data,
    // WHICH row the verdict above was graded on, and whether that
    // choice was a chronology or a guess. See parseCsvSeries.
    snapshot_source: parsed.source,
    thresholds: THRESHOLDS,
    series: parsed.series ?? null,
    signals_checked: signalsPresent(data),
    message: summarise(overall, findings, signalsPresent(data)),
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Postmaster Signal Parser",
    },
  };
}

/**
 * The Gmail lines every number in this file is graded against.
 * Exported into the result so the widget draws the SAME thresholds the
 * findings were computed from, rather than a second copy that can drift.
 */
export const THRESHOLDS = {
  spam_rate_warn_pct: 0.1,
  spam_rate_fail_pct: 0.3,
  authenticated_traffic_warn_pct: 99,
  authenticated_traffic_fail_pct: 95,
  delivery_errors_warn_pct: 2,
  delivery_errors_fail_pct: 5,
};

function normaliseSnapshot(s) {
  if (!s || typeof s !== "object") return { error: "Invalid snapshot object." };
  return {
    spam_rate_pct: numberOrNull(s.spam_rate_pct),
    domain_reputation: s.domain_reputation ?? null,
    ip_reputation: s.ip_reputation ?? null,
    authenticated_traffic_pct: numberOrNull(s.authenticated_traffic_pct),
    delivery_errors_pct: numberOrNull(s.delivery_errors_pct),
    feedback_loop_pct: numberOrNull(s.feedback_loop_pct),
  };
}

function numberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a Postmaster CSV export into the FULL daily series, and pick the
 * row the verdict is graded on by DATE.
 *
 * This used to read `lines[lines.length - 1]` — the last line in the
 * file — and throw the other 89 days away. Two things were wrong with
 * that, and they compound:
 *
 *   1. "Last line" is not "most recent". Postmaster's UI lists newest
 *      first, and an export taken from that view is date-DESCENDING, so
 *      the last line is the OLDEST day in the window. Graded on the same
 *      six days of a domain going from `high`/0.04% to `bad`/0.41%, the
 *      old parser returned `fail` when the rows arrived ascending and a
 *      confident `pass — all green` when the same rows arrived
 *      descending. Nothing in the output distinguished the two: no date
 *      was ever read, so the parser could not have known which end it
 *      was standing at, and it did not say so.
 *
 *   2. A single day is the wrong unit anyway. Gmail's thresholds are
 *      about sustained behaviour, and the finding that matters is almost
 *      never the value — it is the slope. A spam rate stepping
 *      0.04 → 0.06 → 0.11 → 0.19 → 0.27 is an emergency that scores
 *      "within the green band" on its latest reading right up to the day
 *      it doesn't.
 *
 * So: read every row, sort by parsed date, grade the newest, and return
 * the series so the trend is drawable. When the file carries no readable
 * date column we fall back to the last row exactly as before — but the
 * result then says `snapshot_source: "last_row_undated"` instead of
 * implying a chronology we never established.
 */
function parseCsvSeries(csv) {
  const lines = csv.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { error: "CSV needs at least a header row and one data row." };
  const header = splitRow(lines[0]).map((h) => h.toLowerCase());

  const col = (...names) => {
    for (const name of names) {
      const idx = header.findIndex((h) => h.includes(name));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const idx = {
    date: col("date", "day"),
    spam: col("spam_rate", "spam rate", "spam"),
    domain: col("domain_reputation", "domain reputation"),
    ip: col("ip_reputation", "ip reputation"),
    auth: col("authenticated", "auth_rate", "auth"),
    errs: col("delivery_error", "delivery error", "delivery errors"),
    fbl: col("fbl", "feedback_loop", "feedback"),
  };

  const at = (cells, i) => (i >= 0 && i < cells.length ? cells[i] : null);
  const points = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitRow(lines[i]);
    const rawDate = at(cells, idx.date);
    const ts = parseDay(rawDate);
    points.push({
      date: ts == null ? null : rawDate,
      _ts: ts,
      _order: i,
      spam_rate_pct: parsePercent(at(cells, idx.spam)),
      domain_reputation: normaliseBand(at(cells, idx.domain)),
      ip_reputation: normaliseBand(at(cells, idx.ip)),
      authenticated_traffic_pct: parsePercent(at(cells, idx.auth)),
      delivery_errors_pct: parsePercent(at(cells, idx.errs)),
      feedback_loop_pct: parsePercent(at(cells, idx.fbl)),
    });
  }
  if (points.length === 0) return { error: "CSV had a header but no data rows." };

  const dated = points.filter((p) => p._ts != null);
  // Every row must carry a date before we claim the file is a
  // chronology. A part-dated export is a malformed one, and half a
  // timeline sorted against unsorted rows is worse than no timeline.
  const isDated = dated.length === points.length;

  const ordered = isDated
    ? points.slice().sort((a, b) => a._ts - b._ts)
    : points.slice();
  const latest = ordered[ordered.length - 1];

  const strip = (p) => ({
    date: p.date,
    spam_rate_pct: p.spam_rate_pct,
    domain_reputation: p.domain_reputation,
    ip_reputation: p.ip_reputation,
    authenticated_traffic_pct: p.authenticated_traffic_pct,
    delivery_errors_pct: p.delivery_errors_pct,
    feedback_loop_pct: p.feedback_loop_pct,
  });

  return {
    source: isDated ? "newest_dated_row" : "last_row_undated",
    // Kept so an abstention can quote the columns it was handed rather than
    // telling the user their file was wrong without saying how.
    header,
    snapshot: strip(latest),
    series: {
      // The one fact the drawing must not get wrong: whether the x-axis
      // is time or merely file order.
      dated: isDated,
      row_count: ordered.length,
      first_date: isDated ? ordered[0].date : null,
      last_date: isDated ? latest.date : null,
      graded_on: isDated
        ? `${latest.date} — the newest dated row of ${ordered.length}.`
        : `Row ${latest._order} of ${ordered.length} — the last line in the file. No readable date column, so this is file order, NOT a chronology; if the export is newest-first this is the OLDEST day in the window.`,
      points: ordered.map(strip),
    },
  };
}

/** Split one CSV row, honouring simple double-quoted cells. */
function splitRow(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/**
 * Parse a Postmaster date cell to a timestamp, or null.
 *
 * Deliberately strict: only the two shapes Postmaster actually emits
 * (ISO `YYYY-MM-DD` and US `M/D/YYYY`). Handing an arbitrary string to
 * `Date.parse` is how a header row, a total row, or a stray metric label
 * becomes a valid date on some engines and reorders the whole series
 * around a row that is not a day.
 */
function parseDay(value) {
  if (value == null) return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  return null;
}

/**
 * A percentage cell, or null when there was nothing in it.
 *
 * The empty-string guard is the whole point. `Number("")` is 0, not NaN,
 * so a blank cell used to arrive here and leave as a hard, measured
 * zero — and zero is the BEST possible spam rate. Postmaster blanks a
 * day when the volume to Gmail was too low to report on, which is very
 * common for a small sender and universal on weekends. The result was
 * `Spam rate 0% — within the green band`: a confident pass, printed for
 * a day with no data in it at all.
 *
 * Caught by drawing the series and seeing the line dip to the axis on
 * two days the export had left blank. No test had ever fed this function
 * an empty cell.
 */
function parsePercent(s) {
  if (s == null) return null;
  const cleaned = String(s).replace(/%/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normaliseBand(s) {
  if (!s) return null;
  const v = String(s).trim().toLowerCase();
  if (REPUTATION_BANDS.includes(v)) return v;
  return null;
}

function worstSeverity(findings) {
  if (findings.some((f) => f.severity === "fail")) return "fail";
  if (findings.some((f) => f.severity === "warn")) return "warn";
  return "pass";
}

/**
 * How many of the six signals were actually READ.
 *
 * Not findings.length — that is the number of things worth saying, and three
 * of the six metrics stay silent when they are healthy. The summary line said
 * "N signal(s) checked" over the problem count, so a clean read of five
 * signals announced itself as two.
 */
function signalsPresent(data) {
  if (!data) return 0;
  return [
    data.spam_rate_pct,
    data.domain_reputation,
    data.ip_reputation,
    data.authenticated_traffic_pct,
    data.delivery_errors_pct,
    data.feedback_loop_pct,
  ].filter((v) => v != null).length;
}

function summarise(overall, findings, checked) {
  if (overall === "pass") {
    return `${checked} signal(s) checked — all green.`;
  }
  const fails = findings.filter((f) => f.severity === "fail").length;
  const warns = findings.filter((f) => f.severity === "warn").length;
  return `${fails} blocking issue${fails === 1 ? "" : "s"}, ${warns} warning${warns === 1 ? "" : "s"} across ${checked} signal(s) checked.`;
}
