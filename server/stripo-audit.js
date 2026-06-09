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
 *   table_background_image — a <table> carries a background image
 *                          (background="…" or background-image:url(…)).
 *                          Gmail / Outlook / Braze strip table background
 *                          images, so the panel/gradient renders in the
 *                          Stripo editor but collapses to no fill on send.
 *                          The same image on a <td> survives. WARNING.
 *                          Not auto-fixable (move bg to a wrapping <td>
 *                          + keep a bgcolor fallback).
 *   image_url_unreachable — <img src> returns 4xx/5xx on HEAD.
 *                          Will render broken in production. ERROR.
 *                          Not auto-fixable. (Async — only included
 *                          when audit is called with check_image_urls.)
 */

import fs from "node:fs";
import path from "node:path";
import { listLibraryItems } from "./template-library.js";
import { ensureDir } from "./config.js";
import {
  parseDynamicBlockConfig,
  detectStaticAssetPattern,
  detectNestingHazards,
} from "./stripo-module-bindings-inspect.js";

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
  findings.push(...checkStaticAssetPattern({ item, html }));
  findings.push(...checkNestingHazards({ item, html }));
  findings.push(...checkPaddingClassFlattenRisk({ item, html }));
  findings.push(...checkTableBackgroundImage({ item, html }));
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

