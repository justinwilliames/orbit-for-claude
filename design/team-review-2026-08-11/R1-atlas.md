> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# ATLAS — UX review, cycle 1

Scope actually read: `server/ui/tokens.js`, `server/ui/shell.js`, `server/ui/register.js`,
`server/ui/widgets/render-gate.js` (990 lines, full), `server/ui/widgets/qa-report.js`,
`server/ui/widgets/audit-report.js`, `server/ui/widgets/diagram-view.js`,
`server/ui/widgets/review-gallery.js` (grepped for token usage), `manifest.json` (full
`user_config` dump), `README.md` (full), `server/index.js` around `orbit_check_setup` and the
`needs_setup` pattern. Prior audits read first, not re-derived.

## 1. The widget system's own status pills fail the WCAG AA bar the product enforces on customer email

This is the finding I care about most, because of what it sits inside. `render-gate.js`
is Orbit's new pitch for craft: it renders email HTML in a real iframe, walks composited
background layers, and flags any text under 4.5:1 (normal) / 3:1 (large) against WCAG 2.1 AA —
citing the exact ratio, the two hex colours, and the font size next to every finding. It is a
genuinely well-built checker: it abstains rather than guesses when a background image makes
the ratio uncomputable, it says exactly what it didn't measure, it cites the standard it's
judging against instead of asserting a house preference. I have no notes on the checking logic.

I ran its own contrast formula — copied verbatim, not approximated — against its own design
tokens (`server/ui/tokens.js`), because those tokens are what the pills carry status text in,
in every widget it ships: `render-gate.js`, `qa-report.js`, `audit-report.js`.

```
$ node -e '<luminance/contrastRatio lifted directly from render-gate.js, run against tokens.js hex pairs>'
ink-3 on sunk (light)                  4.07:1  FAILS AA-normal (needs 4.5:1)
pending dot on sunk (light)            1.64:1  decorative only — not text, confirmed by grep (see below)
warn text on warn-wash (light)         4.85:1  PASS
ok-strong on ok-wash (light)           3.40:1  FAILS AA-normal, only clears the large-text floor
active-strong on active-wash (light)   2.90:1  FAILS AA-normal AND fails the large-text floor (3:1)
brand-strong on brand-wash (light)     5.55:1  PASS
```

Two of these are load-bearing, not edge cases:

- **`.o-pill[data-sev="warn"]`** — `background: var(--active-wash); color: var(--active-strong)`
  (`#D97706` on `#fdf3e3`) — **2.90:1**. This is the WARN severity pill. It appears as the "N
  warn" tally in the header of `render-gate.js`, `qa-report.js`, and `audit-report.js` alike
  (confirmed by grep, three separate widget files, same rule). Pill text renders at 11px
  (`.o-pill { font-size: 11px }` in `tokens.js`) — nowhere near the 24px / 18.66px-bold large-text
  exemption, so 4.5:1 is the real bar, and this misses it by more than a third. It also misses
  the *relaxed* large-text floor of 3:1, which is the more damning number: even by the widget's
  own most forgiving standard, its own warn indicator doesn't clear it.
- **`.o-pill[data-sev="pass"]`** — `ok-strong` on `ok-wash` (`#059669` on `#e6f7f1`) — **3.40:1**.
  Clears the large-text floor, misses normal-text AA. Same three widgets, same 11px context.
- **`.o-pill--pending`** and `.abstain li`** — `ink-3` on `sunk` (`#6c7387` on `#eceef3`) —
  **4.07:1**, used for the "info" tally and for the "Not measured" abstention list text in
  `render-gate.js` — the exact block that is supposed to be the tool's honesty mechanism.

Confirmed via grep that `--pending` (the raw colour, `#b6bcc9` on `#eceef3`, 1.64:1 — genuinely
terrible) is used only as a decorative left-border or an 8px dot (`diagram-view.js`,
`review-gallery.js`, `.finding` borders in three widgets) — never as text. That one is a non-issue
and I'm not counting it; flagging it here only so nobody re-derives it as a fourth failure.

**Why this matters more than a normal contrast nit:** the product's differentiator claim in this
release is exactly "we render for real and measure what a string lint can't." A stranger who
runs `orbit_render_gate` against their own email, gets back a citation of WCAG AA 4.5:1, and then
looks at the widget's own WARN pill — sitting right there failing that same bar by a wide margin —
has just been shown the tool not living up to its own headline claim, in the same screen, in the
same session. That is a worse first impression than a generic UI nit, and it is fully avoidable:
the fix is a palette adjustment, not new engineering.

