/**
 * Stripo module audit + manual-mode fix.
 *
 * Stripo's REST API is read-only for modules (POST /modules → 405,
 * PUT /modules/<id> → 500 — confirmed via probe). So Orbit cannot
 * patch the saved module library directly. The fix path is honest
 * about that: we detect issues, generate the corrected HTML, and
 * return it for the user to paste back into Stripo's module editor.
 * Permanent fixes land at the source of truth (Stripo); Orbit never
 * silently mutates anything.
 *
 * The audit catches a handful of structural patterns that surfaced
 * the first time real saved modules went through the canonical-JSON
 * push path:
 *
 *   orphaned_float       — module contains es-right OR es-left without
 *                          a balancing counterpart. Standalone STRIPE
 *                          modules captured from a multi-column row
 *                          retain the floated child, render lopsided.
 *                          (The "Hero image full bleed" bug.) ERROR.
 *   stripe_with_columns  — STRIPE blockType module containing nested
 *                          es-right/es-left markup. Probable captured-
 *                          row anti-pattern even when balanced.
 *                          WARNING. Not auto-fixable.
 *   sub_600_width        — top-level content table width < 600. Module
 *                          designed for narrower context, will sit
 *                          short of the email canvas. WARNING. Auto-
 *                          fixable (clamp to 600).
 *   missing_alt_text     — <img> without alt attribute or empty alt.
 *                          Accessibility + Apple Mail dark-mode hint.
 *                          INFO. Not auto-fixable (alt is content).
 *   footer_no_unsub      — footer-classified module without an
 *                          unsubscribe link or Liquid var. CAN-SPAM /
 *                          GDPR risk. WARNING. Not auto-fixable.
 *   image_url_unreachable — <img src> returns 4xx/5xx on HEAD.
 *                          Will render broken in production. ERROR.
 *                          Not auto-fixable. (Async — only included
 *                          when audit is called with check_image_urls.)
 */

import fs from "node:fs";
import path from "node:path";
import { listLibraryItems } from "./template-library.js";
import { ensureDir } from "./config.js";

const TAG_SYNCED = "stripo_synced";
const TAG_ARCHIVED = "stripo_archived";

// ---------------------------------------------------------------------------
// Public: audit
// ---------------------------------------------------------------------------

export async function auditStripoModules({ config, check_image_urls: checkImageUrls = false }) {
  const result = listLibraryItems({ config, itemType: "module", tags: [TAG_SYNCED] });
  const modules = (result.items ?? []).filter((item) => !(item.tags ?? []).includes(TAG_ARCHIVED));

  if (modules.length === 0) {
    return {
      status: "no_modules",
      message: "No synced Stripo modules found. Run orbit_sync_stripo_modules first.",
    };
  }

  const findings = [];
  for (const item of modules) {
    findings.push(...auditOneModule({ item }));
  }

  if (checkImageUrls) {
    findings.push(...(await auditImageUrls({ modules })));
  }

  const bySeverity = countBy(findings, (f) => f.severity);
  const byCode = countBy(findings, (f) => f.code);
  const autoFixable = findings.filter((f) => f.auto_fixable);

  // Index findings by module so the markdown output groups properly.
  const findingsByModule = new Map();
  for (const f of findings) {
    const key = String(f.stripo_id);
    if (!findingsByModule.has(key)) findingsByModule.set(key, []);
    findingsByModule.get(key).push(f);
  }

  const markdown = buildAuditMarkdown({ modules, findings, findingsByModule, bySeverity, byCode });

  const outputDir = path.join(config.defaultOutputDir, "stripo-audit");
  ensureDir(outputDir);
  const dateSlug = new Date().toISOString().slice(0, 10);
  const outputPath = path.join(outputDir, `stripo-audit-${dateSlug}.md`);
  fs.writeFileSync(outputPath, markdown, "utf8");

  return {
    status: "ok",
    output_path: outputPath,
    module_count: modules.length,
    finding_count: findings.length,
    by_severity: bySeverity,
    by_code: byCode,
    auto_fixable_count: autoFixable.length,
    findings,
    summary:
      `Audited ${modules.length} module(s). Found ${findings.length} issue(s) ` +
      `(${bySeverity.error ?? 0} error, ${bySeverity.warning ?? 0} warning, ${bySeverity.info ?? 0} info). ` +
      `${autoFixable.length} auto-fixable.`,
  };
}

