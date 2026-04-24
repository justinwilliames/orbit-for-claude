// SPF, DKIM, DMARC, and BIMI DNS validators. These all resolve real
// DNS records for a supplied domain and return a structured pass /
// warn / fail verdict the caller can pipe straight into a
// deliverability diagnosis. No external API keys — just Node's
// built-in dns/promises.

import { promises as dns } from "node:dns";

const DEFAULT_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Public: checkEmailAuth — SPF + DMARC (+ optional DKIM selector lookups)
// ---------------------------------------------------------------------------

export async function checkEmailAuth({ domain, dkimSelectors = [] }) {
  if (!domain || typeof domain !== "string") {
    return {
      status: "needs_inputs",
      missing: ["domain"],
      message: "Provide the root domain (e.g. yourorbit.team, not www.yourorbit.team).",
    };
  }

  const root = normaliseDomain(domain);
  const [spf, dmarc, dkim] = await Promise.all([
    resolveSpf(root),
    resolveDmarc(root),
    resolveDkim(root, Array.isArray(dkimSelectors) ? dkimSelectors : []),
  ]);

  const verdict = worstVerdict([spf.verdict, dmarc.verdict, dkim.verdict]);
  return {
    status: "ok",
    domain: root,
    overall: verdict,
    spf,
    dmarc,
    dkim,
    message: summariseVerdict(verdict, { spf, dmarc, dkim }),
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Email Auth Check",
    },
  };
}

async function resolveSpf(domain) {
  const records = await resolveTxtSafe(domain);
  if (records.error) {
    return {
      verdict: "fail",
      records: [],
      issues: [`SPF lookup failed: ${records.error}`],
      recommendation: "Verify DNS is reachable and the domain exists.",
    };
  }
  const spfRecords = records.values.filter((r) => /^v=spf1\b/i.test(r));
  if (spfRecords.length === 0) {
    return {
      verdict: "fail",
      records: [],
      issues: ["No SPF record found on the root domain."],
      recommendation:
        'Publish a TXT record starting with "v=spf1". Include your ESP (e.g. Braze, Mailgun), end with "-all" (hard fail) or "~all" (soft fail).',
    };
  }
  if (spfRecords.length > 1) {
    return {
      verdict: "fail",
      records: spfRecords,
      issues: ["Multiple SPF records published — RFC 7208 allows only one."],
      recommendation: "Merge into a single v=spf1 record; delete the duplicates.",
    };
  }
  const record = spfRecords[0];
  const issues = [];
  const lookupCount = countSpfLookups(record);
  if (lookupCount > 10) {
    issues.push(
      `SPF record uses ${lookupCount} DNS lookups (RFC 7208 limit: 10). Mail will be treated as permerror.`,
    );
  }
  if (/\+all\b/i.test(record)) {
    issues.push('Record ends with "+all" — this allows any server to send as your domain.');
  }
  if (!/-all\b|\?all\b|~all\b/i.test(record)) {
    issues.push('Record has no explicit "all" qualifier at the end.');
  }

  const verdict =
    issues.length === 0
      ? "pass"
      : issues.some((i) => /limit|multiple|\+all/.test(i))
        ? "fail"
        : "warn";
  return {
    verdict,
    records: [record],
    lookup_count: lookupCount,
    issues,
    recommendation:
      verdict === "pass"
        ? "SPF looks clean."
        : 'Tighten to "-all" or "~all" and reduce include:/redirect= chains under 10 lookups.',
  };
}

async function resolveDmarc(domain) {
  const records = await resolveTxtSafe(`_dmarc.${domain}`);
  if (records.error) {
    return {
      verdict: "fail",
      records: [],
      issues: [`DMARC lookup failed: ${records.error}`],
      recommendation: "Verify DNS is reachable.",
    };
  }
  const dmarcRecords = records.values.filter((r) => /^v=DMARC1\b/i.test(r));
  if (dmarcRecords.length === 0) {
    return {
      verdict: "fail",
      records: [],
      issues: ["No DMARC record found at _dmarc.<domain>."],
      recommendation:
        'Publish a TXT record at _dmarc.<domain> starting "v=DMARC1; p=none;". Start with p=none to monitor, move to p=quarantine → p=reject once alignment is clean.',
    };
  }
  if (dmarcRecords.length > 1) {
    return {
      verdict: "fail",
      records: dmarcRecords,
      issues: ["Multiple DMARC records at _dmarc — only one is allowed."],
      recommendation: "Merge into a single record.",
    };
  }
  const record = dmarcRecords[0];
  const tags = parseDmarcTags(record);
  const issues = [];
  const policy = (tags.p ?? "").toLowerCase();
  if (!policy) issues.push('Missing required "p=" tag.');
  if (policy === "none") {
    issues.push(
      'Policy is p=none (monitor-only). Gmail / Yahoo bulk-sender rules require at least p=quarantine for senders >5k/day.',
    );
  }
  if (!tags.rua) {
    issues.push('No rua= (aggregate report) address — you can\'t see who\'s spoofing.');
  }
  const subPolicy = (tags.sp ?? "").toLowerCase();
  if (subPolicy && subPolicy === "none" && policy !== "none") {
    issues.push("sp=none overrides p=* for subdomains — subdomain spoof risk.");
  }

  const verdict =
    policy === "reject" && tags.rua
      ? "pass"
      : policy === "quarantine" && tags.rua
        ? "pass"
        : policy === "none"
          ? "warn"
          : "fail";
  return {
    verdict,
    records: [record],
    tags,
    issues,
    recommendation:
      verdict === "pass"
        ? "DMARC is enforcing. Keep watching the aggregate reports."
        : policy === "none"
          ? "Move from p=none to p=quarantine once alignment reports are clean for 2–4 weeks."
          : "Add a valid rua= address and ensure p= is set.",
  };
}

