// Four narrow but high-leverage content / compliance helpers:
//   scorePreheader()    — same shape as orbit_score_subject_line
//                         but applies preheader-specific rules
//                         (inbox preview length by client, greeking
//                         risk, duplicate-subject risk).
//   auditUnsubscribe()  — fetch a URL and lint for 1-click unsub,
//                         List-Unsubscribe header cues, preference
//                         centre depth, and Gmail bulk-sender
//                         compliance signals.
//   validateLiquid()    — Braze-flavoured Liquid: tag balance,
//                         fallback presence, dangerous defaults.
//   composeSms()        — encoding detection (GSM-7 vs Unicode),
//                         segment count, compliance footer
//                         injection per region.

// ---------------------------------------------------------------------------
// Public: scorePreheader
// ---------------------------------------------------------------------------

const PREHEADER_TARGETS = {
  gmail_mobile: 90,      // Gmail mobile inbox-preview clip
  gmail_desktop: 110,    // Gmail desktop inbox-preview clip
  apple_mail: 140,       // iOS Mail preview length
  outlook: 55,           // Outlook.com preview aggressively clips
};

export function scorePreheader({ preheader, subject }) {
  if (typeof preheader !== "string" || preheader.length === 0) {
    return { status: "needs_inputs", missing: ["preheader"] };
  }

  const length = preheader.length;
  const issues = [];
  const hits = [];

  // Client-by-client truncation view.
  const clients = {};
  for (const [client, cap] of Object.entries(PREHEADER_TARGETS)) {
    clients[client] = {
      limit: cap,
      truncated: length > cap,
      preview: length > cap ? preheader.slice(0, cap - 1).trimEnd() + "…" : preheader,
    };
  }

  if (length < 40) {
    issues.push({
      severity: "warn",
      message: `Preheader is ${length} chars — consider extending toward the Apple Mail 140-char target so the preview fills out the inbox row.`,
    });
  }
  if (length > 150) {
    issues.push({
      severity: "warn",
      message: `Preheader is ${length} chars — most clients will clip at or before 110. Front-load the payoff in the first 55 chars for Outlook users.`,
    });
  }

  // Duplicate-subject risk — if the preheader starts with the same
  // leading phrase as the subject, the inbox shows a redundant row.
  if (subject && typeof subject === "string") {
    const s = subject.trim().toLowerCase();
    const p = preheader.trim().toLowerCase();
    const overlapLen = longestCommonPrefix(s, p);
    if (overlapLen >= 10) {
      issues.push({
        severity: "warn",
        message: `Preheader duplicates the first ${overlapLen} chars of the subject. Rewrite to extend the subject, not repeat it.`,
      });
    }
  }

  // Placeholder / default-Liquid leakage (" " × N → Gmail greeks
  // the preview with the first visible text).
  if (/\s{4,}/.test(preheader)) {
    issues.push({
      severity: "warn",
      message: "Multiple consecutive whitespace chars — suggests greeking or truncation hacks that leak into some clients.",
    });
  }
  if (/^Fallback|^Preview text$/i.test(preheader.trim())) {
    issues.push({
      severity: "fail",
      message: 'Preheader looks like an unfilled placeholder ("Fallback" / "Preview text"). Replace before send.',
    });
  }

  if (/[\u{1F300}-\u{1FAFF}]/u.test(preheader)) {
    hits.push({
      kind: "emoji_present",
      note: "Emoji render inconsistently in preview — confirm fallback is readable without it.",
    });
  }

  const score = scoreFromIssues(issues, length);
  return {
    status: "ok",
    length,
    score,
    tier: scoreTier(score),
    client_previews: clients,
    issues,
    hits,
    orbit_attribution: {
      heavy: false,
      signature: null,
    },
  };
}