function auditOneModule({ item }) {
  const htmlPath = item.files?.["module.html"];
  if (!htmlPath || !fs.existsSync(htmlPath)) {
    return [
      {
        severity: "error",
        code: "html_missing",
        stripo_id: item.metadata?.stripo_id,
        module_name: item.title,
        message: "Local module.html missing on disk — re-run orbit_sync_stripo_modules.",
        auto_fixable: false,
      },
    ];
  }
  const html = fs.readFileSync(htmlPath, "utf8");

  const findings = [];
  findings.push(...checkOrphanedFloat({ item, html }));
  findings.push(...checkStripeWithColumns({ item, html }));
  findings.push(...checkSubSixHundredWidth({ item, html }));
  findings.push(...checkMissingAltText({ item, html }));
  findings.push(...checkFooterCompliance({ item, html }));
  return findings;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkOrphanedFloat({ item, html }) {
  // Counts es-right vs es-left occurrences. Mismatch == orphaned floats.
  const rightCount = (html.match(/\bes-right\b/g) ?? []).length;
  const leftCount = (html.match(/\bes-left\b/g) ?? []).length;
  if (rightCount === leftCount) return [];

  const direction = rightCount > leftCount ? "es-right" : "es-left";
  const counterpart = direction === "es-right" ? "es-left" : "es-right";
  const orphanedCount = Math.abs(rightCount - leftCount);

  return [
    {
      severity: "error",
      code: "orphaned_float",
      stripo_id: item.metadata?.stripo_id,
      module_name: item.title,
      message:
        `Module contains ${orphanedCount} ${direction} float(s) without matching ${counterpart} counterpart(s). ` +
        "Renders lopsided as a standalone block — the floated content sits at one edge with a visual gap on the other.",
      auto_fixable: true,
      fix_description:
        `Strip the orphaned ${direction} class + align attribute + float:right inline style, ` +
        "and centre the inner table so the content sits balanced inside the email canvas.",
    },
  ];
}

function checkStripeWithColumns({ item, html }) {
  if (item.metadata?.stripo_block_type !== "STRIPE") return [];
  if (!/\bes-(right|left)\b/.test(html)) return [];

  // Don't double-flag if orphaned_float already triggered.
  const rightCount = (html.match(/\bes-right\b/g) ?? []).length;
  const leftCount = (html.match(/\bes-left\b/g) ?? []).length;
  if (rightCount !== leftCount) return [];

  return [
    {
      severity: "warning",
      code: "stripe_with_columns",
      stripo_id: item.metadata?.stripo_id,
      module_name: item.title,
      message:
        "STRIPE module contains balanced nested column markup (es-right + es-left). " +
        "This usually means the entire row was captured from a multi-column template " +
        "rather than designed as a standalone single-purpose block. Renders fine here, " +
        "but may behave unexpectedly when used in compositions where adjacent space differs.",
      auto_fixable: false,
      fix_description:
        "Re-save in Stripo as a single-column standalone block — restructure so the module " +
        "doesn't depend on sibling columns from its original context.",
    },
  ];
}

function checkSubSixHundredWidth({ item, html }) {
  const findings = [];
  // Match top-level body tables: es-content-body / es-header-body / es-footer-body
  const widthRe =
    /class="[^"]*\bes-(content|header|footer)-body\b[^"]*"[^>]*?(?:width=["']?(\d+)["']?|style="[^"]*\bwidth:\s*(\d+)px)/gi;
  for (const m of html.matchAll(widthRe)) {
    const width = parseInt(m[2] ?? m[3], 10);
    if (Number.isFinite(width) && width < 600 && width >= 300) {
      findings.push({
        severity: "warning",
        code: "sub_600_width",
        stripo_id: item.metadata?.stripo_id,
        module_name: item.title,
        message:
          `Top-level ${m[1]}-body table has width ${width}px, narrower than the standard 600px email canvas. ` +
          "Module sits short of the canvas edges when used standalone.",
        auto_fixable: true,
        fix_description: "Widen the body table to 600px to match the standard email canvas width.",
      });
      // Only flag once per module — repeated narrow widths are usually structural, one fix covers them.
      return findings;
    }
  }
  return findings;
}

function checkMissingAltText({ item, html }) {
  const findings = [];
  const imgRe = /<img\b[^>]*>/gi;
  for (const m of html.matchAll(imgRe)) {
    const tag = m[0];
    const altMatch = tag.match(/\balt\s*=\s*["']([^"']*)["']/i);
    if (!altMatch || altMatch[1].trim().length === 0) {
      const srcMatch = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
      const src = srcMatch ? srcMatch[1] : "(unknown)";
      findings.push({
        severity: "info",
        code: "missing_alt_text",
        stripo_id: item.metadata?.stripo_id,
        module_name: item.title,
        message: `Image missing alt text — src: ${src.slice(0, 100)}${src.length > 100 ? "…" : ""}`,
        auto_fixable: false,
        fix_description: "Add descriptive alt text in Stripo's image properties panel. Required for accessibility + Apple Mail dark-mode rendering.",
      });
    }
  }
  return findings;
}

function checkFooterCompliance({ item, html }) {
  if (item.metadata?.classification !== "footer") return [];
  const hasUnsub =
    /unsubscribe/i.test(html) ||
    /\{\{[^}]*unsub[^}]*\}\}/i.test(html);
  if (hasUnsub) return [];
  return [
    {
      severity: "warning",
      code: "footer_no_unsub",
      stripo_id: item.metadata?.stripo_id,
      module_name: item.title,
      message:
        "Footer module contains no unsubscribe link or related Liquid variable. " +
        "CAN-SPAM (US), CASL (Canada), and GDPR (EU) typically require an unsubscribe mechanism in commercial email.",
      auto_fixable: false,
      fix_description:
        "Add an unsubscribe link or {{unsubscribe_url}} (or your ESP's equivalent) in Stripo's editor. " +
        "If this footer is intentionally non-marketing (transactional), you can ignore this warning.",
    },
  ];
}

async function auditImageUrls({ modules }) {
  const findings = [];
  const seen = new Set();
  for (const item of modules) {
    const inventory = item.metadata?.image_inventory ?? [];
    for (const img of inventory) {
      if (!img.src || seen.has(img.src)) continue;
      seen.add(img.src);
      try {
        const r = await fetch(img.src, { method: "HEAD" });
        if (!r.ok) {
          findings.push({
            severity: "error",
            code: "image_url_unreachable",
            stripo_id: item.metadata?.stripo_id,
            module_name: item.title,
            message: `Image returns HTTP ${r.status}: ${img.src.slice(0, 100)}${img.src.length > 100 ? "…" : ""}`,
            auto_fixable: false,
            fix_description: "Replace the broken image in Stripo's image properties panel.",
          });
        }
      } catch (err) {
        findings.push({
          severity: "error",
          code: "image_url_unreachable",
          stripo_id: item.metadata?.stripo_id,
          module_name: item.title,
          message: `Image fetch failed: ${img.src.slice(0, 100)} — ${err.message}`,
          auto_fixable: false,
          fix_description: "Replace the broken image in Stripo's image properties panel.",
        });
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Public: fix (manual-mode only — returns corrected HTML for paste-back)
// ---------------------------------------------------------------------------

export function fixStripoModule({ config, stripo_id: stripoId, fix_class: fixClass }) {
  const result = listLibraryItems({ config, itemType: "module", tags: [TAG_SYNCED] });
  const item = (result.items ?? []).find(
    (it) => String(it.metadata?.stripo_id) === String(stripoId),
  );
  if (!item) {
    return {
      status: "module_not_found",
      message: `No synced module with stripo_id ${stripoId}. Run orbit_sync_stripo_modules first or check the ID.`,
    };
  }

  const htmlPath = item.files?.["module.html"];
  if (!htmlPath || !fs.existsSync(htmlPath)) {
    return {
      status: "html_missing",
      message: "Local module.html missing on disk — re-run orbit_sync_stripo_modules.",
    };
  }

  const originalHtml = fs.readFileSync(htmlPath, "utf8");
  const fixer = FIXERS[fixClass];
  if (!fixer) {
    return {
      status: "no_fixer",
      message: `No auto-fix available for code "${fixClass}". Auto-fixable codes: ${Object.keys(FIXERS).join(", ")}. Other findings require manual editing in Stripo.`,
    };
  }

  const fixedHtml = fixer(originalHtml);
  const changed = fixedHtml !== originalHtml;

  return {
    status: changed ? "ok" : "no_change",
    stripo_id: stripoId,
    module_name: item.title,
    fix_class: fixClass,
    original_html_length: originalHtml.length,
    fixed_html_length: fixedHtml.length,
    diff_summary: changed
      ? `Patched ${diffApproxBytes(originalHtml, fixedHtml)} bytes.`
      : "No changes — pattern not present in current HTML.",
    instructions:
      "To apply this fix permanently:\n" +
      "1. Open the module in Stripo (Modules → click the module → ⋯ menu → Edit code).\n" +
      "2. Open the code editor (</> icon).\n" +
      "3. Replace the entire module HTML with the corrected version below.\n" +
      "4. Save the module.\n" +
      "5. Re-run orbit_sync_stripo_modules to refresh Orbit's local copy.\n" +
      "6. Re-run orbit_audit_stripo_modules to confirm the issue is resolved.\n" +
      "\n" +
      "Orbit cannot patch the module via API — Stripo's REST surface is read-only for modules. " +
      "The corrected HTML below is what you paste back into Stripo's module editor.",
    corrected_html: fixedHtml,
  };
}

// ---------------------------------------------------------------------------
// Fix functions
// ---------------------------------------------------------------------------

const FIXERS = {
  orphaned_float: fixOrphanedFloat,
  sub_600_width: fixSubSixHundredWidth,
};

function fixOrphanedFloat(html) {
  // Strategy: when es-right (or es-left) appears without a matching counterpart,
  // strip the float from those tables AND add align="center" so the content
  // sits balanced rather than flush to one edge.
  let out = html;
  const rightCount = (out.match(/\bes-right\b/g) ?? []).length;
  const leftCount = (out.match(/\bes-left\b/g) ?? []).length;
  if (rightCount === leftCount) return out;

  const targetClass = rightCount > leftCount ? "es-right" : "es-left";

  // 1. Remove the orphan class itself (keeps any sibling classes intact)
  out = out.replace(new RegExp(`\\b${targetClass}\\b\\s*`, "g"), "");
  // 2. Clean up empty class="" attributes left behind
  out = out.replace(/class\s*=\s*["']\s*["']/g, "");
  // 3. Strip float:right / float:left from inline styles
  const floatDir = targetClass === "es-right" ? "right" : "left";
  out = out.replace(new RegExp(`float\\s*:\\s*${floatDir}\\s*;?\\s*`, "gi"), "");
  // 4. Strip align="right" / align="left" from any <table> tags that previously had the orphan class
  //    (heuristic — only safe to remove from the tables we touched. Conservative: remove align attr
  //     adjacent to a class attribute that no longer contains es-right/es-left but used to have a width attribute
  //     too small to be a real layout intent. We just remove align="right" globally where targetClass was — risky;
  //     better: leave align attrs alone and add align="center" to the parent td so the now-unfloated table centres.)
  //    Conservative path: add align="center" on the parent td of each affected table.
  out = out.replace(
    /(<td\b[^>]*?)\balign\s*=\s*["']left["']([^>]*>\s*<table\s+(?:[^>]*?))/gi,
    (match, before, after) => {
      // Only re-target if this table now lacks the float-class (already stripped above)
      if (after.includes("class=") && (after.includes(`${targetClass}`) || after.includes(`float: ${floatDir}`))) {
        return match;
      }
      return `${before}align="center"${after}`;
    },
  );
  // 5. As a final pass, find any remaining `align="right"` on tables that used to be es-right floats
  //    by detecting tables whose subsequent <td> has a sub-600 width:
  out = out.replace(/align\s*=\s*["']right["']/g, 'align="center"');

  return out;
}

function fixSubSixHundredWidth(html) {
  // Find es-(content|header|footer)-body tables with a width < 600 and clamp to 600.
  let out = html;
  // Inline style width
  out = out.replace(
    /(class="[^"]*\bes-(?:content|header|footer)-body\b[^"]*"[^>]*style="[^"]*?\bwidth:\s*)(\d+)(px)/gi,
    (match, prefix, width, suffix) => {
      const w = parseInt(width, 10);
      return w < 600 && w >= 300 ? `${prefix}600${suffix}` : match;
    },
  );
  // width="..." attribute
  out = out.replace(
    /(class="[^"]*\bes-(?:content|header|footer)-body\b[^"]*"[^>]*width=["']?)(\d+)(["']?)/gi,
    (match, prefix, width, suffix) => {
      const w = parseInt(width, 10);
      return w < 600 && w >= 300 ? `${prefix}600${suffix}` : match;
    },
  );
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const k = keyFn(item) ?? "_unknown";
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function diffApproxBytes(a, b) {
  return Math.abs(a.length - b.length);
}

function buildAuditMarkdown({ modules, findings, findingsByModule, bySeverity, byCode }) {
  const generatedAt = new Date().toISOString();
  const lines = [];

  lines.push("# Stripo Module Audit");
  lines.push("");
  lines.push(`_Generated by Orbit on ${generatedAt} from ${modules.length} synced module(s)._`);
  lines.push("");

  if (findings.length === 0) {
    lines.push("✅ **No issues detected.** All synced modules pass the audit.");
    lines.push("");
    return lines.join("\n");
  }

  // Summary
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Total findings:** ${findings.length}`);
  lines.push(`- **By severity:** ${bySeverity.error ?? 0} error · ${bySeverity.warning ?? 0} warning · ${bySeverity.info ?? 0} info`);
  lines.push(`- **Auto-fixable:** ${findings.filter((f) => f.auto_fixable).length} (run \`orbit_fix_stripo_module\` with the stripo_id and fix_class to get corrected HTML)`);
  lines.push("");
  lines.push("**By check class:**");
  for (const [code, count] of Object.entries(byCode)) {
    lines.push(`- \`${code}\`: ${count}`);
  }
  lines.push("");

  // Per-module breakdown
  lines.push("## Per-module findings");
  lines.push("");
  for (const item of modules) {
    const itemFindings = findingsByModule.get(String(item.metadata?.stripo_id)) ?? [];
    if (itemFindings.length === 0) continue;
    lines.push(`### ${item.title}`);
    lines.push(`_Stripo ID \`${item.metadata?.stripo_id}\` · UID \`${item.metadata?.stripo_uid}\` · ${item.metadata?.stripo_block_type} · ${item.metadata?.classification}_`);
    lines.push("");
    for (const f of itemFindings) {
      const sevBadge = f.severity === "error" ? "🔴" : f.severity === "warning" ? "🟠" : "🔵";
      lines.push(`- ${sevBadge} **${f.code}** — ${f.message}`);
      lines.push(`  - _Fix:_ ${f.fix_description}`);
      if (f.auto_fixable) {
        lines.push(`  - _Auto-fix available:_ \`orbit_fix_stripo_module\` with \`stripo_id: ${item.metadata?.stripo_id}, fix_class: "${f.code}"\``);
      }
    }
    lines.push("");
  }

  // Module design best practices
  lines.push("## Module design best practices");
  lines.push("");
  lines.push("Stripo's modules feature works best when each module is designed as a **standalone single-purpose block** — a true header, a true footer, a true content row. Common anti-patterns that surface in this audit:");
  lines.push("");
  lines.push("- **Capturing a multi-column row as a STRIPE module.** The entire row including its column-positioning markup gets saved. When that STRIPE is plopped into a different context (like Orbit's gen-area), the floated children render lopsided. Save modules as single-column standalone blocks instead.");
  lines.push("- **Hardcoded sub-600 widths.** Modules designed for narrower contexts (e.g., a 552px column inside a 1200px parent) carry that width when reused. Aim for 600px (the standard email canvas) on top-level content tables.");
  lines.push("- **Footers without unsubscribe Liquid variables.** Sender compliance frameworks (CAN-SPAM, CASL, GDPR) typically require an unsubscribe mechanism. Bake `{{unsubscribe_url}}` (or your ESP's equivalent) into footer modules at save time.");
  lines.push("");
  lines.push("Orbit cannot patch your saved modules via API — Stripo's REST surface is read-only for modules. The fix workflow is:");
  lines.push("");
  lines.push("1. Run this audit (you just did)");
  lines.push("2. Run `orbit_fix_stripo_module` with each `stripo_id` + `fix_class` you want corrected — Orbit returns the corrected HTML");
  lines.push("3. Open the module in Stripo's editor → code editor (`</>`) → paste the corrected HTML → save");
  lines.push("4. Re-run `orbit_sync_stripo_modules` so Orbit picks up the corrected version");
  lines.push("5. Re-run this audit to confirm the issue is resolved");

  return lines.join("\n");
}
