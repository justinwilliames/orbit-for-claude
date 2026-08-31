> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Atlas (UX)

## Verdict

Ship the pipeline fix, but not before one line of `orbit_check_setup` — the tool a model calls first in almost every session — stops telling a stranger they're blocked when nothing is actually blocking them.

## Top 3 findings

**1. `[instrumented]`** `orbit_check_setup`'s `copy_generation` feature reports a status that contradicts its own evidence. I ran it live against a fully-configured install:

```json
"copy_generation": {
  "status": "needs_setup",
  "blocking_issues": [],
  "guidance": ["Orbit can write copy with the configured brand guidelines and tone of voice."]
}
```

`status: needs_setup` with zero `blocking_issues` and a `guidance` line that says the opposite. I read why: `server/setup-validator.js` lines 181–187 gate `status` on `brandKit.operational_status === "full"` (which needs every brand-kit field, including one placeholder guideline section not yet filled in), but gate `blocking_issues` on a narrower two-condition check — guidelines file exists, tone of voice defined — that doesn't track the same ground. The result is a status the model has no way to act on: it's told something needs fixing and handed nothing to fix. This is the exact failure mode the file's own top comment describes fixing for `brand_header_render` on 2026-08-xx — the same shape has grown back one field over. `orbit_check_setup` is often the first tool call in a session; when its answer doesn't parse as actionable, the stranger's first three minutes start on a riddle instead of a checklist.

**2. `[instrumented]`** `docs/SETUP.md`'s only Claude Code CLI registration example is one 24-flag command with every credential slot — Braze, Stripo (five fields), Figma, Google AI, company/platform/geography — asked for at once, and there is no shorter example anywhere in the file. I read the whole doc top to bottom; the zero-credential path exists in the tool surface (`orbit_check_setup` confirms `core`, `lifecycle_diagrams`, `library`, `email_production` are all `ready` with nothing configured) but SETUP.md never shows the zero-credential registration command. That directly undercuts the README's own hook — "It needs no credentials of any kind," the whole "ninety seconds" pitch — the moment a reader follows the CLI path instead of the Desktop path. A stranger who copies the only example given reasonably concludes they need five platforms' worth of keys before Orbit will even start.

**3. `[instrumented]`** Two files named `PRIVACY.md` exist in the repo with unrelated scope: `/PRIVACY.md` (130 lines — telemetry, the update check, `orbit_submit_product_idea`) and `docs/PRIVACY.md` (30 lines — Gemini image-generation only). The README links the root file; SETUP.md's troubleshooting section links a third thing, the MCP resource `orbit://privacy/image-generation`, not either file on disk. Someone grepping the repo for "privacy" — a support agent, a security reviewer, a curious user with local access — lands on two documents with the same filename answering different questions, and the one SETUP.md actually points at isn't a filename at all. `docs/PRIVACY.md` should be named for what it covers.

## The single thing I'd ship

Fix finding #1. Make `copy_generation`'s `status` derive from `blocking_issues.length` the same way every sibling feature in that file already does (`design_import`, `braze_publish`, `email_production` all follow `status: checks.passed ? "ready" : "needs_setup"` with `blocking_issues` built from the identical condition) — or, if `operational_status === "full"` is meant to matter, add the missing brand-kit completeness items into `blocking_issues` so the two fields agree. Either fix is small; the bug is in the tool a model reaches for on turn one.

## What I'd defer

Whether the release-pipeline reliability work (the 11-day gap, the version-bump discipline) gets prioritised over doc and validator fixes this cycle — that's an engineering-sequencing call, not mine to make from the UX chair.

## A question for another drone

CONSULT Nebula: SETUP.md's CLI section needs a zero-credential registration example ahead of the full one — you own docs craft, I own the failure mode it causes. Can you restructure that section so the first command shown is the one that matches what `orbit_check_setup` proves actually works with nothing configured?

— Atlas