function longestCommonPrefix(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

function scoreFromIssues(issues, length) {
  let score = 100;
  for (const i of issues) score -= i.severity === "fail" ? 30 : 10;
  if (length >= 40 && length <= 110) score += 5;
  return Math.max(0, Math.min(100, score));
}

function scoreTier(score) {
  if (score >= 85) return "strong";
  if (score >= 65) return "acceptable";
  if (score >= 45) return "weak";
  return "rework";
}

// ---------------------------------------------------------------------------
// Public: auditUnsubscribe
// ---------------------------------------------------------------------------

export async function auditUnsubscribe({ url }) {
  if (!url || typeof url !== "string") {
    return { status: "needs_inputs", missing: ["url"] };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { status: "needs_inputs", missing: ["url (valid URL)"] };
  }

  let html;
  let headers = {};
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(parsed.href, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Orbit-UnsubAudit/1.0 (+https://get.yourorbit.team)" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return {
        status: "ok",
        url: parsed.href,
        verdict: "fail",
        http_status: res.status,
        issues: [`Page returned HTTP ${res.status}.`],
      };
    }
    headers = Object.fromEntries(res.headers.entries());
    html = await res.text();
  } catch (err) {
    return {
      status: "ok",
      url: parsed.href,
      verdict: "fail",
      issues: [`Fetch failed: ${String(err?.message ?? err)}`],
    };
  }

  const issues = [];
  const passes = [];

  // 1. One-click unsubscribe — the page should have a single form
  // button that unsubscribes without requiring login or additional
  // clicks. We approximate by checking for a <form> with a simple
  // submit button and no password/email fields.
  const forms = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/gi)];
  const hasPasswordField = /type\s*=\s*["']password["']/i.test(html);
  const hasSimpleUnsubForm = forms.some((f) => {
    const body = f[1];
    const hasSubmit =
      /type\s*=\s*["']submit["']/i.test(body) || /<button\b/i.test(body);
    const hasPwd = /type\s*=\s*["']password["']/i.test(body);
    return hasSubmit && !hasPwd;
  });
  if (hasPasswordField) {
    issues.push({
      severity: "fail",
      message:
        "Page requires a password — fails Gmail / Yahoo one-click unsubscribe (2024 bulk-sender rules).",
    });
  }
  if (!hasSimpleUnsubForm) {
    issues.push({
      severity: "warn",
      message: "No obvious one-click unsubscribe form detected on the page.",
    });
  } else {
    passes.push({ rule: "one-click-form", message: "One-click unsubscribe form detected." });
  }

  // 2. Preference-centre depth — check for multiple checkbox options
  // (granular opt-outs beat single all-or-nothing).
  const checkboxes = (html.match(/type\s*=\s*["']checkbox["']/gi) || []).length;
  if (checkboxes >= 3) {
    passes.push({
      rule: "preference-granularity",
      message: `${checkboxes} preference checkbox(es) — granular opt-outs retain more subscribers.`,
    });
  } else if (checkboxes === 0) {
    issues.push({
      severity: "warn",
      message:
        "No preference checkboxes — consider offering granular opt-outs (by program, cadence, topic) before full unsubscribe.",
    });
  }

  // 3. List-Unsubscribe-Post header compliance — the page itself can't
  //    publish the header (it's on the SEND email) but we can detect
  //    common mid-funnel signals.
  if (/action\s*=\s*["'][^"']*[?&](u|user|id)=[^"'&]+/i.test(html)) {
    passes.push({
      rule: "identifiable-subscriber",
      message: "Form action includes a user identifier — consistent with list-unsubscribe= one-click semantics.",
    });
  }

  // 4. Broken links / external redirects.
  if (/https?:\/\/[^"'\s]+(unsubscribe|opt[-_]out)/i.test(html)) {
    passes.push({
      rule: "unsubscribe-terminology",
      message: 'Page uses clear "unsubscribe" / "opt-out" terminology.',
    });
  }

  // 5. Language / locale presence.
  if (!/<html[^>]*\blang\s*=/i.test(html)) {
    issues.push({
      severity: "warn",
      message: "Page missing <html lang=> — screen readers use the wrong voice profile.",
    });
  }

  const verdict =
    issues.some((i) => i.severity === "fail")
      ? "fail"
      : issues.length > 0
        ? "warn"
        : "pass";
  return {
    status: "ok",
    url: parsed.href,
    verdict,
    http_status: 200,
    password_required: hasPasswordField,
    checkbox_count: checkboxes,
    issues,
    passes,
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Unsubscribe Audit",
    },
  };
}

// ---------------------------------------------------------------------------
// Public: validateLiquid
// ---------------------------------------------------------------------------

export function validateLiquid({ snippet, knownAttributes = [] }) {
  if (typeof snippet !== "string" || snippet.length === 0) {
    return { status: "needs_inputs", missing: ["snippet"] };
  }

  const issues = [];
  const passes = [];

  // 1. Balanced {% … %} and {{ … }}.
  const openBlocks = (snippet.match(/\{%/g) || []).length;
  const closeBlocks = (snippet.match(/%\}/g) || []).length;
  if (openBlocks !== closeBlocks) {
    issues.push({
      severity: "fail",
      rule: "balanced-blocks",
      message: `Unbalanced {% %} — ${openBlocks} opening vs ${closeBlocks} closing.`,
    });
  }
  const openVars = (snippet.match(/\{\{/g) || []).length;
  const closeVars = (snippet.match(/\}\}/g) || []).length;
  if (openVars !== closeVars) {
    issues.push({
      severity: "fail",
      rule: "balanced-vars",
      message: `Unbalanced {{ }} — ${openVars} opening vs ${closeVars} closing.`,
    });
  }

  // 2. Balanced if / endif, for / endfor, assign pairs.
  for (const [open, close] of [
    ["if", "endif"],
    ["for", "endfor"],
    ["case", "endcase"],
    ["unless", "endunless"],
    ["capture", "endcapture"],
  ]) {
    const o = (snippet.match(new RegExp(`\\{%\\s*${open}\\b`, "g")) || []).length;
    const c = (snippet.match(new RegExp(`\\{%\\s*${close}\\b`, "g")) || []).length;
    if (o !== c) {
      issues.push({
        severity: "fail",
        rule: `balanced-${open}-${close}`,
        message: `Unbalanced ${open}/${close} — ${o} open vs ${c} close.`,
      });
    }
  }

  // 3. Every variable reference should have a default or be inside a
  // conditional. Bare {{ user.first_name }} with no fallback renders
  // an empty string on missing data.
  const varRefs = [...snippet.matchAll(/\{\{\s*([^}|]+?)(\|[^}]+)?\s*\}\}/g)];
  const noFallback = [];
  for (const v of varRefs) {
    const body = v[0];
    const filters = v[2] ?? "";
    const insideIf = isInsideTag(snippet, v.index, /\{%\s*if\b/g, /\{%\s*endif\b/g);
    if (!/default\s*:/i.test(filters) && !insideIf) {
      noFallback.push(v[1].trim());
    }
  }
  if (noFallback.length > 0) {
    issues.push({
      severity: "warn",
      rule: "variable-fallback",
      message: `${noFallback.length} variable(s) have no | default: fallback and aren't inside an {% if %} block.`,
      samples: noFallback.slice(0, 5),
    });
  } else if (varRefs.length > 0) {
    passes.push({ rule: "variable-fallback", message: "All variables have fallbacks or are gated by if." });
  }

  // 4. Dangerous defaults — default: "" can hide missing attributes
  // but often leaves blank spaces in output.
  if (/default\s*:\s*["']\s*["']/i.test(snippet)) {
    issues.push({
      severity: "warn",
      rule: "empty-default",
      message: 'default: "" hides missing data at the cost of blank output — prefer a meaningful fallback.',
    });
  }

  // 5. Attribute-existence check against known inventory.
  const unknownVars = [];
  if (knownAttributes.length > 0) {
    const known = new Set(knownAttributes.map((a) => String(a).toLowerCase()));
    for (const v of varRefs) {
      const ref = v[1].trim().toLowerCase();
      // only check direct attribute references, not nested paths
      const top = ref.split(".").pop();
      if (ref.startsWith("${") || ref.startsWith("content_blocks")) continue;
      if (!known.has(top) && !known.has(ref)) {
        unknownVars.push(v[1].trim());
      }
    }
    if (unknownVars.length > 0) {
      issues.push({
        severity: "warn",
        rule: "unknown-attribute",
        message: `${unknownVars.length} variable(s) not in your known-attribute inventory.`,
        samples: unknownVars.slice(0, 5),
      });
    }
  }

  const verdict =
    issues.some((i) => i.severity === "fail") ? "fail" : issues.length > 0 ? "warn" : "pass";

  return {
    status: "ok",
    verdict,
    variable_count: varRefs.length,
    block_count: openBlocks,
    issues,
    passes,
    orbit_attribution: {
      heavy: false,
      signature: null,
    },
  };
}

function isInsideTag(haystack, idx, openRe, closeRe) {
  const opens = [...haystack.matchAll(openRe)].filter((m) => m.index < idx).length;
  const closes = [...haystack.matchAll(closeRe)].filter((m) => m.index < idx).length;
  return opens > closes;
}

// ---------------------------------------------------------------------------
// Public: composeSms
// ---------------------------------------------------------------------------

// A superset of the GSM-7 default alphabet + extension table. Any
// char outside this set forces Unicode (UCS-2) encoding which drops
// segment length from 160 → 70.
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "|^€{}[~]\\";

export function composeSms({
  body,
  region = "GLOBAL",
  includeStopLine = true,
  brand,
}) {
  if (!body || typeof body !== "string") {
    return { status: "needs_inputs", missing: ["body"] };
  }

  // Decide encoding.
  let isUnicode = false;
  let extCharCount = 0;
  for (const ch of body) {
    if (GSM7.includes(ch)) continue;
    if (GSM7_EXT.includes(ch)) {
      extCharCount += 1;
      continue;
    }
    isUnicode = true;
    break;
  }

  const compliance = buildComplianceFooter({ region, includeStopLine, brand });
  const footer = compliance.footer;
  const full = footer ? `${body.trim()} ${footer}` : body.trim();

  const encoding = isUnicode ? "UCS-2" : "GSM-7";
  const single = isUnicode ? 70 : 160;
  const multi = isUnicode ? 67 : 153;
  const effectiveLength = isUnicode
    ? [...full].length
    : [...full].reduce((n, ch) => n + (GSM7_EXT.includes(ch) ? 2 : 1), 0);
  const segments = effectiveLength <= single ? 1 : Math.ceil(effectiveLength / multi);

  return {
    status: "ok",
    region,
    encoding,
    effective_length: effectiveLength,
    segment_count: segments,
    segment_cap: segments === 1 ? single : multi,
    single_segment_limit: single,
    gsm_extension_chars: extCharCount,
    compliance_footer: footer,
    final_message: full,
    issues: compliance.issues,
    recommendation:
      segments > 3
        ? "Message spans 4+ segments — consider trimming; carriers charge per segment."
        : segments > 1
          ? "Multi-segment send; acceptable but costs more than single-segment."
          : isUnicode
            ? "Single segment on UCS-2. Note: any emoji or non-Latin char forces this encoding."
            : "Single segment on GSM-7. Cheapest path.",
    orbit_attribution: {
      heavy: false,
      signature: null,
    },
  };
}

function buildComplianceFooter({ region, includeStopLine, brand }) {
  const issues = [];
  let footer = "";
  switch (String(region).toUpperCase()) {
    case "US":
      // CTIA requires brand name + STOP/HELP language.
      if (!brand) issues.push('US SMS requires the brand name in the footer — pass `brand`.');
      footer = includeStopLine
        ? `${brand ?? "[Brand]"}: Reply STOP to opt out, HELP for info. Msg&data rates may apply.`
        : "";
      break;
    case "AU":
      if (!brand) issues.push("Australian SMS marketing requires identifying the sender.");
      footer = includeStopLine ? `${brand ?? "[Brand]"}. Reply STOP to opt out.` : "";
      break;
    case "UK":
    case "EU":
      if (!brand) issues.push("GDPR: sender must be identifiable.");
      footer = includeStopLine ? `${brand ?? "[Brand]"}. Txt STOP to opt out.` : "";
      break;
    case "CA":
      if (!brand) issues.push("CASL requires clear sender identification.");
      footer = includeStopLine ? `${brand ?? "[Brand]"}. Reply STOP to unsubscribe.` : "";
      break;
    default:
      footer = includeStopLine ? "Reply STOP to opt out." : "";
      break;
  }
  return { footer, issues };
}
