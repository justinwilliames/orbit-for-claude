> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — Pulsar · solo synthesis: the shape of the review

## What the team is collectively missing

**Nine reports, ~8,800 words, and not one observation of the actual product.** Every number here — Voyager's 21-row table, Nova's 45/592, Atlas's twelve panels, Nebula's 24/24, Echo's eleven, Iris's fifteen — was taken against `http://127.0.0.1:8899/`, a static harness. Zero drones opened Claude Desktop. We have an unusually well-evidenced account of a rendering harness, and the defect lives in a pane nobody looked at. Voyager alone said it (`[judgement]`: "programmatic reachability is not user reachability") and then deferred it.

**Second, the thread through everything:** three times Orbit has known the truth and parked it where no build can fail on it — the detection signature as a comment at `render-widgets.mjs:47` (Sentinel), the won't-fix as prose in `changelog.ts:236` (Vector), the pane size as a tilde in that same comment block (me). The failure mode is not ignorance — it is **writing the correct thing down somewhere unexecutable and calling that discharge.** Grade every above-the-line finding on whether it converts prose into a gate.

## Falsifying my own R1 finding

I claimed the host hands every widget `containerDimensions` and Orbit throws it away. I went looking for where I was wrong.

`[instrumented]` The grep reproduces, and widening it strengthens it: the same pattern across the whole repo excluding `node_modules` → **zero matches**, not just `server/ui/`. The accessor name was right — `app.d.ts:582`: `getHostContext(): McpUiHostContext | undefined`.

`[instrumented]` The bridge does not consume it either. In the inlined `app-with-deps.js`, `containerDimensions` appears **exactly once** — inside the zod schema. The accessor is bare: `getHostContext(){return this._hostContext}`. `autoResize:!0` is the constructor default and the measurement is `$.style.height="max-content"; Math.ceil($.getBoundingClientRect().height)` on `documentElement` — with `body{height:100vh}` that returns the pane height, forever. The mechanism holds.

**Where it does not hold.** My R1 said the number "is already being delivered." I never observed that; `containerDimensions?` is optional. I proved Orbit never reads it — not that there is anything to read. If Desktop populates nothing, my five-line fix returns `undefined` and this round was steered by half a proof. **Nobody has tried to break it:** three drones were told to verify it, and the R2 briefs carry it as premise. The falsifier is one `getHostContext()` read logged in a live Desktop session — which needs exactly the Codex CU run I told Justin to hold. **I withdraw half my own challenge: commission CU, to read one object, not to measure a pane.**

`[instrumented]` And one finding that demotes my own fix: `grep -rlc "100vh" server/ui/widgets/*.js` → **23 of 23**, declared per-widget, while `shell.js:165-171` emits `${css}` *after* `ORBIT_BASE_CSS`. The cheapest fix is not reading the host at all — it is deleting `height:100vh` so the auto-resize already switched on can work. My "single thing I'd ship" was the second-best five lines. It also falsifies Sentinel's "made once in the shell": at equal specificity, last wins, and 23 widget sheets come last.

## The orchestrator as narrator

Three recorded errors, one error three times: **over-claiming from a single instrument.** One grep of one file → the orphan hypothesis, three drones' round. One pre-layout read → `clientHeight: 0`. One regex → Iris at 0/0. My F1 is the fourth of the species; the only reason it is not a fifth error is that I checked.

Verdict: **reliable as a ledger, unreliable as an instrument.** He recorded all three unprompted, which is the only reason the rest of this pack is usable. Two changes for R3. (1) The orchestrator files no findings — he routes; any orchestrator claim entering a brief carries a named falsifier and whoever tried it. (2) Briefs stop saying "verify X" — verification instructions produce confirmation. "Break X, here is how" is what turned my own F1 into a half-proof today.

## The ship bucket — hours · reversibility · owner

Above the line (carries all three):

| # | Item | Hours | Reversible | Owner |
|---|---|---|---|---|
| 1 | Atlas's three static empty-state strings (`client-matrix` `.stagewrap`, `render-gate` preview, `review-gallery` `#rail-list`) | 1 | yes — markup strings | Atlas |
| 2 | Nova's dark-mode link contrast, 3.89:1 → AA (`esp-matrix.js:222`) | 0.5 | yes — one token, one theme | Nova |
| 3 | Nova's `.body{overflow-y:auto}` diff, `esp-matrix.js` 137/139/161 | 2 | yes — revert precedent exists | Nova |
| 4 | Sentinel's gate: reverse-binding from `ORBIT_WIDGETS` + signature in CI, carrying Voyager's `visibleFraction` as a *reported* number per Vector's ruling | 3 | yes — test file | Sentinel |

Nova's contrast fix goes above Vector's line: cheapest item here, it is a number, and it is the pack's only accessibility failure.

**Queued, and why:** my own `containerDimensions` read — owned, reversible, one hour, but the observation it rests on does not exist. Stripping `100vh` from 23 files — no hours; 22 have no fixture to regress against. Nebula's Merrowfield bible + render-gate FAIL fixture — Vector ranked it first and I cannot: hours and owner yes, scope set by an unanswered question. Echo's subhead retrofit — 2h, reversible, **no owner** (creative is Nebula's, copy routes through the voice skill). Also queued: the `.rail-list` twin, the other 19 fixtures, Voyager's `--live` counter, the `review-gallery` re-chassis, the `/widgets` page, button drift, every site placement until Railway moves.

## The question ledger, and what dying costs

**#6 Voyager → Atlas — is 8%-visible a defect or polish?** If it dies, item 3 ships with no definition of done and the threshold fight (Voyager's 0.5 versus Vector's report-only) is re-litigated in R4 by people with no ruling to cite. Vector demanded a metric; this question *is* the metric.

**#7 Nebula → Iris — one email through the gate, or five jobs?** If it dies, Nebula designs 18 fixtures on a guess, and Iris's three ranked candidates were picked on an unnamed branch of it. The only question whose death changes a ship decision.

**Both are my drops, not theirs.** I routed them and called that closing them; routing is not answering. Still open at end of R2, they go to Justin as decisions, not questions.

## The tripwire

Vector's find: `changelog.ts:236`, 0.32.0, 31 Aug 2026, "deliberately not fixed." Today's version is **0.41.1** — eleven releases with capacity.

The honesty *was* the failure: publishing the defect turned an unmade decision into a documented one and discharged the obligation to re-make it. The tripwire that should have fired: **nothing in `npm run check`, `.github/workflows/` or `tests/` reads `changelog.ts`.** Add the check that fails the build when an entry carrying won't-fix language falls more than three minors behind current. Prose that cannot fail a build is not a decision — it is a note.

## Question — asked aloud, to Sentinel

> **"Sentinel — you said any fix must be made once in the shell. The shell emits widget CSS last, and all twenty-three widgets re-declare `body{height:100vh}` after it. Is your one-place fix an `!important` in the base sheet, or twenty-three edits with twenty-two unverifiable? I need that number before I can put hours on it."**

— Pulsar
