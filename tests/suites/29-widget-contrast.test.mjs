/**
 * Widget contrast guard.
 *
 * Orbit's render gate and QA report tell a marketer their email fails
 * WCAG AA. Four of the status pills those tools render their own verdicts
 * in failed the same bar: WARN at 2.90:1, PASS at 3.40:1, the brand pill
 * at 3.49:1 in dark, the pending pill at 4.07:1 — all at 11px, where the
 * large-text 3:1 concession does not apply.
 *
 * Nothing would have caught that. The contrast maths lives in
 * server/ui/widgets/render-gate.js and only ever runs against a user's
 * email, never against Orbit's own chrome. This suite closes that: it
 * parses the actual token declarations out of tokens.js and runs every
 * pill's foreground/background pair through the same WCAG formula, in
 * both palettes.
 *
 * If you change a colour in tokens.js and this fails, the colour is
 * wrong, not the test.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ORBIT_TOKENS_CSS, ORBIT_BASE_CSS } from "../../server/ui/tokens.js";

/** WCAG 2.x relative luminance for an #rrggbb string. */
function luminance(hex) {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two #rrggbb strings. */
function contrastRatio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Pull `--token: #hex;` declarations out of a CSS block.
 *
 * Read from the shipped string rather than duplicated here on purpose —
 * a hard-coded copy would keep passing after someone edited tokens.js.
 */
function tokensFrom(css) {
  const out = {};
  for (const [, name, value] of css.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    out[name] = value;
  }
  return out;
}

/** The two palettes, taken from the explicit-theme blocks. */
function palette(theme) {
  const block = ORBIT_TOKENS_CSS.split(`:root[data-theme="${theme}"] {`)[1];
  assert.ok(block, `tokens.js has no :root[data-theme="${theme}"] block`);
  return tokensFrom(block.split("}")[0]);
}

/** Every .o-pill variant: [label, foreground token, background token]. */
const PILL_PAIRS = [
  ["o-pill--ok", "ok-strong", "ok-wash"],
  ["o-pill--warn", "warn", "warn-wash"],
  ["o-pill--active", "active-strong", "active-wash"],
  ["o-pill--brand", "brand-ink", "brand-wash"],
  ["o-pill--pending", "ink-3", "sunk"],
];

// .o-pill declares font-size: 11px, so AA normal text applies. Asserted
// rather than assumed — if someone bumps the pill to 19px the 3:1 floor
// becomes legal and this suite is over-strict, which is worth knowing.
const AA_NORMAL = 4.5;

describe("Widget contrast — Orbit's own chrome clears the bar it enforces", () => {
  test(".o-pill is small text, so the 4.5:1 floor is the right one", () => {
    assert.match(
      ORBIT_BASE_CSS,
      /\.o-pill\s*\{[^}]*font-size:\s*11px/,
      ".o-pill is no longer 11px — re-check which WCAG threshold applies before relaxing this suite"
    );
  });

  for (const theme of ["light", "dark"]) {
    test(`every status pill clears AA in the ${theme} palette`, () => {
      const p = palette(theme);
      const failures = [];
      for (const [label, fgToken, bgToken] of PILL_PAIRS) {
        const fg = p[fgToken];
        const bg = p[bgToken];
        assert.ok(fg, `${theme}: --${fgToken} is not declared as a hex literal`);
        assert.ok(bg, `${theme}: --${bgToken} is not declared as a hex literal`);
        const ratio = contrastRatio(fg, bg);
        if (ratio < AA_NORMAL) {
          failures.push(`${label} — ${fg} on ${bg} = ${ratio.toFixed(2)}:1 (needs ${AA_NORMAL})`);
        }
      }
      assert.deepEqual(
        failures,
        [],
        `${theme} palette pills fail the contrast bar Orbit enforces on user email:\n  ${failures.join("\n  ")}`
      );
    });
  }

  test("body text clears AA on every surface it sits on", () => {
    const failures = [];
    for (const theme of ["light", "dark"]) {
      const p = palette(theme);
      for (const ink of ["ink", "ink-2", "ink-3"]) {
        for (const ground of ["paper", "card", "sunk"]) {
          const ratio = contrastRatio(p[ink], p[ground]);
          if (ratio < AA_NORMAL) {
            failures.push(`${theme}: --${ink} on --${ground} = ${ratio.toFixed(2)}:1`);
          }
        }
      }
    }
    assert.deepEqual(failures, [], `text tokens below AA:\n  ${failures.join("\n  ")}`);
  });
});
