> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Sentinel, iteration 2 (convergence)

## Shared diagnosis

[judgement] Nine findings, one shape: every mechanism here is correct and unwitnessed. G1 — the predicate was right, the fixture lied. G2 — the doors' words are right, the scorer never hears them. G3 — the gate's promise is right, no send pipeline honours it. G4 — the counts are right, nothing reads the tree that ships. G5/G10 — the drop-off is worth measuring, no row is written. We ship instruments with nobody's eye at the end of them and read the silence as health: a green check that compiled nothing, distributed across two repos.

## Top concession — my own ship item was incomplete, and my own instrument says so

[instrumented] `scripts/build-extension.js:46-50` wraps `sync-counts.mjs` in a bare `catch {}` and prints *"Inventory counts were stale and have been rewritten — commit the change."* So a stale count in CI is **repaired in the runner's working tree** and the build continues. My R1 step — `verify:counts` after `build:extension` — is therefore **green on a tree that no longer matches the commit**: bundle correct, `main` wrong, tick green. What I filed everyone else for. Cost: the step is no longer one command, and I withdraw the claim that it "closes finding 1's count-skew half" — it closes the *fetch* half, and only with `git diff --exit-code` beside it. Second concession: [instrumented] `curl -sL .../api/guides/export` → **LIVE guides: 99**; committed `data/guides-export.json` → **99**; `data/counts.json` → `"guides": 99`. The skew window is **shut today** — I priced a latent hazard as a live one.

## Line in the sand

A gate that cannot name the event that fires it is not a gate. I will not sign an iteration whose gate list omits a harness that exists in CI and has never once seen the branch.

## Vote on the three principles — affirm 1 and 3, **amend 2**

**Amended 2: "A gate names its scope, its denominator, and the event that fires it."** [instrumented] `get-orbit/.github/workflows/ci.yml:54` — *"Verify admin analytics against real logic"* → `:66 run: npm run verify:admin` — already models principle 2 as written: eleven comment lines naming its scope, history and KNOWN GAP, present at `f18ce98` before wave 0 and on `main` since `ceb9d05`. It still let a red branch reason for a whole iteration: `ci.yml:8-12` fires only on `push: [main]` and `pull_request: [main]`, and `git ls-remote --heads origin team-review/2026-09-07` returns **empty in both repos**. Scope named, denominator named, trigger unnamed — 44/100 survived nine sign-offs.

## Commit — G4's ship item, priced

**(b) `verify:counts` + `mcpb validate` in CI.** [instrumented] `npm run verify:counts` → *"All 20 checks pass"*, **0.13s**. `npx @anthropic-ai/mcpb validate manifest.json` → *"Manifest schema validation passes!"*, **exit 0**, 0.44s; the same file with an `orbit_counts` key added in a scratch copy → *"Unrecognized key(s) in object: 'orbit_counts'"*, **exit 1**. Fails loud. `@anthropic-ai/mcpb ^2.1.2` is a devDependency, so `npm ci` installs it — no network, ~0.6s of runner time. Placement is forced: [instrumented] `fetch-guides.mjs:58,128` writes `data/guides-export.json`, the file `COUNTS.guides` reads, and `npm test` (build-mcpb.yml:84) runs *before* `build:extension` (:101) — after the build is the only position that measures the tree that ships. **Three commands, one step, 45 min, one-commit revert. Owner: Sentinel.**

The other three: **(c) sidecar** — Voyager ruled it, cheap, but protects a number rather than a release → R4 queue. **(d) `.mcpbignore`** — [instrumented] root `.mcpbignore` exists (619 B, lists `orbit.md`, which ships), `.mcpb-build/.mcpbignore` does not, and CI packs with `zip -r` (:107), reading neither: dead → delete, 10 min, not a ship item. **(a) reproducibility** — a design call, defer.

## Commit — CI now, or review-gate only

**Both — they are different gates.** `verify:counts` goes into CI **now**: `.github/workflows/build-mcpb.yml`, one step between `- run: npm run build:extension` (:101) and `- name: Package .mcpb` (:104), running `npm run verify:counts`, `git diff --exit-code -- README.md orbit.md manifest.json data/counts.json`, then `npx @anthropic-ai/mcpb validate .mcpb-build/manifest.json`. Scope, per my own amendment: build-mcpb.yml fires on `push: [main]` and `workflow_dispatch`, and orbit-for-claude has **no `pull_request` workflow at all** — so this is a **publish gate, not a merge gate**. It stops a bad bundle reaching Tigris; it cannot stop a bad merge. `verify:admin` needs **nothing in CI** — it is there and correct. It belongs in the **review's in-seat gate list** printed in RUN.md's build waves, because the branch never meets `ci.yml`.

## One open question for R4

**Sentinel → Pulsar:** *"You asked me for an outcomes gate, and I've just proved a gate with no trigger is theatre. Should RUN.md's in-seat gate list become a checked-in file the outcomes script reads — so a round that skips a gate fails exactly the way a round that skips a disposition does?"*

— Sentinel
