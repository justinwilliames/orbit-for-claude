/**
 * Stripo design-system documenter.
 *
 * Reads all synced Stripo modules from Orbit's local library and
 * produces a single markdown brief that:
 *   1. Catalogs every module with classification, dimensions, and
 *      Liquid vars.
 *   2. Surfaces consensus brand tokens (colours, fonts, dimensions)
 *      detected across modules — and flags outliers.
 *   3. Infers composition rules ("all footers contain an unsubscribe
 *      link", "headers are always STRIPE blocks") so Orbit's compose
 *      tool has explicit, queryable design rules to honour.
 *   4. Lists gaps and risks (duplicate names, classification fall-
 *      backs to "other", missing footer Liquid vars).
 *
 * Output goes to <workspace>/outputs/stripo-design-system.md so it
 * survives across MCP sessions and can be re-read by Claude before
 * any compose call.
 */

import fs from "node:fs";
import path from "node:path";
import { listLibraryItems } from "./template-library.js";
import { ensureDir } from "./config.js";

const TAG_SYNCED = "stripo_synced";
const TAG_ARCHIVED = "stripo_archived";

export function documentStripoDesignSystem({ config }) {
  const result = listLibraryItems({ config, itemType: "module", tags: [TAG_SYNCED] });
  const modules = (result.items ?? []).filter(
    (item) => !(item.tags ?? []).includes(TAG_ARCHIVED),
  );

  if (modules.length === 0) {
    return {
      status: "no_modules",
      message:
        "No synced Stripo modules found in the library. Run orbit_sync_stripo_modules first.",
    };
  }

  const grouped = groupByClassification(modules);
  const brandTokens = aggregateBrandTokens(modules);
  const compositionRules = inferCompositionRules(modules, grouped);
  const risks = detectRisks(modules, grouped);

  const markdown = buildMarkdown({ modules, grouped, brandTokens, compositionRules, risks });

  const outputDir = path.join(config.defaultOutputDir, "stripo-design-system");
  ensureDir(outputDir);
  const outputPath = path.join(outputDir, "stripo-design-system.md");
  fs.writeFileSync(outputPath, markdown, "utf8");

  return {
    status: "ok",
    output_path: outputPath,
    module_count: modules.length,
    by_classification: Object.fromEntries(
      Object.entries(grouped).map(([k, list]) => [k, list.length]),
    ),
    risk_count: risks.length,
    composition_rule_count: compositionRules.length,
    summary:
      `Documented ${modules.length} module(s) into ${path.relative(config.rootDir, outputPath)}. ` +
      `${risks.length === 0 ? "No risks detected." : `${risks.length} risk(s) flagged for review.`}`,
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function groupByClassification(modules) {
  const out = { header: [], hero: [], content: [], footer: [], other: [] };
  for (const m of modules) {
    const k = m.metadata?.classification ?? "other";
    if (!out[k]) out[k] = [];
    out[k].push(m);
  }
  return out;
}

function aggregateBrandTokens(modules) {
  const counters = {};

  const bump = (group, key, source) => {
    if (!key) return;
    counters[group] = counters[group] ?? new Map();
    const map = counters[group];
    const entry = map.get(key) ?? { count: 0, sources: [] };
    entry.count += 1;
    if (entry.sources.length < 5) entry.sources.push(source);
    map.set(key, entry);
  };

  for (const m of modules) {
    const tokens = m.metadata?.brand_tokens ?? {};
    const sourceLabel = `${m.metadata?.classification ?? "?"}: ${m.title}`;
    bump("primary_button_color", tokens.primary_button_color, sourceLabel);
    bump("primary_button_text_color", tokens.primary_button_text_color, sourceLabel);
    bump("button_border_radius", tokens.button_border_radius, sourceLabel);
    bump("button_padding", tokens.button_padding, sourceLabel);
    bump("body_font_family", tokens.body_font_family, sourceLabel);
    bump("heading_color", tokens.heading_color, sourceLabel);
    bump("body_text_color", tokens.body_text_color, sourceLabel);
    bump("background_color", tokens.background_color, sourceLabel);
    bump("link_color", tokens.link_color, sourceLabel);
  }

  // Reduce each token group to { consensus, outliers }.
  const out = {};
  for (const [group, map] of Object.entries(counters)) {
    const entries = [...map.entries()]
      .map(([value, { count, sources }]) => ({ value, count, sources }))
      .sort((a, b) => b.count - a.count);
    out[group] = {
      consensus: entries[0] ?? null,
      outliers: entries.slice(1),
      distinct_value_count: entries.length,
    };
  }
  return out;
}

function inferCompositionRules(modules, grouped) {
  const rules = [];

  // STRIPE-vs-STRUCTURE block-type pattern.
  const headerStripes = (grouped.header ?? []).filter(
    (m) => m.metadata?.stripo_block_type === "STRIPE",
  ).length;
  const footerStripes = (grouped.footer ?? []).filter(
    (m) => m.metadata?.stripo_block_type === "STRIPE",
  ).length;
  if ((grouped.header ?? []).length > 0 && headerStripes === (grouped.header ?? []).length) {
    rules.push({
      rule: "All headers are full-width STRIPE blocks.",
      confidence: "consensus",
      derived_from: `${headerStripes}/${grouped.header.length} header modules`,
    });
  }
  if ((grouped.footer ?? []).length > 0) {
    rules.push({
      rule: `${footerStripes}/${grouped.footer.length} footers are full-width STRIPE blocks.`,
      confidence: footerStripes === grouped.footer.length ? "consensus" : "majority",
      derived_from: "footer block_type analysis",
    });
  }

  // Footer Liquid-var consistency (unsubscribe / view-in-browser are
  // typical compliance hooks).
  const footerVars = (grouped.footer ?? []).map((m) => new Set(m.metadata?.liquid_vars ?? []));
  if (footerVars.length > 1) {
    const allShared = [...footerVars[0]].filter((v) =>
      footerVars.every((set) => set.has(v)),
    );
    if (allShared.length > 0) {
      rules.push({
        rule: `Every footer contains the Liquid variables: ${allShared.map((v) => `\`{{${v}}}\``).join(", ")}.`,
        confidence: "consensus",
        derived_from: "footer Liquid-var intersection",
      });
    }
  }

  // Image-density patterns.
  const heroImageCounts = (grouped.hero ?? []).map((m) => (m.metadata?.image_inventory ?? []).length);
  if (heroImageCounts.length > 0 && heroImageCounts.every((c) => c >= 1)) {
    rules.push({
      rule: "Every hero module contains at least one image.",
      confidence: heroImageCounts.length === 1 ? "single-sample" : "consensus",
      derived_from: "hero image_inventory analysis",
    });
  }

  // The non-negotiable Orbit composition constraint.
  rules.push({
    rule: "Every Orbit-composed email uses exactly ONE header and exactly ONE footer.",
    confidence: "enforced",
    derived_from: "Orbit composition contract — validated programmatically before any push to Stripo.",
  });

  return rules;
}

function detectRisks(modules, grouped) {
  const risks = [];

  // Duplicate names within the same classification — a real source
  // of pick-the-wrong-one bugs at compose time.
  const nameByGroup = {};
  for (const m of modules) {
    const k = m.metadata?.classification ?? "other";
    nameByGroup[k] = nameByGroup[k] ?? new Map();
    const seen = nameByGroup[k];
    const list = seen.get(m.title) ?? [];
    list.push(m);
    seen.set(m.title, list);
  }
  for (const [group, map] of Object.entries(nameByGroup)) {
    for (const [name, list] of map.entries()) {
      if (list.length > 1) {
        risks.push({
          code: "duplicate_module_name",
          classification: group,
          name,
          stripo_ids: list.map((m) => m.metadata?.stripo_id),
          detail: `${list.length} modules in the "${group}" bucket share the name "${name}". Compose calls may pick the wrong one. Rename in Stripo, or add distinguishing tags.`,
        });
      }
    }
  }

  // Modules that fell through to "other" — Stripo didn't categorise
  // them and the name heuristic also failed.
  const others = grouped.other ?? [];
  for (const m of others) {
    risks.push({
      code: "unclassified_module",
      classification: "other",
      name: m.title,
      stripo_id: m.metadata?.stripo_id,
      detail: "No Stripo category and no name keyword matched. Review and assign a category in Stripo's editor.",
    });
  }

  // Missing footer Liquid vars — compliance flag.
  const footers = grouped.footer ?? [];
  for (const f of footers) {
    const vars = f.metadata?.liquid_vars ?? [];
    if (vars.length === 0) {
      risks.push({
        code: "footer_no_liquid_vars",
        classification: "footer",
        name: f.title,
        stripo_id: f.metadata?.stripo_id,
        detail:
          "Footer contains zero Liquid variables. Most ESPs require unsubscribe / view-in-browser tokens; verify this footer is meant to be static.",
      });
    }
  }

  // No header / no footer at all.
  if ((grouped.header ?? []).length === 0) {
    risks.push({
      code: "no_header_modules",
      detail: "Library contains zero modules classified as header. Composition will fail. Save at least one header in Stripo and re-sync.",
    });
  }
  if ((grouped.footer ?? []).length === 0) {
    risks.push({
      code: "no_footer_modules",
      detail: "Library contains zero modules classified as footer. Composition will fail. Save at least one footer in Stripo and re-sync.",
    });
  }

  return risks;
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

function buildMarkdown({ modules, grouped, brandTokens, compositionRules, risks }) {
  const generatedAt = new Date().toISOString();
  const lines = [];

  lines.push("# Stripo Design System");
  lines.push("");
  lines.push(`_Generated by Orbit on ${generatedAt} from ${modules.length} synced module(s)._`);
  lines.push("");
  lines.push(
    "This document is the source of truth for which modules exist, what brand tokens they encode, and what rules every Orbit-composed email must follow. Read it before any `orbit_compose_stripo_email` call.",
  );
  lines.push("");

  // ---- Inventory ----
  lines.push("## Module inventory");
  lines.push("");
  lines.push("| Classification | Count | Modules |");
  lines.push("|---|---|---|");
  for (const [k, list] of Object.entries(grouped)) {
    if (list.length === 0) continue;
    const names = list.map((m) => m.title).join(", ");
    lines.push(`| ${k} | ${list.length} | ${names} |`);
  }
  lines.push("");

  // ---- Brand tokens ----
  lines.push("## Brand tokens (detected from module CSS + inline styles)");
  lines.push("");
  const tokenLabels = {
    primary_button_color: "Primary button colour",
    primary_button_text_color: "Primary button text",
    button_border_radius: "Button border radius",
    button_padding: "Button padding",
    body_font_family: "Body font family",
    heading_color: "Heading colour",
    body_text_color: "Body text colour",
    background_color: "Background colour",
    link_color: "Link colour",
  };
  let tokensFound = false;
  for (const [key, label] of Object.entries(tokenLabels)) {
    const t = brandTokens[key];
    if (!t || !t.consensus) continue;
    tokensFound = true;
    lines.push(`### ${label}`);
    lines.push(`- **Consensus:** \`${t.consensus.value}\` (${t.consensus.count} module${t.consensus.count === 1 ? "" : "s"})`);
    if (t.outliers.length > 0) {
      lines.push(`- **Outliers:** ${t.outliers.length}`);
      for (const o of t.outliers) {
        lines.push(`  - \`${o.value}\` (${o.count}) — ${o.sources.slice(0, 3).join("; ")}`);
      }
    }
    lines.push("");
  }
  if (!tokensFound) {
    lines.push("_No brand tokens detected. Modules may use external CSS not captured during sync._");
    lines.push("");
  }

  // ---- Per-classification catalog ----
  lines.push("## Per-classification catalog");
  lines.push("");
  for (const [k, list] of Object.entries(grouped)) {
    if (list.length === 0) continue;
    lines.push(`### ${pluralLabel(k, list.length)}`);
    lines.push("");
    for (const m of list) {
      const meta = m.metadata ?? {};
      const dims = meta.width && meta.height ? `${meta.width}×${meta.height}` : "?";
      const block = meta.stripo_block_type ?? "?";
      const imageCount = (meta.image_inventory ?? []).length;
      const liquidVars = meta.liquid_vars ?? [];
      const liquidLabel =
        liquidVars.length > 0
          ? `Liquid vars: ${liquidVars.map((v) => `\`{{${v}}}\``).join(", ")}`
          : "no Liquid vars";
      lines.push(`- **${m.title}** — ${block}, ${dims}, ${imageCount} image${imageCount === 1 ? "" : "s"}, ${liquidLabel}`);
      lines.push(`  - Stripo ID: \`${meta.stripo_id}\` · Library ID: \`${m.id}\``);
      if (meta.description) lines.push(`  - ${meta.description}`);
    }
    lines.push("");
  }

  // ---- Composition rules ----
  lines.push("## Inferred composition rules");
  lines.push("");
  if (compositionRules.length === 0) {
    lines.push("_No rules inferred from this module set._");
  } else {
    for (const r of compositionRules) {
      lines.push(`- ${r.rule}`);
      lines.push(`  - _Confidence:_ ${r.confidence} · _Derived from:_ ${r.derived_from}`);
    }
  }
  lines.push("");

  // ---- Risks ----
  lines.push("## Risks and gaps");
  lines.push("");
  if (risks.length === 0) {
    lines.push("None detected.");
  } else {
    for (const r of risks) {
      lines.push(`- **${r.code}** — ${r.name ?? r.classification ?? "—"}`);
      lines.push(`  - ${r.detail}`);
      if (r.stripo_ids) lines.push(`  - Stripo IDs: ${r.stripo_ids.map((id) => `\`${id}\``).join(", ")}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}

// Per-classification pluralisation. "Headers" is fine; "Heros" and
// "Contents" are not. Explicit table over a generic +s rule.
function pluralLabel(classification, count) {
  const map = {
    header: "Header",
    hero: "Hero",
    content: "Content block",
    footer: "Footer",
    other: "Other",
  };
  const singular = map[classification] ?? classification;
  const plural = count === 1 ? singular : singular === "Hero" ? "Heroes" : `${singular}s`;
  return `${plural} (${count})`;
}