**Fix:** darken `--active-strong` and `--ok-strong` (or lighten `--active-wash`/`--ok-wash`) until
both clear 4.5:1 at 11px in light mode, and re-run the same check in dark mode (dark mode passes
today — `warn text on warn-wash (dark)` computed 5.95:1 — so this is a light-theme-only defect).
Add a one-time node script (or a test in `tests/suites/`) that runs `tokens.js`'s declared pairs
through AA math and fails CI if any status-pill combination drops under 4.5:1 — there is currently
no lint that would have caught this, which is exactly the failure mode `orbit_render_gate` was
built to close for *email*. The same discipline is missing for the tool's own UI.

Severity: high. Actionable: yes, concrete token values to change plus a concrete regression test
to add.

## 2. First three minutes: no worked example anywhere in the install path

Read `README.md` in full and `manifest.json`'s `description`/`long_description`. The "Get
started" section is honest and well-written — it correctly says Orbit is free, no key, no
account, and that two-thirds of the tool surface needs zero credentials. That's good IA; I have
no complaint about the framing.

What's missing: there is no single copy-pasteable example of what to *type* into Claude after
installing. Not in the README, not in the manifest's `long_description`, not in any tool
description I found positioned as an entry point. `orbit_check_setup`'s own description frames it
as a pre-flight check for "any brand kit or file operation" — not as a general "run me first"
onboarding step, and nothing tells a stranger to run it.

A stranger who installs a 119-tool, 77-skill MCP extension and opens a blank Claude chat has to
invent their own first prompt with zero signal about what a good one looks like. That's the exact
moment the prior audit's headline number — 2 unique repo visitors in 14 days, ~13 real downloads
— gets decided: not at "is this good code" but at "what do I even ask it." Every tool in this
space that gets adoption (and every one of Orbit's own guides, going by the site's own content
strategy) leads with a worked example, not a capability list.

**Fix:** add one line to the README's "Get started" section and to `manifest.json`'s
`long_description` — a literal example prompt a stranger can paste verbatim (e.g. something that
exercises a zero-credential tool, since that's the honest on-ramp): *"Try: 'score this subject
line: 20% off ends tonight' or 'check this email HTML for dark-mode and accessibility issues.'"*
Costs a sentence, closes a real gap.

Severity: medium. Actionable: yes — one sentence, two files.

## 3. Install-time credential form: 23 fields, one flat list, no grouping signal

`manifest.json`'s `user_config` is 23 keys in a single flat object: `company_name`,
`default_platform`, `default_geography`, then 20 credential/endpoint fields spanning seven
unrelated third-party products (Google AI, Figma, Braze, Iterable, Customer.io, Klaviyo,
Mailchimp, SFMC×4, Stripo×5). Each field's own `title`/`description` is well-written and
correctly scoped (judgement: better copy than most manifests I'd expect from a comparable
project) — that part is not the problem.

The problem is structural, not textual: nothing in the MCPB manifest format groups these by
product, and I did not verify how Claude Desktop's extension settings panel actually renders 23
ungrouped fields (I read the JSON; I did not open the install UI in this environment, so I'm not
asserting the rendered layout — flagging this explicitly rather than guessing). If it renders as
one continuous scroll, a product whose entire pitch is "free, zero setup" greets a stranger's
first settings visit with what reads like a 23-field enterprise integration form. That's a
credibility mismatch with the README's own framing, even though every field is genuinely
optional.

**Fix, in order of cost:** (a) cheapest — confirm the actual rendered order puts
`company_name`/`default_platform`/`default_geography` visibly first and everything credential-shaped
below a clear "optional, skip what you don't use" divider if the manifest format supports any
section text; (b) if the format has no grouping primitive at all, that's worth raising as an
Extensions-platform gap rather than something Orbit alone can fix — but the mitigation available
today is making the skip-it framing more prominent in the panel copy itself, not just in the
README.

Severity: low. Actionable: partially — (a) is concrete, (b) depends on a platform capability I
did not verify exists.

## What I did not find worth reporting

I looked for colour-only status coding specifically, since it's a standing pet hate — every
severity/status indicator I traced (`.finding[data-sev]`, `.o-pill[data-sev]`, the render-gate
verdict badge) pairs its colour with a text label (`PASS`/`REVIEW`/`FAIL`, `fail`/`warn`/`info`
group headers, the `f-check`/`f-title` text) and the finding rows are real `<button>` elements,
keyboard-focusable with a visible `:focus-visible` ring defined in `tokens.js`. That discipline is
solid across all three report widgets. Not flagging it as a finding — it's the bar being met, not
missed — but noting it since I went looking specifically and it would be dishonest not to say so.
