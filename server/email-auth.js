// SPF, DKIM, DMARC, and BIMI DNS validators. These all resolve real
// DNS records for a supplied domain and return a structured pass /
// warn / fail verdict the caller can pipe straight into a
// deliverability diagnosis. No external API keys — just Node's
// built-in dns/promises.

import { promises as dns } from "node:dns";

import { unreadable } from "./status-vocabulary.js";

const DEFAULT_TIMEOUT_MS = 5000;

// RFC 7208 §4.6.4. Ten DNS-querying mechanisms per SPF evaluation,
// counted across the whole tree — not per record.
const SPF_LOOKUP_LIMIT = 10;
// A guard against a pathological chain, not a spec rule. The visited
// set already breaks cycles; this stops a very deep legitimate tree
// from turning a keyless check into a minute of DNS.
const SPF_MAX_DEPTH = 12;

// ---------------------------------------------------------------------------
// Public: checkEmailAuth — SPF + DMARC (+ optional DKIM selector lookups)
// ---------------------------------------------------------------------------

export async function checkEmailAuth({ domain, dkimSelectors = [], resolveTxt } = {}) {
  if (!domain || typeof domain !== "string") {
    return {
      status: "needs_inputs",
      missing: ["domain"],
      message: "Provide the root domain (e.g. yourorbit.team, not www.yourorbit.team).",
    };
  }

  const root = normaliseDomain(domain);
  const txt = resolveTxt ?? resolveTxtSafe;
  const [spf, dmarc, dkim] = await Promise.all([
    resolveSpf(root, txt),
    resolveDmarc(root, txt),
    resolveDkim(root, Array.isArray(dkimSelectors) ? dkimSelectors : [], txt),
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

async function resolveSpf(domain, resolveTxt = resolveTxtSafe) {
  const records = await resolveTxt(domain);
  if (records.error) {
    if (isRealNegative(records.error)) {
      return {
        verdict: "fail",
        records: [],
        issues: [`No TXT records on ${domain}, so no SPF record (${records.error}).`],
        recommendation: 'Publish a TXT record starting with "v=spf1".',
      };
    }
    return unreadable("dns_unreachable", {
      records: [],
      issues: [`The SPF lookup did not return an answer (${records.error}). Nothing was checked.`],
      recommendation: "Re-run once DNS is reachable. This is not a finding about the domain.",
    });
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
  let blocking = false;

  const expansion = await evaluateSpfLookups(record, domain, resolveTxt);
  if (expansion.complete && expansion.count > SPF_LOOKUP_LIMIT) {
    issues.push(
      `SPF record uses ${expansion.count} DNS lookups (RFC 7208 limit: ${SPF_LOOKUP_LIMIT}). Mail will be treated as permerror.`,
    );
    blocking = true;
  } else if (!expansion.complete && expansion.count > SPF_LOOKUP_LIMIT) {
    // Over the limit on a partial walk is still over the limit. The
    // count is a floor, so say floor, not fact.
    issues.push(
      `SPF record uses at least ${expansion.count} DNS lookups (RFC 7208 limit: ${SPF_LOOKUP_LIMIT}) — already over. ${expansion.incomplete_reason}`,
    );
    blocking = true;
  } else if (!expansion.complete) {
    issues.push(
      `The lookup count could not be completed, so it is not reported. ${expansion.incomplete_reason}`,
    );
  }

  if (/\+all\b/i.test(record)) {
    issues.push('Record ends with "+all" — this allows any server to send as your domain.');
    blocking = true;
  }

  // redirect= is not a lesser include:. RFC 7208 §6.1 says the redirect
  // modifier is IGNORED when an all mechanism is present, and that a
  // record using redirect= must therefore not carry one. Telling the
  // owner of `v=spf1 redirect=_hspf.example.com` to "tighten to -all"
  // kills the redirect and unauthorises every server in the chain —
  // which is the shape a HubSpot-hosted domain and a Microsoft 365
  // tenant both publish, i.e. the first two records anyone types into a
  // free SPF checker.
  const hasAll = /[-+~?]?all\b/i.test(record);
  if (expansion.redirect) {
    if (hasAll) {
      issues.push(
        `Record carries both an "all" mechanism and redirect=${expansion.redirect} — per RFC 7208 §6.1 the redirect is ignored entirely, so the chain behind it authorises nobody.`,
      );
      blocking = true;
    } else if (expansion.redirect_target_ok === false) {
      issues.push(
        `redirect=${expansion.redirect} does not resolve to a v=spf1 record, so the whole policy is a permerror.`,
      );
      blocking = true;
    }
  } else if (!/-all\b|\?all\b|~all\b/i.test(record)) {
    issues.push('Record has no explicit "all" qualifier at the end.');
  }

  const verdict = issues.length === 0 ? "pass" : blocking ? "fail" : "warn";
  const budget = expansion.complete
    ? { lookup_count: expansion.count, lookup_count_is_complete: true }
    : {
        // The widget's meter abstains on a missing lookup_count. That is
        // the correct rendering for a walk that did not finish, so the
        // key is withheld rather than filled with a floor.
        lookup_count_at_least: expansion.count,
        lookup_count_is_complete: false,
        lookup_count_incomplete_reason: expansion.incomplete_reason,
      };
  return {
    verdict,
    records: [record],
    ...budget,
    lookup_expansion: expansion.path,
    issues,
    recommendation: spfRecommendation(verdict, expansion),
  };
}

function spfRecommendation(verdict, expansion) {
  if (verdict === "pass") return "SPF looks clean.";
  if (expansion.redirect) {
    return `This record delegates its whole policy to redirect=${expansion.redirect}. Do NOT add an "all" mechanism here — that would make the redirect inert. Fix the policy at the target, and keep the expanded chain under ${SPF_LOOKUP_LIMIT} lookups.`;
  }
  return `Tighten to "-all" or "~all" and reduce include:/redirect= chains under ${SPF_LOOKUP_LIMIT} lookups.`;
}

async function resolveDmarc(domain, resolveTxt = resolveTxtSafe) {
  const records = await resolveTxt(`_dmarc.${domain}`);
  if (records.error) {
    // NXDOMAIN / ENODATA is a real answer — no record is published.
    // A timeout or a SERVFAIL is not an answer at all, and grading a
    // domain `fail` on the strength of a dead resolver is the same
    // mistake as grading it `pass`.
    if (isRealNegative(records.error)) {
      return {
        verdict: "fail",
        records: [],
        issues: ["No DMARC record found at _dmarc.<domain>."],
        recommendation:
          'Publish a TXT record at _dmarc.<domain> starting "v=DMARC1; p=none;".',
      };
    }
    return unreadable("dns_unreachable", {
      records: [],
      issues: [`The DMARC lookup did not return an answer (${records.error}). Nothing was checked.`],
      recommendation: "Re-run once DNS is reachable. This is not a finding about the domain.",
    });
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

async function resolveDkim(domain, selectors, resolveTxt = resolveTxtSafe) {
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
  // Two different things used to collapse into one `continue`: a
  // selector that answered NXDOMAIN (evidence there is no key at that
  // name) and one that timed out (evidence of nothing at all). With 28
  // candidates and a dead resolver, that produced 28 non-observations
  // and the sentence "No DKIM selector was found among the common
  // defaults" — a positive claim built from zero reads.
  let resolved = 0;
  let errored = 0;
  let lastError = null;
  for (const sel of candidates) {
    if (!sel || seen.has(sel)) continue;
    seen.add(sel);
    const host = `${sel}._domainkey.${domain}`;
    const txt = await resolveTxt(host);
    if (txt.error) {
      if (isRealNegative(txt.error)) resolved += 1;
      else {
        errored += 1;
        lastError = txt.error;
      }
      continue;
    }
    resolved += 1;
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

  if (results.length === 0 && resolved === 0) {
    return unreadable("dns_unreachable", {
      selectors_found: 0,
      selectors_resolved: 0,
      selectors_errored: errored,
      records: [],
      issues: [
        `${errored} selector lookup(s) were attempted and none returned an answer (last error: ${lastError}). Nothing was checked — this is not a finding about the domain's DKIM.`,
      ],
      recommendation: "Re-run once DNS is reachable.",
    });
  }

  if (results.length === 0) {
    return {
      verdict: "warn",
      selectors_found: 0,
      // `selectors_checked` used to count attempts. Only the ones that
      // actually answered are evidence of absence, so that is the
      // number reported.
      selectors_checked: resolved,
      selectors_resolved: resolved,
      selectors_errored: errored,
      records: [],
      issues: [
        `No DKIM selector was found among the ${resolved} common default(s) that answered.` +
          (errored > 0
            ? ` ${errored} further lookup(s) returned no answer and prove nothing either way.`
            : "") +
          " Pass your ESP's selector via `dkim_selectors` for a definitive check.",
      ],
      recommendation: "Ask your ESP which selector they sign with, then re-run.",
    };
  }

  const withIssues = results.filter((r) => r.issues.length > 0);
  return {
    verdict: withIssues.length > 0 ? "warn" : "pass",
    selectors_found: results.length,
    selectors_resolved: resolved,
    selectors_errored: errored,
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

export async function checkBimi({ domain, selector = "default", resolveTxt } = {}) {
  if (!domain || typeof domain !== "string") {
    return {
      status: "needs_inputs",
      missing: ["domain"],
      message: "Provide the root domain.",
    };
  }
  const root = normaliseDomain(domain);
  const txtLookup = resolveTxt ?? resolveTxtSafe;
  const host = `${selector}._bimi.${root}`;
  const txt = await txtLookup(host);
  if (txt.error && !isRealNegative(txt.error)) {
    return {
      ...unreadable("dns_unreachable", {
        domain: root,
        selector,
        issues: [`The BIMI lookup did not return an answer (${txt.error}). Nothing was checked.`],
        recommendation: "Re-run once DNS is reachable.",
      }),
    };
  }
  const bimi = (txt.values ?? []).find((r) => /^v=BIMI1\b/i.test(r));
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
  //
  // This read used to be `dmarc.tags?.p` — which is undefined when the
  // DMARC lane ABSTAINED, not only when the policy is absent. A dead
  // resolver therefore printed "Current DMARC policy: p=missing" as a
  // fact and graded a correctly-configured BIMI record with a live VMC
  // as `fail`. Unlike the DKIM case the information is not unknowable
  // here — it is one function call away and was being discarded.
  const dmarc = await resolveDmarc(root, txtLookup);
  const dmarcUnreadable = dmarc.not_measured === true;
  const policy = dmarcUnreadable ? null : (dmarc.tags?.p ?? "").toLowerCase();
  const notMeasured = [];
  if (dmarcUnreadable) {
    notMeasured.push({
      check: "dmarc_policy",
      reason: `The DMARC read did not return an answer, so whether this domain clears BIMI's p=quarantine floor is unknown. ${dmarc.issues?.[0] ?? ""}`.trim(),
    });
  } else if (policy !== "quarantine" && policy !== "reject") {
    issues.push(
      `BIMI requires DMARC p=quarantine or p=reject. Current DMARC policy: p=${policy || "missing"}.`,
    );
  }

  const measured =
    issues.length === 0 ? "pass" : issues.some((i) => /missing|require/i.test(i)) ? "fail" : "warn";
  // A record that cleared every check Orbit could run, with one check
  // it could not run, is not a pass.
  const verdict = measured === "pass" && notMeasured.length > 0 ? "warn" : measured;
  return {
    status: "ok",
    domain: root,
    selector,
    verdict,
    record: bimi,
    tags,
    dmarc_policy: policy || null,
    not_measured: notMeasured,
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

/**
 * Walk the SPF tree and count DNS-querying mechanisms against RFC
 * 7208's single, GLOBAL budget of ten.
 *
 * The old version counted the tokens of one record and stopped. That is
 * not the number the RFC caps: include: and redirect= each pull in
 * another record whose own mechanisms count against the SAME budget.
 * `v=spf1 redirect=_hspf.hubspot.com` is fourteen characters and
 * counted as 1 — the real figure is four to six, and the count is the
 * sole input to a verdict that reads "Mail will be treated as
 * permerror." redirect= is precisely the token that hides a whole
 * policy behind one lookup, so the record where the undercount is worst
 * is the common one.
 *
 * Returns a floor plus `complete: false` when a nested record cannot be
 * read — never a partial sum dressed as a total.
 */
async function evaluateSpfLookups(record, domain, resolveTxt = resolveTxtSafe) {
  const state = {
    count: 0,
    complete: true,
    incomplete_reason: "",
    visited: new Set([domain.toLowerCase()]),
    path: [],
    redirect: null,
    redirect_target_ok: null,
  };
  await walkSpf(record, domain, 0, state, resolveTxt);
  return state;
}

const SPF_LOOKUP_MECHANISMS = new Set(["a", "mx", "ptr", "exists", "include"]);

async function walkSpf(record, host, depth, state, resolveTxt) {
  for (const token of String(record).split(/\s+/)) {
    if (!token) continue;
    const stripped = token.replace(/^[+\-~?]/, "");
    const [rawBase, ...rest] = stripped.split(/[:=]/);
    const base = rawBase.toLowerCase();
    const arg = rest.join(":");

    if (SPF_LOOKUP_MECHANISMS.has(base)) {
      state.count += 1;
      if (base === "include" && arg) {
        await expandSpf(arg, host, depth, state, resolveTxt, "include");
      }
      continue;
    }
    if (base === "redirect" && stripped.includes("=")) {
      state.count += 1;
      if (depth === 0) state.redirect = arg;
      await expandSpf(arg, host, depth, state, resolveTxt, "redirect");
    }
  }
}

async function expandSpf(target, parent, depth, state, resolveTxt, kind) {
  const key = String(target).toLowerCase();
  if (!key) return;
  if (state.visited.has(key)) {
    // A cycle is a real defect but it is not an unread record — the
    // count stays complete, the loop just stops here.
    state.path.push({ from: parent, to: key, kind, result: "already_expanded" });
    return;
  }
  if (depth + 1 > SPF_MAX_DEPTH || state.count > SPF_LOOKUP_LIMIT * 3) {
    markIncomplete(state, `Expansion stopped at ${key} (depth or breadth guard).`);
    state.path.push({ from: parent, to: key, kind, result: "stopped" });
    return;
  }
  state.visited.add(key);
  const txt = await resolveTxt(key);
  if (txt.error) {
    markIncomplete(state, `${key} did not resolve (${txt.error}), so the mechanisms behind it were never counted.`);
    state.path.push({ from: parent, to: key, kind, result: `unresolved:${txt.error}` });
    if (kind === "redirect" && depth === 0) state.redirect_target_ok = false;
    return;
  }
  const nested = txt.values.find((r) => /^v=spf1\b/i.test(r));
  if (!nested) {
    // A missing record is a real, readable answer: there is nothing
    // behind this mechanism. That is evidence, not a gap.
    state.path.push({ from: parent, to: key, kind, result: "no_spf_record" });
    if (kind === "redirect" && depth === 0) state.redirect_target_ok = false;
    return;
  }
  if (kind === "redirect" && depth === 0) state.redirect_target_ok = true;
  state.path.push({ from: parent, to: key, kind, result: "expanded", record: nested });
  await walkSpf(nested, key, depth + 1, state, resolveTxt);
}

function markIncomplete(state, reason) {
  state.complete = false;
  if (!state.incomplete_reason) state.incomplete_reason = reason;
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

// ENOTFOUND / ENODATA / NXDOMAIN are the resolver saying "there is no
// such record" — an observation. Everything else (timeout, SERVFAIL,
// REFUSED, ECONNREFUSED) is the resolver saying nothing, and a check
// must not turn that into a claim about the domain.
const REAL_NEGATIVE_CODES = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

function isRealNegative(error) {
  return REAL_NEGATIVE_CODES.has(String(error ?? "").toUpperCase());
}

function worstVerdict(verdicts) {
  const measured = verdicts.filter((v) => v === "fail" || v === "warn" || v === "pass");
  if (measured.some((v) => v === "fail")) return "fail";
  if (measured.some((v) => v === "warn")) return "warn";
  // A lane that abstained is not a lane that passed. "pass" here would
  // be an overall clean bill of health issued over an unread record.
  if (measured.length < verdicts.length) return "warn";
  return "pass";
}

function summariseVerdict(overall, { spf, dmarc, dkim }) {
  const lane = (v) => v ?? "not measured";
  const parts = [
    `SPF: ${lane(spf.verdict)}`,
    `DMARC: ${lane(dmarc.verdict)}`,
    `DKIM: ${lane(dkim.verdict)} (${dkim.selectors_found ?? 0} selector${dkim.selectors_found === 1 ? "" : "s"})`,
  ];
  return `Overall ${overall} — ${parts.join(" · ")}`;
}
