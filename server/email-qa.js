import * as cheerio from "cheerio";
import { contrastRatio, normalizeHexColor } from "./utils.js";

const COMMERCIAL_LINK_PATTERN =
  /(unsubscribe|preferences|manage[-_\s]?preferences|subscription)/i;
// NOTE: Do NOT hoist BRAZE_LIQUID_PATTERN here with a /g flag — a module-level
// global regex shares lastIndex across calls and produces intermittent misses.
// It is recreated inside inspectLiquidFallbacks on each invocation instead.

export function validateEmailTemplate({
  html,
  platform = "braze",
  subjectLine = null,
  preheader = null
}) {
  const sourceHtml = String(html ?? "").trim();
  if (!sourceHtml) {
    throw new Error("Compiled HTML is required for Orbit email QA.");
  }

  const $ = cheerio.load(sourceHtml);
  const links = $("a[href]")
    .map((_, element) => $(element).attr("href"))
    .get()
    .filter(Boolean);

  const liquidWarnings = inspectLiquidFallbacks(sourceHtml);
  const linkWarnings = inspectLinks(links);
  const structureWarnings = inspectStructure($);
  const contrastWarnings = inspectInlineContrast($);
  const legalWarnings = inspectLegalFooter($.text(), links);

  const checks = [
    {
      key: "has_html_structure",
      passed: $("html").length > 0 && $("body").length > 0,
      detail: "html and body tags present"
    },
    {
      key: "has_tables",
      passed: $("table").length > 0,
      detail: `${$("table").length} tables found`
    },
    {
      key: "has_subject_line_context",
      passed: Boolean(String(subjectLine ?? "").trim()),
      detail: subjectLine ?? null
    },
    {
      key: "has_preheader_context",
      passed: Boolean(String(preheader ?? "").trim()),
      detail: preheader ?? null
    },
    {
      key: "has_unsubscribe_or_preferences",
      passed: legalWarnings.unsubscribePresent,
      detail: legalWarnings.unsubscribePresent ? "unsubscribe/preferences link found" : null
    },
    {
      key: "has_company_address",
      passed: legalWarnings.addressPresent,
      detail: legalWarnings.addressPresent ? "address-like footer copy found" : null
    },
    {
      key: "valid_links",
      passed: linkWarnings.invalidLinks.length === 0,
      detail: `${links.length} links found`
    },
    {
      key: "liquid_fallbacks_present",
      passed: liquidWarnings.missingFallbacks.length === 0,
      detail: liquidWarnings.variables
    },
    {
      key: "braze_safe_markup",
      passed: structureWarnings.riskyNodes.length === 0,
      detail: structureWarnings.riskyNodes
    },
    {
      key: "inline_contrast_not_flagged",
      passed: contrastWarnings.length === 0,
      detail: contrastWarnings
    }
  ];

  const warnings = [
    ...liquidWarnings.messages,
    ...linkWarnings.messages,
    ...structureWarnings.messages,
    ...contrastWarnings,
    ...legalWarnings.messages
  ];

  const missing = checks.filter((check) => !check.passed).map((check) => check.key);

  return {
    status: missing.length === 0 ? "ok" : "needs_attention",
    platform,
    passed: missing.length === 0,
    checks,
    missing,
    warnings,
    summary: {
      link_count: links.length,
      table_count: $("table").length,
      image_count: $("img").length,
      liquid_variable_count: liquidWarnings.variables.length,
      risky_node_count: structureWarnings.riskyNodes.length
    }
  };
}

function inspectLiquidFallbacks(html) {
  const variables = [...html.matchAll(/\{\{\s*([^}]+)\s*\}\}/g)].map((match) => match[0]);
  const missingFallbacks = variables.filter((token) => {
    if (/unsubscribe_url|preference_center_url/i.test(token)) {
      return false;
    }
    if (!/\$\{/.test(token) && !/custom_attribute|event_properties|canvas_entry_properties/i.test(token)) {
      return false;
    }
    return !/default\s*:|fallback/i.test(token);
  });

  return {
    variables,
    missingFallbacks,
    messages:
      missingFallbacks.length === 0
        ? []
        : [
            `These Liquid or personalization tokens appear to be missing fallback handling: ${missingFallbacks.join(", ")}`
          ]
  };
}

function inspectLinks(links) {
  const invalidLinks = [];
  const untrackedLinks = [];

  for (const href of links) {
    if (/^javascript:/i.test(href) || /^#/i.test(href)) {
      invalidLinks.push(href);
      continue;
    }

    if (/^https?:\/\//i.test(href) && !COMMERCIAL_LINK_PATTERN.test(href) && !/[?&]utm_/i.test(href)) {
      untrackedLinks.push(href);
    }
  }

  const messages = [];
  if (invalidLinks.length > 0) {
    messages.push(`Invalid or unsafe links found: ${invalidLinks.join(", ")}`);
  }
  if (untrackedLinks.length > 0) {
    messages.push(
      `These links appear to be missing UTM parameters: ${untrackedLinks.join(", ")}`
    );
  }

  return {
    invalidLinks,
    untrackedLinks,
    messages
  };
}

function inspectStructure($) {
  const riskySelectors = ["script", "form", "video", "iframe"];
  const riskyNodes = riskySelectors.filter((selector) => $(selector).length > 0);
  const messages = [];

  if (riskyNodes.length > 0) {
    messages.push(
      `Risky email markup found for Braze/email clients: ${riskyNodes.join(", ")}`
    );
  }

  if ($("style").length === 0) {
    messages.push("No embedded <style> block was found. Orbit can still render, but email-safe defaults may be thin.");
  }

  return {
    riskyNodes,
    messages
  };
}

function inspectInlineContrast($) {
  const warnings = [];

  $("*[style]").each((_, element) => {
    const visibleText = $(element).text().replace(/\s+/g, " ").trim();
    if (!visibleText) {
      return;
    }

    const style = $(element).attr("style") ?? "";
    const color = extractStyleValue(style, "color");
    const background = extractStyleValue(style, "background-color");
    const normalizedColor = normalizeHexColor(color);
    const normalizedBackground = normalizeHexColor(background);
    if (!normalizedColor || !normalizedBackground) {
      return;
    }

    const ratio = contrastRatio(normalizedColor, normalizedBackground);
    if (ratio !== null && ratio < 4.5) {
      warnings.push(
        `Low contrast detected: ${normalizedColor} on ${normalizedBackground} (${ratio}:1).`
      );
    }
  });

  return warnings;
}

function inspectLegalFooter(textContent, links) {
  const plainText = String(textContent ?? "").replace(/\s+/g, " ").trim();
  const unsubscribePresent = links.some((href) => COMMERCIAL_LINK_PATTERN.test(href)) ||
    /unsubscribe|manage preferences|subscription preferences/i.test(plainText);
  const addressPresent =
    /\b(street|road|ave|avenue|suite|level|brisbane|sydney|melbourne|australia|united states|usa|uk|london)\b/i.test(
      plainText
    );

  const messages = [];
  if (!unsubscribePresent) {
    messages.push("No unsubscribe or preferences link was detected in the compiled HTML.");
  }
  if (!addressPresent) {
    messages.push("No obvious company postal address or legal footer copy was detected.");
  }

  return {
    unsubscribePresent,
    addressPresent,
    messages
  };
}

function extractStyleValue(style, property) {
  const match = String(style ?? "").match(
    new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "i")
  );
  return match ? match[1].trim() : null;
}
