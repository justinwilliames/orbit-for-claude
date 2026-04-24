// Two related HTML linters for email craft work:
//   checkDarkModeRisk() — parse inline text/bg colour pairs, simulate
//                         Apple Mail + Outlook dark-mode inversion,
//                         flag invisible-text risk.
//   accessibilityLint() — WCAG AA checks on email HTML: alt-text
//                         coverage, contrast ratios, semantic order,
//                         heading hierarchy, link-text quality.
//
// Pure string / regex parsing — no headless browser, no DOM. Fast
// enough to run on any email and deterministic enough to be a
// defensible pre-send check.

// ---------------------------------------------------------------------------
// Public: checkDarkModeRisk
// ---------------------------------------------------------------------------

export function checkDarkModeRisk({ html }) {
  if (!html || typeof html !== "string") {
    return { status: "needs_inputs", missing: ["html"] };
  }

  const findings = [];
  const warnings = [];

  // Walk the DOM-ish tree and pair each coloured text element with
  // the nearest background it actually inherits (own element → own
  // style → ancestor bgcolor attribute / ancestor style). This is
  // how colour actually renders in an email client, so any check
  // that only looks at `fg AND bg on the same element` misses the
  // vast majority of real contrast / invert issues.
  const pairs = collectFgBgPairs(html);

  for (const p of pairs) {
    // Light fg on light bg: inverters flip this to dark-on-dark,
    // which is the classic invisibility bug.
    if (!isDark(p.fg) && !isDark(p.bg)) {
      findings.push({
        tag: p.tag,
        fg: colorToHex(p.fg),
        bg: colorToHex(p.bg),
        kind: "invert_risk",
        message: `Light-on-light pair will invert to dark-on-dark in Apple Mail / Outlook mobile dark mode. Add a dark-mode override.`,
      });
    }
    // Dark fg on dark bg: low contrast even without inversion.
    if (isDark(p.fg) && isDark(p.bg)) {
      findings.push({
        tag: p.tag,
        fg: colorToHex(p.fg),
        bg: colorToHex(p.bg),
        kind: "already_dark",
        message: `Dark-on-dark pair has contrast ${contrastRatio(p.fg, p.bg).toFixed(2)}:1 — below WCAG AA (4.5:1).`,
      });
    }
  }

  // Bare near-white text with no discoverable background — partial
  // inverters can land white-on-white.
  for (const bare of collectBareWhiteText(html)) {
    warnings.push({
      tag: bare.tag,
      fg: colorToHex(bare.fg),
      kind: "bare_white_text",
      message:
        "White text with no discoverable background colour — email clients with partial-invert can land white-on-white.",
    });
  }

  // Check for a dark-mode media query in <style>. Its presence is a
  // strong signal the template has been designed for dark mode.
  const hasDarkMediaQuery =
    /@media[^{]*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/i.test(html);
  const hasAppleDarkStyles =
    /\[data-ogsc\]|\[data-ogsb\]|color-scheme\s*:\s*light\s+dark/i.test(html);

  const severity =
    findings.filter((f) => f.kind === "already_dark").length > 0
      ? "fail"
      : findings.length > 0 || warnings.length > 2
        ? "warn"
        : "pass";

  return {
    status: "ok",
    verdict: severity,
    has_dark_mode_media_query: hasDarkMediaQuery,
    has_apple_dark_styles: hasAppleDarkStyles,
    invert_risk_count: findings.filter((f) => f.kind === "invert_risk").length,
    already_dark_count: findings.filter((f) => f.kind === "already_dark").length,
    findings,
    warnings,
    recommendation: hasDarkMediaQuery
      ? "Template has an explicit prefers-color-scheme: dark rule. Manually preview in Apple Mail and Outlook dark mode to confirm."
      : "Add a @media (prefers-color-scheme: dark) block to override key text/bg pairs, and include color-scheme: light dark in <head> to opt into native dark-mode handling.",
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Dark Mode Check",
    },
  };
}

// ---------------------------------------------------------------------------
// Public: accessibilityLint
// ---------------------------------------------------------------------------

