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

  const data = csv ? parseCsvSnapshot(csv) : normaliseSnapshot(snapshot);
  if (!data || data.error) {
    return {
      status: "error",
      message:
        data?.error ??
        "Could not parse the supplied Postmaster data. Use the CSV export from Postmaster's UI or pass a snapshot object.",
    };
  }

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

  const overall = worstSeverity(findings);
  return {
    status: "ok",
    overall_verdict: overall,
    finding_count: findings.length,
    findings,
    parsed_snapshot: data,
    message: summarise(overall, findings),
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Postmaster Signal Parser",
    },
  };
}

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

// Parse a Postmaster CSV export. Postmaster's UI export produces
// one row per day with columns like date,spam_rate,ip_reputation,
// domain_reputation,etc. We extract the most recent row. If the
// header doesn't match our expected shape, we do a best-effort
// column scan.
function parseCsvSnapshot(csv) {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return { error: "CSV needs at least a header row and one data row." };
  const header = lines[0].toLowerCase().split(",").map((h) => h.trim());
  const latest = lines[lines.length - 1].split(",").map((c) => c.trim());
  const cell = (name) => {
    const idx = header.findIndex((h) => h.includes(name));
    return idx >= 0 ? latest[idx] : null;
  };
  const spam = cell("spam_rate") ?? cell("spam rate");
  const domainRep = cell("domain_reputation") ?? cell("domain reputation");
  const ipRep = cell("ip_reputation") ?? cell("ip reputation");
  const auth = cell("authenticated") ?? cell("auth_rate") ?? cell("auth");
  const errs = cell("delivery_error") ?? cell("delivery error") ?? cell("delivery errors");
  const fbl = cell("fbl") ?? cell("feedback_loop") ?? cell("feedback");
  return {
    spam_rate_pct: parsePercent(spam),
    domain_reputation: normaliseBand(domainRep),
    ip_reputation: normaliseBand(ipRep),
    authenticated_traffic_pct: parsePercent(auth),
    delivery_errors_pct: parsePercent(errs),
    feedback_loop_pct: parsePercent(fbl),
  };
}

function parsePercent(s) {
  if (s == null) return null;
  const cleaned = String(s).replace(/%/g, "").trim();
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

function summarise(overall, findings) {
  if (overall === "pass") {
    return `${findings.length} signal(s) checked — all green.`;
  }
  const fails = findings.filter((f) => f.severity === "fail").length;
  const warns = findings.filter((f) => f.severity === "warn").length;
  return `${fails} blocking issue${fails === 1 ? "" : "s"}, ${warns} warning${warns === 1 ? "" : "s"} across ${findings.length} signal(s).`;
}
