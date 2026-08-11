/**
 * Orbit widget design tokens.
 *
 * Every Orbit MCP App widget is styled through these, so a palette
 * change lands everywhere at once instead of drifting per surface.
 *
 * ---- THEMING ---------------------------------------------------------
 * The palette is declared four times — :root (light default),
 * @media (prefers-color-scheme: dark), then :root[data-theme="dark"] and
 * :root[data-theme="light"] — so a host that stamps an explicit theme
 * onto the document wins over the media query in BOTH directions. No
 * component rule ever lives inside a media query; components read tokens
 * only. This is the same discipline as the lifecycle-brain review
 * gallery, for the same reason: a component rule inside a media query is
 * invisible to the explicit-theme override and silently keeps the wrong
 * colour.
 *
 * ---- THE ONE DELIBERATE EXCEPTION ------------------------------------
 * The STAGE — the surface a rendered email, in-app message, or push
 * preview actually sits on — is a fixed light neutral in BOTH themes
 * (--stage / --stage-edge, declared once, never overridden). Justin's
 * ruling of 28 Jul 2026 in lifecycle-brain: a dark console mis-sells a
 * light-only email by showing it against a canvas it will never ship
 * on. That reasoning binds the canvas, not the chrome — the console
 * furniture themes freely, the creative is always judged on light
 * ground.
 *
 * ---- THE STATUS PILLS MUST CLEAR AA ----------------------------------
 * .o-pill renders at 11px, so WCAG's 4.5:1 normal-text floor applies —
 * the large-text 3:1 concession does not. That is not a stylistic
 * preference here: these pills are the verdict chrome on the render gate
 * and the QA report, tools whose entire job is telling a marketer their
 * email fails contrast. Four of them failed their own bar in light mode
 * (WARN 2.90:1, PASS 3.40:1, brand 3.49:1 in dark, pending 4.07:1)
 * because the tokens were picked as brand hues rather than as text on a
 * wash. `--*-strong` and `--brand-ink` are now the TEXT colours and are
 * chosen against their wash; `--*` and `--*-soft` remain the fill hues.
 * tests/suites/29-widget-contrast.test.mjs runs every pill pair in both
 * palettes through the AA formula — change a colour here and it tells you.
 *
 * ---- FONTS -----------------------------------------------------------
 * The widget CSP is deny-by-default and blocks font CDNs, so the site's
 * webfonts (Bricolage Grotesque / Inter / JetBrains Mono) cannot be
 * fetched. Rather than inline three font files into every widget
 * payload, the stacks below name the Orbit faces first and fall back to
 * the platform UI font, which is a near-match in metrics and costs
 * nothing. If a literal webfont becomes worth the bytes, inlining it is
 * a one-line change here — every widget reads --display/--sans/--mono.
 */

export const ORBIT_TOKENS_CSS = `
:root {
  /* ---- non-colour tokens ---------------------------------------- */
  --display: "Bricolage Grotesque", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --sans: Inter, -apple-system, "Segoe UI", ui-sans-serif, system-ui, Helvetica, Arial, sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  --radius: 12px;
  --radius-sm: 9px;
  --rail-w: 300px;
  --tap-min: 44px;

  /* ---- the review canvas: fixed light in BOTH themes, see header -- */
  --stage: #eef1f5;
  --stage-edge: #dde3ea;
}

/* ---- palette: LIGHT (default) ------------------------------------- */
:root {
  color-scheme: light;
  --ink: #14161f;
  --ink-2: #414658;
  --ink-3: #616879;
  --paper: #f6f7fa;
  --card: #ffffff;
  --rule: #e2e5ec;
  --sunk: #eceef3;
  --shadow: rgba(20, 22, 31, .09);

  --brand: #6366F1;
  --brand-strong: #4F46E5;
  --brand-soft: #818CF8;
  --brand-wash: #eef0fe;
  --brand-line: #c3c8fb;
  --brand-ink: #4F46E5;

  --active: #F59E0B;
  --active-strong: #B45309;
  --active-wash: #fdf3e3;
  --active-line: #f0cf95;

  --ok: #10B981;
  --ok-strong: #047857;
  --ok-wash: #e6f7f1;
  --ok-line: #97dcc4;

  --warn: #b3402e;
  --warn-wash: #fbe9e6;
  --warn-line: #e0aca2;

  --pending: #b6bcc9;
  --scrim: rgba(20, 22, 31, .42);
}

/* ---- palette: DARK (system preference) ---------------------------- */
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --ink: #eef0f6;
    --ink-2: #b6bccd;
    --ink-3: #858ca1;
    --paper: #101219;
    --card: #171a24;
    --rule: #2a2e3c;
    --sunk: #1d2029;
    --shadow: rgba(0, 0, 0, .38);

    --brand: #818CF8;
    --brand-strong: #6366F1;
    --brand-soft: #a5adfb;
    --brand-wash: #1e2140;
    --brand-line: #3c4176;
    --brand-ink: #a5adfb;

    --active: #F59E0B;
    --active-strong: #fbbf24;
    --active-wash: #33260d;
    --active-line: #6b5117;

    --ok: #34d399;
    --ok-strong: #10B981;
    --ok-wash: #10281f;
    --ok-line: #1d5843;

    --warn: #f87171;
    --warn-wash: #331717;
    --warn-line: #6e2b2b;

    --pending: #4a5061;
    --scrim: rgba(0, 0, 0, .55);
  }
}

/* ---- explicit theme overrides: these must beat the media query ---- */
:root[data-theme="dark"] {
  color-scheme: dark;
  --ink: #eef0f6; --ink-2: #b6bccd; --ink-3: #858ca1;
  --paper: #101219; --card: #171a24; --rule: #2a2e3c; --sunk: #1d2029;
  --shadow: rgba(0, 0, 0, .38);
  --brand: #818CF8; --brand-strong: #6366F1; --brand-soft: #a5adfb;
  --brand-wash: #1e2140; --brand-line: #3c4176; --brand-ink: #a5adfb;
  --active: #F59E0B; --active-strong: #fbbf24;
  --active-wash: #33260d; --active-line: #6b5117;
  --ok: #34d399; --ok-strong: #10B981; --ok-wash: #10281f; --ok-line: #1d5843;
  --warn: #f87171; --warn-wash: #331717; --warn-line: #6e2b2b;
  --pending: #4a5061; --scrim: rgba(0, 0, 0, .55);
}

:root[data-theme="light"] {
  color-scheme: light;
  --ink: #14161f; --ink-2: #414658; --ink-3: #616879;
  --paper: #f6f7fa; --card: #ffffff; --rule: #e2e5ec; --sunk: #eceef3;
  --shadow: rgba(20, 22, 31, .09);
  --brand: #6366F1; --brand-strong: #4F46E5; --brand-soft: #818CF8;
  --brand-wash: #eef0fe; --brand-line: #c3c8fb; --brand-ink: #4F46E5;
  --active: #F59E0B; --active-strong: #B45309;
  --active-wash: #fdf3e3; --active-line: #f0cf95;
  --ok: #10B981; --ok-strong: #047857; --ok-wash: #e6f7f1; --ok-line: #97dcc4;
  --warn: #b3402e; --warn-wash: #fbe9e6; --warn-line: #e0aca2;
  --pending: #b6bcc9; --scrim: rgba(20, 22, 31, .42);
}
`.trim();