export function accessibilityLint({ html }) {
  if (!html || typeof html !== "string") {
    return { status: "needs_inputs", missing: ["html"] };
  }

  const issues = [];
  const passes = [];

  // 1. Alt-text coverage on images.
  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)];
  const noAlt = imgs.filter((m) => !/\balt\s*=\s*["'][^"']*["']/i.test(m[0]));
  const emptyAlt = imgs.filter((m) => /\balt\s*=\s*["']\s*["']/i.test(m[0]));
  if (imgs.length > 0) {
    if (noAlt.length > 0) {
      issues.push({
        rule: "img-alt",
        severity: "fail",
        message: `${noAlt.length} of ${imgs.length} <img> tags missing alt attribute entirely.`,
        recommendation:
          'Every image needs alt="" (decorative, hidden from screen readers) or alt="meaningful description" (content images).',
      });
    } else {
      passes.push({ rule: "img-alt", message: `All ${imgs.length} images have an alt attribute.` });
    }
    if (emptyAlt.length > 0 && emptyAlt.length === imgs.length) {
      issues.push({
        rule: "img-alt-meaningful",
        severity: "warn",
        message: `Every image uses alt="" — fine if they're all decorative, suspect if any carry meaning (hero, logo, CTA image).`,
        recommendation:
          "Review — images that convey meaning need descriptive alt text, not empty alt.",
      });
    }
  }

  // 2. Semantic heading order — ensure h1 exists, and levels don't skip.
  const headings = [...html.matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  const levels = headings.map((h) => parseInt(h[1].slice(1), 10));
  if (headings.length === 0) {
    issues.push({
      rule: "heading-present",
      severity: "warn",
      message: "No headings in the email. Screen-reader users rely on heading navigation.",
      recommendation: "Add at least one <h1> or <h2> for the primary subject of the email.",
    });
  } else {
    const hasH1 = levels.includes(1);
    if (!hasH1) {
      issues.push({
        rule: "h1-present",
        severity: "warn",
        message: "No <h1> — consider promoting the primary heading.",
        recommendation: "Mark the primary subject of the email as <h1> (one per email).",
      });
    }
    let lastLevel = null;
    for (const lvl of levels) {
      if (lastLevel !== null && lvl - lastLevel > 1) {
        issues.push({
          rule: "heading-order",
          severity: "warn",
          message: `Heading jumps from h${lastLevel} to h${lvl} — skipping levels breaks screen-reader semantics.`,
          recommendation: `Use h${lastLevel + 1} instead.`,
        });
        break;
      }
      lastLevel = lvl;
    }
  }

  // 3. Link text quality — flag "click here" / bare URLs.
  const links = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)];
  const vagueLinkText = ["click here", "here", "read more", "learn more", "this"];
  const vagueHits = links.filter((m) => {
    const text = m[1].replace(/<[^>]+>/g, "").trim().toLowerCase();
    return vagueLinkText.includes(text);
  });
  if (vagueHits.length > 0) {
    issues.push({
      rule: "link-text",
      severity: "warn",
      message: `${vagueHits.length} link(s) use vague text ("click here", "here", "read more") — announced out of context by screen readers.`,
      recommendation: 'Use descriptive link text (e.g. "View your order", "Read the deliverability guide").',
    });
  }

  // 4. Contrast ratios — walks the DOM-ish tree and pairs coloured
  //    text elements with the background they actually inherit
  //    (own style → ancestor style → ancestor bgcolor="" attribute).
  //    The old check only fired when fg+bg sat on the same tag,
  //    which misses the vast majority of real email contrast bugs
  //    (text in <p> / <td> inside a <table bgcolor="#fff">).
  const contrastIssues = [];
  for (const p of collectFgBgPairs(html)) {
    const ratio = contrastRatio(p.fg, p.bg);
    if (ratio < 4.5) {
      contrastIssues.push({
        tag: p.tag,
        fg: colorToHex(p.fg),
        bg: colorToHex(p.bg),
        ratio: Math.round(ratio * 100) / 100,
      });
    }
  }
  if (contrastIssues.length > 0) {
    issues.push({
      rule: "contrast-aa",
      severity: "fail",
      message: `${contrastIssues.length} colour pair(s) fall below WCAG AA (4.5:1 for normal text).`,
      recommendation: "Darken the foreground or lighten the background until the ratio clears 4.5:1.",
      samples: contrastIssues.slice(0, 5),
    });
  } else if (html.match(/color\s*:/i)) {
    passes.push({ rule: "contrast-aa", message: "All foreground/background pairs pass WCAG AA (ancestor-resolved)." });
  }

  // 5. Lang attribute on <html>.
  if (!/<html\b[^>]*\blang\s*=/i.test(html)) {
    issues.push({
      rule: "html-lang",
      severity: "warn",
      message: "<html> is missing a lang attribute.",
      recommendation: 'Add lang="en" (or the appropriate locale) to <html> so screen readers use the right pronunciation profile.',
    });
  }

  // 6. Table role — screen readers announce tables by default, but
  // email layout tables should be marked role="presentation" to
  // suppress that announcement.
  const tables = [...html.matchAll(/<table\b[^>]*>/gi)];
  const tablesWithoutRole = tables.filter((t) => !/\brole\s*=\s*["'](presentation|none)["']/i.test(t[0]));
  if (tables.length > 0 && tablesWithoutRole.length / tables.length > 0.5) {
    issues.push({
      rule: "layout-table-role",
      severity: "warn",
      message: `${tablesWithoutRole.length} of ${tables.length} tables lack role="presentation" — screen readers will announce them as data tables.`,
      recommendation: 'Add role="presentation" (or role="none") to every layout table.',
    });
  }

  const severity =
    issues.some((i) => i.severity === "fail")
      ? "fail"
      : issues.length > 0
        ? "warn"
        : "pass";

  return {
    status: "ok",
    verdict: severity,
    fail_count: issues.filter((i) => i.severity === "fail").length,
    warn_count: issues.filter((i) => i.severity === "warn").length,
    issues,
    passes,
    orbit_attribution: {
      heavy: true,
      signature: "Built with Orbit · Accessibility Lint",
    },
  };
}

// ---------------------------------------------------------------------------
// Internals: colour / contrast math
// ---------------------------------------------------------------------------

function cssProp(style, prop) {
  if (!style) return null;
  const m = style.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i"));
  return m ? m[1].trim() : null;
}

// Parse CSS colour strings into {r, g, b} 0-255. Handles #rgb, #rrggbb,
// rgb(), rgba(), hsl(), hsla(), and a small set of named colours.
// Returns null for unresolvable values (currentColor, CSS variables,
// transparent, etc.) so callers can skip them gracefully.
function parseColor(input) {
  if (!input) return null;
  const v = String(input).trim().toLowerCase();
  if (v in NAMED_COLORS) return NAMED_COLORS[v];
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  const rgb = v.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
  const hsl = v.match(
    /^hsla?\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*%?\s*,\s*(\d+(?:\.\d+)?)\s*%/,
  );
  if (hsl) return hslToRgb(+hsl[1], +hsl[2], +hsl[3]);
  return null;
}

function hslToRgb(h, s, l) {
  // Normalise to 0-1.
  const hue = (((h % 360) + 360) % 360) / 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lig = Math.max(0, Math.min(100, l)) / 100;
  if (sat === 0) {
    const v = Math.round(lig * 255);
    return { r: v, g: v, b: v };
  }
  const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
  const p = 2 * lig - q;
  const f = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    r: Math.round(f(hue + 1 / 3) * 255),
    g: Math.round(f(hue) * 255),
    b: Math.round(f(hue - 1 / 3) * 255),
  };
}

function colorToHex(c) {
  if (!c) return null;
  return "#" + [c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

const NAMED_COLORS = {
  black: { r: 0, g: 0, b: 0 },
  white: { r: 255, g: 255, b: 255 },
  red: { r: 255, g: 0, b: 0 },
  green: { r: 0, g: 128, b: 0 },
  blue: { r: 0, g: 0, b: 255 },
  grey: { r: 128, g: 128, b: 128 },
  gray: { r: 128, g: 128, b: 128 },
  transparent: null, // treated as "no background"
};

// WCAG 2.1 relative-luminance contrast.
function relativeLuminance({ r, g, b }) {
  const chan = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la > lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

function isDark(c) {
  return relativeLuminance(c) < 0.3;
}

function isWhiteIsh(c) {
  return c.r > 240 && c.g > 240 && c.b > 240;
}

// ---------------------------------------------------------------------------
// DOM-ish tree walker for colour-pair discovery
// ---------------------------------------------------------------------------
//
// Real email clients render text with colour inheritance: a <p> with
// `color: #6d6d6d` inside a <table bgcolor="#ffffff"> shows grey on
// white. The colour lives on the <p>, the background lives on the
// <table>. Our earlier check only fired when both were on the same
// tag, which misses almost every real email. This walker parses the
// HTML into a flat sequence of open/close/text events, tracks an
// ancestor stack, and emits one { fg, bg, tag } pair per coloured
// text-bearing element — pairing against the nearest resolvable
// ancestor background.

const SELF_CLOSING_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr",
]);

// Parse open/close tags in source order, keeping an ancestor stack.
// Returns a list of { tag, style, bgcolor } entries with full
// ancestry for each open tag that has text content (direct or
// inherited).
function collectFgBgPairs(html) {
  const pairs = [];
  const tagRegex = /<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi;
  const stack = [];
  let lastIndex = 0;
  for (const m of html.matchAll(tagRegex)) {
    const textBetween = html.slice(lastIndex, m.index);
    lastIndex = m.index + m[0].length;

    // If the slice between the previous tag and this one has visible
    // text, attribute it to the top of the stack.
    const hasText = /\S/.test(stripInnerTags(textBetween));
    if (hasText && stack.length > 0) {
      emitPairFor(stack[stack.length - 1], stack, pairs);
    }

    const raw = m[0];
    const tagName = m[1].toLowerCase();
    const isClose = raw.startsWith("</");
    if (isClose) {
      // Pop back to matching open. Email HTML is messy; we tolerate
      // mismatches by unwinding until we find the opener or empty.
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tagName) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (SELF_CLOSING_TAGS.has(tagName)) continue;
    const isSelfClosing = /\/\s*>$/.test(raw);
    if (isSelfClosing) continue;

    const frame = {
      tag: tagName,
      style: (m[2].match(/\bstyle\s*=\s*["']([^"']+)["']/i) || [])[1] ?? "",
      bgcolorAttr: (m[2].match(/\bbgcolor\s*=\s*["']([^"']+)["']/i) || [])[1] ?? null,
    };
    stack.push(frame);
  }
  return pairs;
}

function emitPairFor(frame, stack, pairs) {
  const fg = parseColor(cssProp(frame.style, "color"));
  if (!fg) return;
  // Walk ancestors (innermost first) looking for a resolvable bg.
  for (let i = stack.length - 1; i >= 0; i--) {
    const a = stack[i];
    const bg =
      parseColor(cssProp(a.style, "background-color")) ||
      parseColor(cssProp(a.style, "background")) ||
      parseColor(a.bgcolorAttr);
    if (bg) {
      pairs.push({ tag: frame.tag, fg, bg });
      return;
    }
  }
  // No background found anywhere up the ancestry — skip (we can't
  // make claims about contrast without knowing the backdrop).
}

// Find near-white text with no discoverable background. Used by
// dark-mode checker to flag partial-invert risks.
function collectBareWhiteText(html) {
  const bare = [];
  const tagRegex = /<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi;
  const stack = [];
  let lastIndex = 0;
  for (const m of html.matchAll(tagRegex)) {
    const textBetween = html.slice(lastIndex, m.index);
    lastIndex = m.index + m[0].length;
    const hasText = /\S/.test(stripInnerTags(textBetween));
    if (hasText && stack.length > 0) {
      const frame = stack[stack.length - 1];
      const fg = parseColor(cssProp(frame.style, "color"));
      if (fg && isWhiteIsh(fg)) {
        let hasBg = false;
        for (let i = stack.length - 1; i >= 0; i--) {
          const a = stack[i];
          if (
            parseColor(cssProp(a.style, "background-color")) ||
            parseColor(cssProp(a.style, "background")) ||
            parseColor(a.bgcolorAttr)
          ) {
            hasBg = true;
            break;
          }
        }
        if (!hasBg) bare.push({ tag: frame.tag, fg });
      }
    }
    const raw = m[0];
    const tagName = m[1].toLowerCase();
    const isClose = raw.startsWith("</");
    if (isClose) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === tagName) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (SELF_CLOSING_TAGS.has(tagName)) continue;
    const isSelfClosing = /\/\s*>$/.test(raw);
    if (isSelfClosing) continue;
    stack.push({
      tag: tagName,
      style: (m[2].match(/\bstyle\s*=\s*["']([^"']+)["']/i) || [])[1] ?? "",
      bgcolorAttr: (m[2].match(/\bbgcolor\s*=\s*["']([^"']+)["']/i) || [])[1] ?? null,
    });
  }
  return bare;
}

function stripInnerTags(s) {
  return String(s).replace(/<[^>]+>/g, "");
}