async function resolveDkim(domain, selectors) {
  // Common defaults + any user-supplied selectors. We don't try to
  // enumerate all possible selectors (that's a rabbit hole); instead
  // we check the ones most ESPs use by default.
  const candidates = [
    ...selectors,
    "default",
    "google",
    "selector1",
    "selector2",
    "mail",
    "braze1",
    "braze2",
    "s1",
    "s2",
    "k1",
    "k2",
    // Additional common defaults across major ESPs / providers.
    "dkim",
    "smtp",
    "smtpapi",
    "amazonses",
    "ses",
    "postmark",
    "pm",
    "mg",
    "mailgun",
    "sendgrid",
    "sg",
    "klavio1",
    "klavio2",
    "m1",
    "m2",
    "ed25519",
  ];
  const seen = new Set();
  const results = [];
  for (const sel of candidates) {
    if (!sel || seen.has(sel)) continue;
    seen.add(sel);
    const host = `${sel}._domainkey.${domain}`;
    const txt = await resolveTxtSafe(host);
    if (txt.error) continue;
    const dkim = txt.values.find((r) => /v=DKIM1\b|p=/i.test(r));
    if (dkim) {
      const issues = [];
      if (/\bp=\s*(;|$)/.test(dkim)) {
        issues.push("Selector published with empty public key (p=) — key has been revoked/rotated.");
      }
      results.push({
        selector: sel,
        host,
        record: dkim,
        issues,
      });
    }
  }

  if (results.length === 0) {
    return {
      verdict: "warn",
      selectors_found: 0,
      selectors_checked: candidates.length,
      records: [],
      issues: [
        "No DKIM selector was found among the common defaults. Pass your ESP's selector via `dkim_selectors` for a definitive check.",
      ],
      recommendation: "Ask your ESP which selector they sign with, then re-run.",
    };
  }

  const withIssues = results.filter((r) => r.issues.length > 0);
  return {
    verdict: withIssues.length > 0 ? "warn" : "pass",
    selectors_found: results.length,
    records: results,
    issues: withIssues.flatMap((r) => r.issues.map((i) => `${r.selector}: ${i}`)),
    recommendation:
      withIssues.length > 0
        ? "Re-generate the DKIM key for the selectors with empty p=."
        : `${results.length} selector(s) verified.`,
  };
}

// ---------------------------------------------------------------------------
// Public: checkBimi — BIMI record + VMC URL check
// ---------------------------------------------------------------------------