/**
 * Baseline chrome shared by every widget: reset, typography, and the
 * handful of primitives (card, pill, button, empty state, stage) that
 * every Orbit surface reuses. Widget-specific CSS is appended after
 * this, so a widget can override anything here without !important.
 */
export const ORBIT_BASE_CSS = `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.5;
  color: var(--ink);
  background: var(--paper);
  -webkit-font-smoothing: antialiased;
}
h1, h2, h3 { font-family: var(--display); font-weight: 650; letter-spacing: -.01em; margin: 0; }
h1 { font-size: 17px; }
h2 { font-size: 15px; }
h3 { font-size: 13px; }
code, pre, .mono { font-family: var(--mono); font-size: 12px; }
a { color: var(--brand-strong); }

.o-card {
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  box-shadow: 0 1px 2px var(--shadow);
}
.o-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 600; letter-spacing: .01em;
  border: 1px solid transparent; white-space: nowrap;
}
.o-pill--ok      { background: var(--ok-wash);     color: var(--ok-strong);     border-color: var(--ok-line); }
.o-pill--warn    { background: var(--warn-wash);   color: var(--warn);          border-color: var(--warn-line); }
.o-pill--active  { background: var(--active-wash); color: var(--active-strong); border-color: var(--active-line); }
.o-pill--brand   { background: var(--brand-wash);  color: var(--brand-ink);     border-color: var(--brand-line); }
.o-pill--pending { background: var(--sunk);        color: var(--ink-3);         border-color: var(--rule); }

.o-btn {
  font: inherit; font-size: 12px; font-weight: 600;
  min-height: 30px; padding: 6px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--rule);
  background: var(--card); color: var(--ink);
  cursor: pointer;
}
.o-btn:hover { border-color: var(--brand-line); color: var(--brand-strong); }
.o-btn[aria-pressed="true"] {
  background: var(--brand-wash); border-color: var(--brand-line); color: var(--brand-strong);
}
.o-btn--primary {
  background: var(--brand-strong); border-color: var(--brand-strong); color: #fff;
}
.o-btn--primary:hover { background: var(--brand); border-color: var(--brand); color: #fff; }
.o-btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.o-btn[disabled] { opacity: .5; cursor: not-allowed; }
.o-btn[disabled]:hover { border-color: var(--rule); color: var(--ink); }

/* Injected by the shell's prelude when the host bridge failed to connect.
   Fixed to the bottom edge so it is visible in any widget layout without
   the widget having to reserve a slot for it. */
.o-bridge-note {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
  padding: 6px 12px;
  font-size: 11px; line-height: 1.4;
  color: var(--warn); background: var(--warn-wash);
  border-top: 1px solid var(--warn-line);
}

/* The always-light review canvas — see tokens.js header. */
.o-stage {
  background: var(--stage);
  border: 1px solid var(--stage-edge);
  border-radius: var(--radius);
}

/* Injected by the shell's prelude on the standalone path only — the
   shared copy is the only Orbit surface a non-user ever sees. */
.o-made-with {
  padding: 10px 14px;
  font-size: 11px; color: var(--ink-3);
  border-top: 1px solid var(--rule); background: var(--paper);
  text-align: center;
}
.o-made-with a { color: var(--brand-ink); text-decoration: none; font-weight: 600; }
.o-made-with a:hover { text-decoration: underline; }

.o-empty { color: var(--ink-3); font-size: 13px; padding: 28px 16px; text-align: center; }
.o-scroll { overflow: auto; }
.o-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
.o-scroll::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 999px; }

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
`.trim();
