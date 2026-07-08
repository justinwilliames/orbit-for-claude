// Three related lifecycle-operations helpers, grouped in one module:
//   forecastListGrowth()     — 12-month list-size trajectory from
//                              current size + acquisition + churn.
//   auditGdprConsent()       — scan email / signup-page HTML for
//                              GDPR-style consent signals (explicit
//                              opt-in, sender identifiability,
//                              purpose limitation, right to withdraw).
//   parseTestReadout()       — take an A/B test result and produce a
//                              written read-out with significance,
//                              confidence interval, and recommendation.
//
// All pure logic — no external network. Small, deterministic, and
// chained together by the lifecycle skills.

import { compareVariants } from "./calculators.js";

// ---------------------------------------------------------------------------
// forecastListGrowth
// ---------------------------------------------------------------------------

export function forecastListGrowth({
  currentListSize,
  monthlyAcquisition,
  monthlyChurnPct,
  months = 12,
  acquisitionGrowthPct = 0,
}) {
  if (!isPositive(currentListSize) || !isNonNegative(monthlyAcquisition) || !isNonNegative(monthlyChurnPct)) {
    return {
      status: "needs_inputs",
      missing: ["current_list_size", "monthly_acquisition", "monthly_churn_pct"],
      message:
        "Provide current_list_size (users), monthly_acquisition (new signups/month), monthly_churn_pct (0-100).",
    };
  }

  const horizon = Math.max(1, Math.min(60, Math.round(months)));
  const churnRate = monthlyChurnPct / 100;
  const acqGrowthRate = acquisitionGrowthPct / 100;

  let list = currentListSize;
  let acquisition = monthlyAcquisition;
  const trajectory = [
    {
      month: 0,
      list_size: Math.round(list),
      acquisition: 0,
      churn: 0,
      net: 0,
    },
  ];

  for (let m = 1; m <= horizon; m++) {
    const churned = list * churnRate;
    list = list - churned + acquisition;
    acquisition *= 1 + acqGrowthRate;
    trajectory.push({
      month: m,
      list_size: Math.round(list),
      acquisition: Math.round(acquisition / (1 + acqGrowthRate)),
      churn: Math.round(churned),
      net: Math.round(acquisition / (1 + acqGrowthRate) - churned),
    });
  }

  // Break-even month — the first month acquisition stops covering
  // churn (net turns non-positive). We deliberately do NOT require a
  // prior positive month: month 0's net is hard-coded to 0, so a list
  // already shrinking from month 1 (churn > acquisition throughout)
  // would otherwise never register a break-even — which is exactly the
  // danger case an operator scans this field for. If the list is
  // shrinking, also note the month it halves (if within the horizon).
  let breakEvenMonth = null;
  let halvedMonth = null;
  for (let i = 1; i < trajectory.length; i++) {
    const row = trajectory[i];
    if (breakEvenMonth === null && row.net <= 0) {
      breakEvenMonth = row.month;
    }
    if (halvedMonth === null && row.list_size <= currentListSize / 2) {
      halvedMonth = row.month;
    }
  }

  const endSize = trajectory[trajectory.length - 1].list_size;
  const deltaPct = ((endSize - currentListSize) / currentListSize) * 100;
  const steadyStateAcquisitionNeeded = Math.round(currentListSize * churnRate);

  return {
    status: "ok",
    inputs: {
      current_list_size: currentListSize,
      monthly_acquisition: monthlyAcquisition,
      monthly_churn_pct: monthlyChurnPct,
      acquisition_growth_pct: acquisitionGrowthPct,
      months: horizon,
    },
    trajectory,
    end_state: {
      list_size: endSize,
      delta_pct: Math.round(deltaPct * 10) / 10,
      growing: endSize > currentListSize,
    },
    steady_state_acquisition_needed: steadyStateAcquisitionNeeded,
    halved_by_month: halvedMonth,
    break_even_month: breakEvenMonth,
    message:
      endSize > currentListSize
        ? `List grows from ${currentListSize.toLocaleString()} to ${endSize.toLocaleString()} over ${horizon} months (+${Math.round(deltaPct)}%). Steady-state monthly acquisition to hold current size is ${steadyStateAcquisitionNeeded.toLocaleString()}.`
        : `List shrinks from ${currentListSize.toLocaleString()} to ${endSize.toLocaleString()} over ${horizon} months (${Math.round(deltaPct)}%). You'd need at least ${steadyStateAcquisitionNeeded.toLocaleString()} new signups per month just to hold current size.`,
    orbit_attribution: {
      heavy: false,
      signature: null,
    },
  };
}

