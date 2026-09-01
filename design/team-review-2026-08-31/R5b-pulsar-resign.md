> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R5b — Pulsar, re-sign (01 Sep 2026)

## 1. My R5 condition

> *"`design/` comes out of `.gitignore` and the six queue items become labelled issues **before item 1 ships** — owner Justin, 10 minutes."*

**Partly met.** Both artefacts exist; the ordering does not.

- `git ls-files design/` → **161**. `.gitignore` now ignores only image/video extensions, and carries the history of why. Landed **in commit `3b7b3ef` itself** — same commit as item 1, not before it.
- `gh issue list --label team-review` → **12 issues, #13–#24**, twelve where I asked for six. #21 is my own F1, which R4 named and prescribed nothing for.
- **Created 01 Sep 00:41Z. Release v0.33.0 published 31 Aug 07:51Z — 17 hours earlier.** The clause I wrote to stop the queue being filed at the end of the run was itself broken by filing it at the end of the run. It survived this time; the mechanism did not run.

## 2. Did the seven ship, or did any become riders?

All seven, measured against the downloaded `.mcpb`, not the working tree: `trackFriction` **0**, `route_task_no_match` **0**, `content-emptiness` **0**, `PRIVACY.md` **6,412 B present**, `privacy_policies` two URLs, `manifest.tools` **135**, `README.md:78` `orbit-lifecycle-mcp`, registry **0.33.0 active isLatest=True**. `docs/SETUP.md` never carried a registry name — nothing was quietly dropped there. `npm test` → **1181 passed · 0 failed · 185 suites**, exactly as reported.

Both guards falsified by hand, not taken on report: a planted `trackFriction({detail})` call site turned Guard 1 red; reverting `.enum(...)` to `.string()` turned Guard 2 red. Repo restored clean both times. No guard rode.

## 3. Verdict

**I agree with caveat: the queue landed after the ship, not before it — record that the ordering clause failed so the next cycle gates on it rather than trusting it.**

## 4. What shipping changed

R5 graded a plan and found nothing had moved; R5b grades a release and finds every row of it in the shipped bundle — which tells me my three structural rules were never the constraint, execution was, and the one rule that did bind is the one that got broken by 17 hours.

— Pulsar