export async function checkBimi({ domain, selector = "default" }) {
  if (!domain || typeof domain !== "string") {
    return {
      status: "needs_inputs",
      missing: ["domain"],
      message: "Provide the root domain.",
    };
  }
  const root = normaliseDomain(domain);
  const host = `${selector}._bimi.${root}`;
  const txt = await resolveTxtSafe(host);
  if (txt.error) {
    return {
      status: "ok",
      domain: root,
      selector,
      verdict: "fail",
      issues: [`BIMI lookup failed: ${txt.error}`],
      recommendation: "Verify DNS is reachable.",
    };
  }
  const bimi = txt.values.find((r) => /^v=BIMI1\b/i.test(r));
  if (!bimi) {
    return {
      status: "ok",
      domain: root,
      selector,
      verdict: "fail",
      records: [],
      issues: [`No BIMI record at ${host}.`],
      recommendation:
        "Publish a TXT record at default._bimi.<domain> with v=BIMI1; l=<svg-url>; a=<vmc-url>. BIMI requires p=quarantine or p=reject DMARC.",
    };
  }
  const tags = parseBimiTags(bimi);
  const issues = [];
  if (!tags.l) issues.push('Missing "l=" (logo URL) tag.');
  if (tags.l && !/\.svg(\?|$)/i.test(tags.l)) {
    issues.push('Logo URL should be an SVG (.svg) file per the BIMI spec.');
  }
  if (!tags.a) {
    issues.push(
      'No "a=" VMC tag — Gmail + Yahoo require a Verified Mark Certificate for the blue-check rendering.',
    );
  }
  // Optional: confirm the DMARC policy is enforcing, because BIMI
  // requires p=quarantine or p=reject (aligned org policy).
  const dmarc = await resolveDmarc(root);
  const policy = (dmarc.tags?.p ?? "").toLowerCase();
  if (policy !== "quarantine" && policy !== "reject") {
    issues.push(
      `BIMI requires DMARC p=quarantine or p=reject. Current DMARC policy: p=${policy || "missing"}.`,
    );
  }

  const verdict = issues.length === 0 ? "pass" : issues.some((i) => /missing|require/i.test(i)) ? "fail" : "warn";
  return {
    status: "ok",
    domain: root,
    selector,
    verdict,
    record: bimi,
    tags,
    dmarc_policy: policy || null,
    issues,
    recommendation:
      verdict === "pass"
        ? "BIMI looks correctly configured."
        : "Fix the listed issues and re-run. VMC is required for Gmail + Yahoo's authenticated-brand rendering.",
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · BIMI Check",
    },
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function normaliseDomain(d) {
  return String(d).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

async function resolveTxtSafe(host) {
  // dns.resolveTxt doesn't take an AbortSignal, so the timeout is a
  // Promise.race — the dangling timer promise rejects after the
  // deadline and we return a readable error.
  try {
    const records = await Promise.race([
      dns.resolveTxt(host),
      new Promise((_, r) => setTimeout(() => r(new Error("timeout")), DEFAULT_TIMEOUT_MS)),
    ]);
    // dns.resolveTxt returns string[][]; join fragments of each record.
    return { values: records.map((r) => r.join("")), error: null };
  } catch (err) {
    // ENOTFOUND / ENODATA / timeout all come through here.
    return { values: [], error: String(err?.code ?? err?.message ?? err) };
  }
}

function countSpfLookups(record) {
  // Count mechanisms that trigger a DNS lookup per RFC 7208. Cap is
  // 10 per SPF evaluation.
  //
  // The original implementation required a `:` or `=` after the
  // mechanism name (e.g. `include:`, `redirect=`), which missed the
  // bare forms `a`, `mx`, `ptr`, `exists` — all of which are valid
  // mechanisms that DO trigger a lookup. A sender sitting right at
  // the 10-lookup ceiling would have been told they were fine when
  // they were actually over.
  //
  // We tokenise the record on whitespace, strip leading qualifiers
  // (`+`, `-`, `~`, `?`), and count tokens whose base mechanism is
  // lookup-inducing. Tokens with args (`include:x.com`) and tokens
  // without args (bare `a`, `mx`) both get counted correctly.
  const tokens = record.split(/\s+/);
  const lookupMechanisms = new Set(["a", "mx", "ptr", "exists", "include", "redirect"]);
  let count = 0;
  for (const t of tokens) {
    const stripped = t.replace(/^[+\-~?]/, "");
    const base = stripped.split(/[:=]/)[0].toLowerCase();
    if (lookupMechanisms.has(base)) count += 1;
  }
  return count;
}

function parseDmarcTags(record) {
  const tags = {};
  for (const part of record.split(";")) {
    const [k, v] = part.split("=").map((s) => s && s.trim());
    if (k) tags[k] = v ?? "";
  }
  return tags;
}

function parseBimiTags(record) {
  const tags = {};
  for (const part of record.split(";")) {
    const [k, v] = part.split("=").map((s) => s && s.trim());
    if (k) tags[k] = v ?? "";
  }
  return tags;
}

function worstVerdict(verdicts) {
  if (verdicts.some((v) => v === "fail")) return "fail";
  if (verdicts.some((v) => v === "warn")) return "warn";
  return "pass";
}

function summariseVerdict(overall, { spf, dmarc, dkim }) {
  const parts = [
    `SPF: ${spf.verdict}`,
    `DMARC: ${dmarc.verdict}`,
    `DKIM: ${dkim.verdict} (${dkim.selectors_found ?? 0} selector${dkim.selectors_found === 1 ? "" : "s"})`,
  ];
  return `Overall ${overall} — ${parts.join(" · ")}`;
}
