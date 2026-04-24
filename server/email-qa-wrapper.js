// One-shot pre-send QA wrapper. Runs the three independent HTML
// checks (WCAG accessibility lint, dark-mode risk check, Gmail
// 102 KB clipping check) plus an optional file-size report and
// returns a single combined verdict.
//
// The individual tools still exist for targeted checks — this is
// the default "is this email ready to send?" entry point.

import { accessibilityLint, checkDarkModeRisk } from "./html-checks.js";
import { checkEmailSize } from "./calculators.js";

export function qaEmail({ html, includeSizeCheck = true }) {
  if (!html || typeof html !== "string" || html.trim().length === 0) {
    return {
      status: "needs_inputs",
      missing: ["html"],
      message: "Provide the email HTML to QA.",
    };
  }

  const a11y = accessibilityLint({ html });
  const darkMode = checkDarkModeRisk({ html });
  const sizeResult = includeSizeCheck ? safeSizeCheck(html) : null;

  // Aggregate verdict — fail if any component fails, warn if any
  // warns, otherwise pass.
  const verdicts = [a11y?.verdict, darkMode?.verdict];
  if (sizeResult) verdicts.push(sizeResult.verdict);
  const overall = worstVerdict(verdicts);

  // Collate issues across all checks into one table the user can
  // work through top-to-bottom. Sorted fail → warn.
  const combined = [];
  for (const issue of a11y?.issues ?? []) {
    combined.push({
      check: "accessibility",
      severity: issue.severity,
      rule: issue.rule,
      message: issue.message,
      recommendation: issue.recommendation,
      samples: issue.samples,
    });
  }
  for (const finding of darkMode?.findings ?? []) {
    combined.push({
      check: "dark-mode",
      severity: finding.kind === "already_dark" ? "fail" : "warn",
      rule: finding.kind,
      message: finding.message,
      tag: finding.tag,
      fg: finding.fg,
      bg: finding.bg,
    });
  }
  for (const w of darkMode?.warnings ?? []) {
    combined.push({
      check: "dark-mode",
      severity: "warn",
      rule: w.kind,
      message: w.message,
      tag: w.tag,
      fg: w.fg,
    });
  }
  if (sizeResult && sizeResult.verdict !== "pass") {
    combined.push({
      check: "size",
      severity: sizeResult.verdict === "fail" ? "fail" : "warn",
      rule: "gmail-clipping",
      message: sizeResult.message,
      recommendation: sizeResult.recommendation,
      bytes: sizeResult.bytes,
    });
  }
  combined.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  return {
    status: "ok",
    verdict: overall,
    fail_count: combined.filter((c) => c.severity === "fail").length,
    warn_count: combined.filter((c) => c.severity === "warn").length,
    pass_count:
      (a11y?.passes?.length ?? 0) +
      (darkMode?.verdict === "pass" ? 1 : 0) +
      (sizeResult?.verdict === "pass" ? 1 : 0),
    combined_findings: combined,
    breakdown: {
      accessibility: a11y,
      dark_mode: darkMode,
      size: sizeResult,
    },
    message: buildSummary(overall, combined, sizeResult),
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Email QA",
    },
  };
}

function safeSizeCheck(html) {
  try {
    const r = checkEmailSize(html);
    if (!r || r.error) return null;
    // Adapt calculators.checkEmailSize's tier field to the verdict
    // shape the other QA checks use.
    const verdict =
      r.tier === "clips" ? "fail" : r.tier === "at-risk" ? "warn" : "pass";
    return {
      verdict,
      bytes: r.bytes,
      kilobytes: r.kilobytes,
      percent_of_limit: r.percentOfLimit,
      tier: r.tier,
      message: `${r.kilobytes} KB of Gmail's 102 KB limit (${r.percentOfLimit}%).`,
      recommendation: r.recommendation,
    };
  } catch {
    // If the size calculator isn't importable for some reason, the
    // wrapper still works without it.
    return null;
  }
}

function worstVerdict(verdicts) {
  const filtered = verdicts.filter(Boolean);
  if (filtered.some((v) => v === "fail")) return "fail";
  if (filtered.some((v) => v === "warn")) return "warn";
  return "pass";
}

function severityRank(sev) {
  return sev === "fail" ? 0 : sev === "warn" ? 1 : 2;
}

function buildSummary(overall, combined, sizeResult) {
  if (overall === "pass") {
    return "Ready to send — accessibility, dark-mode, and size checks all pass.";
  }
  const fails = combined.filter((c) => c.severity === "fail");
  const warns = combined.filter((c) => c.severity === "warn");
  const parts = [];
  if (fails.length > 0) {
    parts.push(`${fails.length} blocking issue${fails.length === 1 ? "" : "s"}`);
  }
  if (warns.length > 0) {
    parts.push(`${warns.length} warning${warns.length === 1 ? "" : "s"}`);
  }
  const tail =
    sizeResult && sizeResult.verdict !== "pass"
      ? ` Email size: ${Math.round(sizeResult.bytes / 1024)} KB (Gmail clips at 102 KB).`
      : "";
  return `${overall === "fail" ? "Do not send" : "Review before sending"} — ${parts.join(", ")}.${tail}`;
}
