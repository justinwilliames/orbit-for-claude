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
  // A check that did not run is not a check that passed. Both the
  // caller opting out and the calculator throwing produce a shaped
  // abstention with a reason, never a silent null — the widget has a
  // slot for it and the summary counts it.
  const sizeResult = includeSizeCheck
    ? safeSizeCheck(html)
    : notMeasured("Size check was not requested (include_size_check: false).");

  // Aggregate verdict — fail if any component fails, warn if any
  // warns, otherwise pass.
  const verdicts = [a11y?.verdict, darkMode?.verdict];
  if (sizeResult) verdicts.push(sizeResult.verdict);
  const measuredVerdict = worstVerdict(verdicts);

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
  if (sizeResult && sizeResult.verdict && sizeResult.verdict !== "pass") {
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

  // Two shapes of abstention travel out of here: a whole sub-check that
  // could not run, and an individual rule inside one that could not be
  // resolved (contrast against a <style> block full of selectors we
  // cannot bind). Both belong on the report; neither is a pass.
  const notMeasuredChecks = [];
  for (const [name, r] of [
    ["accessibility", a11y],
    ["dark_mode", darkMode],
    ["size", sizeResult],
  ]) {
    if (!r || !r.verdict || r.verdict === "unknown" || r.not_measured === true) {
      notMeasuredChecks.push({ check: name, reason: r?.reason || "The check did not run." });
      continue;
    }
    for (const nested of Array.isArray(r.not_measured) ? r.not_measured : []) {
      notMeasuredChecks.push({
        check: `${name}/${nested.rule || nested.check || "check"}`,
        reason: nested.reason || "The check did not run.",
      });
    }
  }

  // A gate that abstained on a check cannot say "ready to send". It can
  // still say "fail" — a measured failure outranks an unmeasured one.
  const overall =
    measuredVerdict === "pass" && notMeasuredChecks.length > 0 ? "warn" : measuredVerdict;

  return {
    status: "ok",
    verdict: overall,
    fail_count: combined.filter((c) => c.severity === "fail").length,
    warn_count: combined.filter((c) => c.severity === "warn").length,
    pass_count:
      (a11y?.passes?.length ?? 0) +
      (darkMode?.verdict === "pass" ? 1 : 0) +
      (sizeResult?.verdict === "pass" ? 1 : 0),
    not_measured_count: notMeasuredChecks.length,
    not_measured: notMeasuredChecks,
    combined_findings: combined,
    breakdown: {
      accessibility: a11y,
      dark_mode: darkMode,
      size: sizeResult,
    },
    message: buildSummary(overall, combined, sizeResult, notMeasuredChecks),
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Email QA",
    },
  };
}

function notMeasured(reason) {
  return { verdict: null, not_measured: true, reason };
}

function safeSizeCheck(html) {
  try {
    const r = checkEmailSize(html);
    if (!r || r.error) {
      return notMeasured(
        r?.error ? `The size calculator returned an error: ${r.error}` : "The size calculator returned nothing."
      );
    }
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
  } catch (err) {
    // A crashed check and a skipped check used to render identically —
    // as nothing at all. Say which happened.
    return notMeasured(`The size check threw: ${err?.message || "unknown error"}.`);
  }
}

function worstVerdict(verdicts) {
  // "unknown" is an abstention, not a grade — it must never be counted
  // towards a pass. The caller downgrades pass → warn when anything
  // abstained, so an unmeasured check can never read "ready to send".
  const filtered = verdicts.filter((v) => v && v !== "unknown");
  if (filtered.some((v) => v === "fail")) return "fail";
  if (filtered.some((v) => v === "warn")) return "warn";
  return "pass";
}

function severityRank(sev) {
  return sev === "fail" ? 0 : sev === "warn" ? 1 : 2;
}

function buildSummary(overall, combined, sizeResult, notMeasuredChecks = []) {
  // "All pass" is only true over the checks that ran. Saying it over a
  // check that abstained is the exact claim this wrapper must not make.
  const skipped =
    notMeasuredChecks.length > 0
      ? ` ${notMeasuredChecks.length} check${notMeasuredChecks.length === 1 ? "" : "s"} not measured: ${notMeasuredChecks
          .map((c) => c.check)
          .join(", ")}.`
      : "";
  if (overall === "pass") {
    return notMeasuredChecks.length > 0
      ? `The checks that ran all pass.${skipped}`
      : "Ready to send — accessibility, dark-mode, and size checks all pass.";
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
    sizeResult && sizeResult.verdict && sizeResult.verdict !== "pass"
      ? ` Email size: ${Math.round(sizeResult.bytes / 1024)} KB (Gmail clips at 102 KB).`
      : "";
  const lead = overall === "fail" ? "Do not send" : "Review before sending";
  if (parts.length === 0) {
    // Nothing failed and nothing warned — the verdict is only non-pass
    // because a check abstained. Say that, don't print an empty list.
    return `${lead} — the checks that ran raised nothing, but not everything was checked.${tail}${skipped}`;
  }
  return `${lead} — ${parts.join(", ")}.${tail}${skipped}`;
}
