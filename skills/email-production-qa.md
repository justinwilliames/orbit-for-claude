---
name: email-production-qa
description: >
  Use this skill before any lifecycle email send to verify it's ready to ship. Triggers on
  "QA this email", "is this ready to send?", "pre-send check", "check this HTML", "will this
  render properly?", "validate before launch", "what could go wrong", or whenever a user is
  about to push an email to Braze / production and wants a defensible gate check. This is
  the canonical pre-send protocol — the single entry point that chains accessibility, dark-
  mode, Gmail-clipping, and render-QA into one combined verdict.
---

# Email Production QA

The gate check every lifecycle email should pass before it ships. This skill calls
`orbit_qa_email` as the default one-shot check, and falls back to individual tools
(`orbit_validate_email_template`, `orbit_accessibility_lint`, `orbit_dark_mode_check`,
`orbit_check_email_size`, `orbit_score_subject_line`, `orbit_score_preheader`) when a
specific dimension needs deeper attention.

**This skill is different from `email-render-qa` (which focuses on markup validity,
Liquid fallbacks, and link integrity). This is the BROADER pre-send envelope that
wraps render-QA plus accessibility, dark-mode, size, and inbox-row scoring.**

---

## When to trigger

- "QA this email" / "is this ready to send?" → run the wrapper
- "Check this HTML before I push to Braze" → wrapper + render-QA together
- "Does this work in dark mode?" → `orbit_dark_mode_check` directly (skill still gates the broader send)
- "Is this accessible?" → `orbit_accessibility_lint` directly, then wrap back with this skill
- Before calling `orbit_sync_to_braze` or `orbit_build_braze_pack` — ALWAYS run this first

## The canonical sequence

1. **`orbit_qa_email({ html })`** — runs accessibility + dark-mode + Gmail-size in one call.
   Returns `verdict: "pass" | "warn" | "fail"` plus a combined findings list.
2. **If `verdict === "fail"`**: do NOT proceed to send. Surface the blocking issues to
   the user with specific recommendations. A fail blocks launch until resolved.
3. **If `verdict === "warn"`**: show the user each warning with the decision framing.
   Some warnings are acceptable (e.g. "no explicit alt text on decorative image") —
   others aren't. This is a judgment call the user should make, not Orbit.
4. **If `verdict === "pass"`**: run `orbit_validate_email_template` for markup / Liquid
   validity, and `orbit_check_email_auth` on the sending domain. Both should also pass.
5. **Before send**: score the inbox row. `orbit_score_subject_line` + `orbit_score_preheader`
   — ensure the combined inbox preview is on-brand and clipping-safe.

## Components called by the wrapper

| Check | Tool | What it catches |
|---|---|---|
| Accessibility | `orbit_accessibility_lint` | alt coverage, WCAG AA contrast (ancestor-resolved), heading order, link-text quality, layout-table `role=presentation`, html lang |
| Dark mode | `orbit_dark_mode_check` | invert-risk colour pairs, partial-invert bare-white-text, missing `prefers-color-scheme: dark` override |
| Gmail clipping | `orbit_check_email_size` | 102 KB threshold — lost tracking + clipped CTA if breached |

The wrapper returns a **combined_findings** array sorted `fail → warn → pass` so the
reader can work top-to-bottom through blocking issues first.

## What the skill does NOT do

- **Doesn't validate the markup or Liquid.** That's `orbit_validate_email_template` /
  `email-render-qa`. Call that explicitly alongside the wrapper when you need both.
- **Doesn't check images are uploaded to a CDN.** Broken local-file paths are an
  `email-render-qa` concern.
- **Doesn't score A/B test design.** That's `experiment-design` + `orbit_sample_size`.
- **Doesn't check deliverability.** For auth run `orbit_check_email_auth`; for
  complaint rate run `orbit_check_deliverability`.

## Typical session flow

1. User pastes an email or references a recently-assembled template.
2. Invoke `orbit_qa_email({ html })`.
3. Report verdict + findings in a readable list, grouped by check.
4. If any `fail`, offer to fix the blocking issues — most (colour contrast,
   alt text, size) are repair-in-place.
5. If `pass`, propose the next action: auth check, markup validate, or ship.

## Chaining with related skills

- `email-production-qa` → `email-render-qa` → `braze-template-sync` (ship)
- `email-production-qa` → `deliverability-management` (if QA surfaces reputation concerns)
- `email-production-qa` → `reputation-recovery` (if QA surfaces likely complaint triggers)