function checkPaddingClassFlattenRisk({ item, html }) {
  // ── Stripo es-p* padding classes silently flatten on ESP export ──────────
  //
  // Stripo's es-p<N><side> utility classes (es-p40l, es-p226r, es-p24t…) and the
  // bare all-sides es-p<N> hold padding ONLY as CSS classes, not as native block
  // spacing. They render correctly in the Stripo editor and in Orbit-composed
  // emails (the gen-area master template ships helper CSS that backs them). BUT
  // when the email is exported to an ESP via Stripo's OWN export — e.g. Stripo's
  // "Export to Braze" integration — Stripo bakes each block's spacing from its
  // NATIVE padding model, which is 0 for class-only padding, and discards the
  // es-p* classes. The exported email then ships with padding:0 and the desktop
  // layout collapses (worst on chat-bubble, comparison, and other asymmetric
  // blocks; full-bleed images survive because they have no padding to lose).
  //
  // This is a Stripo-side export behaviour, not an Orbit bug — Orbit isn't in the
  // Stripo→ESP hop. The only durable fix is module-side: re-express the padding as
  // native inline padding and enable "Keep Module Styles" so Stripo preserves it.
  // Confirmed against Braze, May–Jun 2026.
  const padClasses = [...new Set((html.match(/\bes-p\d+[trbl]?\b/g) ?? []))]
    .filter((c) => !c.startsWith("es-m-"))
    .sort();
  if (padClasses.length === 0) return [];

  return [
    {
      severity: "warning",
      code: "padding_classes_flatten_on_export",
      stripo_id: item.metadata?.stripo_id,
      module_name: item.title,
      message:
        `Module holds its padding in ${padClasses.length} Stripo es-p* utility class(es) ` +
        `(${padClasses.join(", ")}). These look correct in the Stripo editor and in Orbit-composed ` +
        "emails, but Stripo's own ESP export (e.g. Export to Braze) bakes spacing from each block's " +
        "native padding model — which is 0 for class-only padding — and drops the classes. The exported " +
        "email then ships with padding:0 and the desktop layout collapses. This is Stripo-side export " +
        "behaviour, not an Orbit bug.",
      auto_fixable: false,
      fix_description:
        "Module-side fix (the only durable one): in Stripo, convert each affected block's padding from " +
        'es-p* classes to NATIVE inline padding — set the four sides in the block\'s Spacing panel, or ' +
        'hand-write style="padding: <top> <right> <bottom> <left>" — then turn ON "Keep Module Styles" for ' +
        "the module so Stripo preserves the inline padding instead of normalising it back to a class. Native " +
        "inline padding survives the ESP export; es-p* classes do not. Keep the mobile es-m-p* classes as-is " +
        "(they are unaffected). Re-sync after editing.",
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

/**
 * Flag <table> elements that carry a background image (background="…" attribute
 * or background-image:url(…) in style). Gmail, Outlook (Word engine), and
 * several ESP renderers — including Braze's — strip background images on
 * <table> elements, so a panel/gradient that looks fine in the Stripo editor
 * collapses to no fill once exported and sent. The same image on a <td>
 * survives. This is the load-bearing gotcha of the Stripo → Braze handshake
 * for modular chat/panel backgrounds: build the fill on a <td>, not a <table>,
 * and keep a solid bgcolor on that <td> as the belt-and-braces fallback.
 */
function checkTableBackgroundImage({ item, html }) {
  const findings = [];
  const tableRe = /<table\b[^>]*>/gi;
  for (const m of html.matchAll(tableRe)) {
    const tag = m[0];
    const hasBgAttr = /\sbackground\s*=\s*["'][^"']+["']/i.test(tag);
    const hasBgImg = /background-image\s*:\s*url\(/i.test(tag);
    if (hasBgAttr || hasBgImg) {
      findings.push({
        severity: "warning",
        code: "table_background_image",
        stripo_id: item.metadata?.stripo_id,
        module_name: item.title,
        message:
          "A <table> in this module carries a background image (background=\"…\" attribute or " +
          "background-image:url(…) in its style). Gmail, Outlook, and several ESP renderers — including " +
          "Braze's — strip background images on <table> elements, so the panel/gradient collapses to no fill " +
          "on send even though it renders correctly in the Stripo editor. The identical image on a <td> survives.",
        auto_fixable: false,
        fix_description:
          "Move the background off the <table> and onto a wrapping <td class=\"esd-structure\"> that holds the " +
          "module's content (background=\"…\" + background-image:url(…) on the <td>), and keep a solid bgcolor on " +
          "that same <td> as the fallback for clients that also drop <td> background images " +
          "(e.g. bgcolor=\"#c1e9ff\"). This mirrors how Stripo's hero/structure modules apply gradients so they " +
          "survive the Stripo → Braze handshake.",
      });
      return findings; // one finding per module — the fix is structural, one note covers it
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

/**
 * Flag modules that bind ≥3 image-src variables — almost always a
 * repeating-asset design (tick markers, badge grid, brand-logo wall)
 * where the URLs are part of the design, not dynamic content. Surfaced
 * by comparison-table style modules with multiple p_image* variables
 * acting as fixed yes/no tick markers that should never be LLM-populated.
 * The durable fix is an HTML comment at the top of the module documenting
 * which variables are static-by-design + the canonical asset URLs.
 * Stripo's Smart Element wizard auto-re-registers esd-gen-* classes on
 * module re-open, so Data-tab deregistration alone does not stick.
 */
function checkStaticAssetPattern({ item, html }) {
  const { variables } = parseDynamicBlockConfig(html);
  const staticVars = detectStaticAssetPattern({
    registeredVariables: variables,
    moduleHtml: html,
  });
  if (staticVars.length === 0) return [];

  const varList = staticVars.map((n) => `\`${n}\``).join(", ");
  return [
    {
      severity: "info",
      code: "static_asset_pattern",
      stripo_id: item.metadata?.stripo_id,
      module_name: item.title,
      message:
        `${staticVars.length} image-bound variables (${varList}) look like a repeating-asset design (tick markers, badge grid, brand-logo wall). ` +
        "If these URLs are part of the module's *design* rather than dynamic content, the LLM should not be populating them at compose time.",
      auto_fixable: false,
      fix_description:
        "Add an HTML comment at the top of the module documenting which variables are static-by-design + the canonical asset URLs. " +
        "Stripo's Smart Element wizard auto-re-registers `esd-gen-*` classes on module re-open, so Data-tab deregistration alone does not stick — " +
        "the HTML comment is the durable contract. Example:\n\n" +
        "<!--\n" +
        "  Static asset markers — DO NOT bind via Smart Properties at compose time.\n" +
        "  YES_ASSET_URL=https://your-cdn.example.com/tick.png\n" +
        "  NO_ASSET_URL=https://your-cdn.example.com/cross.png\n" +
        "  Layout: Row 1 Col 1 defaults to YES.\n" +
        "-->",
    },
  ];
}

/**
 * Flag modules where one Smart Property selector is an ancestor of
 * another's target. Stripo writes the outer binding by replacing the
 * inner element wholesale — the inner value is clobbered at compose
 * time. Common in comparison-table style modules where multiple outer
 * paragraph bindings (e.g. p_description, p_text2, p_text5) target outer
 * `<p>` wrappers containing nested `<strong>` row_title bindings.
 */
function checkNestingHazards({ item, html }) {
  const { variables } = parseDynamicBlockConfig(html);
  const hazards = detectNestingHazards({
    registeredVariables: variables,
    moduleHtml: html,
  });
  if (hazards.length === 0) return [];

  return hazards.map((h) => ({
    severity: "warning",
    code: "nesting_hazard",
    stripo_id: item.metadata?.stripo_id,
    module_name: item.title,
    message:
      `Variable \`${h.outer}\` (selector \`${h.outer_selector}\`) is an ancestor of variable \`${h.inner}\` (selector \`${h.inner_selector}\`). ` +
      "When Stripo writes the outer binding at compose time, the inner element's content is replaced wholesale — the inner variable's value will be clobbered.",
    auto_fixable: false,
    fix_description:
      "Tighten the outer selector at the HTML layer — add a dedicated inner `<span>` (e.g., `.esd-gen-p-outer-text`) for the outer content so the two bindings target sibling elements rather than ancestor/descendant. Alternatively, unregister one of the two bindings in Stripo's Data tab and document the choice in an HTML comment at the top of the module.",
  }));
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
  lines.push("- **Repeating static assets bound as Smart Properties.** When a module contains ≥3 image-bound variables that document fixed icons / badges / tick markers, Stripo's wizard treats them as dynamic — but they're really part of the design. Add an HTML comment at the top of the module documenting the static contract + canonical URLs. The wizard re-registers `esd-gen-*` classes on module re-open, so the comment is the only durable record of intent.");
  lines.push("- **Nested Smart Property bindings.** When one variable's selector wraps another's target element, Stripo replaces the outer wholesale at compose time and the inner value is silently clobbered. Tighten the outer selector to a dedicated inner `<span>`, or unregister one of the two bindings.");
  lines.push("");
  lines.push("**HTML-comment contract** for complex modules — paste this above the module's outer `<table>` in the Stripo code editor:");
  lines.push("");
  lines.push("```html");
  lines.push("<!--");
  lines.push("  Static asset markers — DO NOT bind via Smart Properties at compose time.");
  lines.push("  Swap src in the module HTML for per-row state.");
  lines.push("  YES_ASSET_URL=https://your-cdn.example.com/tick.png");
  lines.push("  NO_ASSET_URL=https://your-cdn.example.com/cross.png");
  lines.push("  Layout: Row 1 Col 1 defaults to YES, adjust per row as needed.");
  lines.push("-->");
  lines.push("```");
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