function isPositive(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}
function isNonNegative(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

// ---------------------------------------------------------------------------
// auditGdprConsent
// ---------------------------------------------------------------------------
//
// GDPR (EU) + PECR (UK) + ePrivacy rules require: freely given,
// specific, informed, unambiguous consent for direct marketing to
// personal data. That translates into concrete signals the tool can
// detect: sender identifiability, checkbox presence (never pre-
// ticked), purpose description, right-to-withdraw prominence, data
// controller contact. Not legal advice — but a defensible
// first-pass audit that catches the common failures.

export function auditGdprConsent({ html, kind = "signup_page" }) {
  if (!html || typeof html !== "string") {
    return {
      status: "needs_inputs",
      missing: ["html"],
      message:
        'Provide the HTML of a signup page ("signup_page"), an email footer section ("email_footer"), or a preference centre ("preference_centre").',
    };
  }

  const findings = [];
  const passes = [];

  // 1. Sender identifiability — brand name, company legal entity,
  //    physical address. Required for unambiguous consent.
  const hasAddressPattern =
    /\b\d+\s+[A-Za-z][A-Za-z0-9\s,.-]+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|boulevard|blvd|court|ct|place|pl|square|sq|way|plaza|terrace|highway|hwy)\b/i.test(
      html,
    );
  if (!hasAddressPattern) {
    findings.push({
      severity: "warn",
      rule: "sender_identifiability",
      message:
        "No physical address pattern detected — GDPR + CAN-SPAM both expect a discoverable controller/sender address.",
      recommendation: "Include a postal address in the footer.",
    });
  } else {
    passes.push({ rule: "sender_identifiability", message: "Physical address detected." });
  }

  // 2. Pre-ticked checkboxes — explicitly forbidden under GDPR
  //    (Planet49, CJEU 2019). `checked` attribute present without
  //    an explicit opt-out context is a fail.
  const preTicked = /<input[^>]*type\s*=\s*["']checkbox["'][^>]*checked[^>]*>/i.test(html);
  if (preTicked) {
    findings.push({
      severity: "fail",
      rule: "pre_ticked_consent",
      message:
        "Pre-ticked consent checkbox detected — explicitly prohibited under GDPR (Planet49 ruling).",
      recommendation: "Remove every `checked` attribute from consent checkboxes.",
    });
  }

  // 3. Consent checkbox present (for signup pages).
  if (kind === "signup_page") {
    const hasCheckbox = /<input[^>]*type\s*=\s*["']checkbox["']/i.test(html);
    if (!hasCheckbox) {
      findings.push({
        severity: "warn",
        rule: "consent_checkbox",
        message:
          "No opt-in checkbox detected on the signup page. Implied consent via form submission is insufficient under GDPR for marketing communications.",
        recommendation:
          "Add a dedicated, unticked checkbox for marketing consent, separate from the signup submit action.",
      });
    } else {
      passes.push({ rule: "consent_checkbox", message: "Opt-in checkbox detected." });
    }
  }

  // 4. Purpose description near the consent mechanism. Must be
  //    specific enough that the user knows what they're opting into.
  const hasPurposeLanguage =
    /\b(marketing|newsletter|promotional|product updates|special offers|product news|exclusive offers)\b/i.test(
      html,
    );
  if (!hasPurposeLanguage) {
    findings.push({
      severity: "warn",
      rule: "purpose_specificity",
      message:
        "No explicit purpose description detected (newsletter, marketing, product updates, etc.). GDPR requires consent to be specific to the processing purpose.",
      recommendation:
        "State what the user is opting in to receive — e.g. 'Sign me up for product updates and occasional promotional offers'.",
    });
  }

  // 5. Right-to-withdraw mention (easy, prominent).
  const hasWithdrawLanguage =
    /\b(unsubscribe|opt.?out|withdraw|manage preferences|email preferences)\b/i.test(html);
  if (!hasWithdrawLanguage) {
    findings.push({
      severity: kind === "email_footer" ? "fail" : "warn",
      rule: "right_to_withdraw",
      message:
        "No unsubscribe / opt-out / withdraw-consent language detected. GDPR Article 7(3) requires withdrawal to be as easy as giving consent.",
      recommendation:
        kind === "email_footer"
          ? "Every marketing email must include a clear unsubscribe link in the footer."
          : "Add a note near the consent mechanism explaining how to withdraw later.",
    });
  } else {
    passes.push({
      rule: "right_to_withdraw",
      message: "Withdraw / unsubscribe language detected.",
    });
  }

  // 6. Privacy policy link.
  const hasPrivacyLink =
    /<a[^>]*>[^<]*(privacy|data protection)[^<]*<\/a>/i.test(html) ||
    /href\s*=\s*["'][^"']*privacy/i.test(html);
  if (!hasPrivacyLink) {
    findings.push({
      severity: "warn",
      rule: "privacy_policy_link",
      message: "No link to a privacy policy / data-protection policy detected.",
      recommendation:
        "Link to your privacy policy near the consent mechanism so users can read how their data is processed before consenting.",
    });
  } else {
    passes.push({ rule: "privacy_policy_link", message: "Privacy policy link detected." });
  }

  // 7. Double opt-in signal (for signup pages) — presence of
  //    "confirm your email" / "check your inbox" strongly implies DOI.
  if (kind === "signup_page") {
    const hasDoiLanguage = /\b(confirm your email|check your inbox|confirmation email|verify your email)\b/i.test(html);
    if (hasDoiLanguage) {
      passes.push({
        rule: "double_opt_in",
        message: "Double-opt-in signal detected — best-practice under GDPR.",
      });
    }
  }

  const verdict =
    findings.some((f) => f.severity === "fail") ? "fail" : findings.length > 0 ? "warn" : "pass";
  return {
    status: "ok",
    kind,
    verdict,
    findings,
    passes,
    message: `${findings.length} issue${findings.length === 1 ? "" : "s"} · ${passes.length} check${passes.length === 1 ? "" : "s"} passed. Advisory — not legal advice.`,
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · GDPR Consent Audit",
    },
    disclaimer:
      "This is a pattern-based audit of common GDPR / PECR requirements. It is not legal advice. Consult qualified counsel before any enforcement-critical decision.",
  };
}

// ---------------------------------------------------------------------------
// parseTestReadout
// ---------------------------------------------------------------------------
//
// Takes a completed A/B test's raw numbers and produces a written
// read-out with significance, confidence interval, and a specific
// recommendation. Wraps calculators.compareVariants (which does the
// z-test math) with narrative framing.

export function parseTestReadout({
  testName,
  hypothesis,
  controlVisitors,
  controlConversions,
  variantVisitors,
  variantConversions,
  confidenceLevel = 0.95,
  guardrailMetrics = [],
  primaryMetric = "conversion rate",
}) {
  if (
    !isPositive(controlVisitors) ||
    !isNonNegative(controlConversions) ||
    !isPositive(variantVisitors) ||
    !isNonNegative(variantConversions)
  ) {
    return {
      status: "needs_inputs",
      missing: [
        "control_visitors",
        "control_conversions",
        "variant_visitors",
        "variant_conversions",
      ],
      message:
        "Provide visitor + conversion counts for control and variant.",
    };
  }

  const stats = compareVariants(
    controlVisitors,
    controlConversions,
    variantVisitors,
    variantConversions,
    confidenceLevel,
  );
  if (!stats) {
    return {
      status: "error",
      message:
        "Invalid inputs — conversions cannot exceed visitors and both must be positive.",
    };
  }

  // compareVariants returns { rateA, rateB, lift, z, pValue,
  // confidence, significant }. `lift` is already a relative
  // percentage. We derive a 95% CI on the absolute-rate difference
  // using the pooled standard error for visual interpretability.
  const controlRate = stats.rateA;
  const variantRate = stats.rateB;
  const liftPct = Math.round(stats.lift * 100) / 100;

  // CI on the absolute difference (variant - control), expressed in
  // percentage points.
  const zMultiplier = confidenceLevel === 0.99 ? 2.576 : 1.96;
  const seA = Math.sqrt((controlRate * (1 - controlRate)) / controlVisitors);
  const seB = Math.sqrt((variantRate * (1 - variantRate)) / variantVisitors);
  const seDiff = Math.sqrt(seA * seA + seB * seB);
  const diff = variantRate - controlRate;
  const ciLow = Math.round((diff - zMultiplier * seDiff) * 10000) / 100;
  const ciHigh = Math.round((diff + zMultiplier * seDiff) * 10000) / 100;

  const direction = variantRate > controlRate ? "positive" : "negative";
  const verdict = stats.significant
    ? direction === "positive"
      ? "winner"
      : "loser"
    : "inconclusive";

  const recommendation = buildTestRecommendation({
    verdict,
    liftPct,
    confidenceLevel: confidenceLevel * 100,
    ciLow,
    ciHigh,
    guardrailMetrics,
  });

  const narrative = buildTestNarrative({
    testName,
    hypothesis,
    primaryMetric,
    controlRate,
    variantRate,
    liftPct,
    ciLow,
    ciHigh,
    pValue: stats.pValue,
    verdict,
    recommendation,
  });

  return {
    status: "ok",
    test_name: testName ?? null,
    verdict,
    stats: {
      control_rate_pct: Math.round(controlRate * 10000) / 100,
      variant_rate_pct: Math.round(variantRate * 10000) / 100,
      lift_pct: liftPct,
      ci_low_pct: ciLow,
      ci_high_pct: ciHigh,
      z_score: Math.round(stats.z * 100) / 100,
      p_value: Math.round(stats.pValue * 10000) / 10000,
      confidence_level_pct: confidenceLevel * 100,
      ci_note:
        "CI is on the absolute-rate difference (percentage points), not relative lift.",
    },
    narrative,
    recommendation,
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Test Readout",
    },
  };
}

function buildTestRecommendation({ verdict, liftPct, confidenceLevel, ciLow, ciHigh, guardrailMetrics }) {
  const guardrail =
    guardrailMetrics.length > 0
      ? ` Before rolling out, verify guardrails held: ${guardrailMetrics.join(", ")}.`
      : "";
  if (verdict === "winner") {
    return `Ship the variant. ${liftPct}% lift is statistically significant at ${confidenceLevel}% confidence (CI: ${ciLow}% to ${ciHigh}%).${guardrail}`;
  }
  if (verdict === "loser") {
    return `Do not ship. Variant is ${Math.abs(liftPct)}% worse than control at ${confidenceLevel}% confidence (CI: ${ciLow}% to ${ciHigh}%). Diagnose why — unexpected negative lift is more diagnostic than a win.`;
  }
  return `Inconclusive. Observed lift is ${liftPct}% but the CI (${ciLow}% to ${ciHigh}%) spans zero. Either extend the test for more sample size, accept the null result and move on, or redesign the variant if the hypothesis is still worth testing.`;
}

function buildTestNarrative({ testName, hypothesis, primaryMetric, controlRate, variantRate, liftPct, ciLow, ciHigh, pValue, verdict, recommendation }) {
  const lines = [];
  if (testName) lines.push(`**Test:** ${testName}`);
  if (hypothesis) lines.push(`**Hypothesis:** ${hypothesis}`);
  lines.push(
    `**Result:** Control ${(controlRate * 100).toFixed(2)}% ${primaryMetric} vs variant ${(variantRate * 100).toFixed(2)}% (${liftPct}% relative lift). 95% CI: ${ciLow}% to ${ciHigh}%. p = ${pValue.toFixed(4)}.`,
  );
  lines.push(`**Verdict:** ${verdictLabel(verdict)}.`);
  lines.push(`**Recommendation:** ${recommendation}`);
  return lines.join("\n\n");
}

function verdictLabel(v) {
  if (v === "winner") return "Ship";
  if (v === "loser") return "Do not ship";
  return "Inconclusive";
}
