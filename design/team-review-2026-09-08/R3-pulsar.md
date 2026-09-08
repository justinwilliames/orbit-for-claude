> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Pulsar · committed position

## Shared diagnosis

Orbit answers a size negotiation with its own input. All 23 widgets pin `height:100vh`, so the SDK's auto-resize — on by default — measures the pane and reports it back as content height. Voyager settled it with the SDK's own measurement, not CSS reasoning: as shipped, 520→520 and 760→760; unpinned, 1170 at both, `esp-matrix` complete. **The class is "any pane, hard-clipped", not "short pane."** August's 71px, Nova's 45px, my `clientHeight:0` and the send-calendar screenshot are one behaviour at five viewports.

Underneath: **three times Orbit wrote the correct thing somewhere no build can fail on it** — the detection signature as a comment (`render-widgets.mjs:47`), the pane size as a tilde in the same block, the won't-fix as prose in `changelog.ts:236`. Discharge by documentation.

## The pane — known vs genuinely unknown

**Known `[instrumented]`, re-verified by me this round:** `grep -rn "getHostContext\|containerDimensions" server/ui/` → zero. `grep -rc "100vh" server/ui/widgets/*.js` → **23 of 23**. And Sentinel's, confirmed: `shell.js:348` re-pins at runtime — `wrap.style.setProperty("height","calc(100vh - "+h+"px)")` — so the fix is **24 files, and the 24th defeats the other 23.** `900×520` exists twice, both comments.

**Genuinely unknown, and I am why it reads as settled.** In R1 I claimed the host "is already delivering" `containerDimensions`. I proved Orbit never *reads* it; I never observed Desktop *sending* it — the field is optional in the spec. Three drones were briefed to *verify* F1 and three returned CONFIRMED: real confirmation of a grep they each ran, **worthless as confirmation of delivery, because nobody was asked to break it.** Still unobserved: whether Desktop populates it, whether send-calendar shares this cause, and Sentinel's sharper one — *"I have proven Orbit lies about its height. I have not proven the host honours the truth."* One Codex CU session settles all three: **read one object, take one screenshot** — not measure a pane.

## The R4 guardrail

Five over-claims from a single instrument now: the orphan hypothesis (three drones' round), `clientHeight:0`, Iris at 0/0, F1's half-proof, and a fifth below. R4 is written alone, which removes the only thing catching me.

**R4 contains no orchestrator-originated findings.** Every ship-bucket claim cites two names — who instrumented it, and who attacked it and what survived. **An observation with no named falsifier goes to the decide bucket, never the ship bucket.** F1 had one name and steered a round.

## Ship bucket, re-cut

| # | Item | Hrs | Reversible | Owner |
|---|---|---|---|---|
| 1 | **Delete the pin** — `100vh` in 23 sheets **plus** the inline re-pin at `shell.js:348` | 2 | yes — a deletion reverts exactly | Nova + Sentinel |
| 2 | **Voyager's invariant**: `measure(900,520) === measure(900,760)`. No magic number, red on 23/23 today. Same PR as #1, red then green, per Vector | 2 | yes — test file | Voyager |
| 3 | Dark-mode link contrast 3.89:1 → AA (`esp-matrix.js:222`) — the pack's only a11y failure, pin-independent | 0.5 | yes — one token | Nova |
| 4 | Empty states re-cut: `client-matrix`'s dead `data-ready` wire, `render-gate`'s missing `#stage` fallback, Nebula's card round the seven bare strings | 2 | yes — markup | Atlas + Nebula |

**Dropped from my R2 bucket:** Nova's `.body{overflow-y:auto}` + `max-height:46vh` — s4 shows it caps the grid at 40% atop a deletion that gives 100%. **Also dropped: my own `containerDimensions` read**, which rests on an observation that does not exist and so cannot carry the third field honestly. Iris and the story pair converged on `render-gate` FAIL, `rfm-map`, `inbox-preview`, with `esp-matrix` gated on fix *plus* changelog entry — but no marketing item enters this bucket: Railway is pre-0.40.0 and the fixtures do not exist.

## The tripwire — and my fifth error

```
$ grep -rn "changelog" package.json .github/workflows/ tests/ ; echo exit=$?
exit=1
```

Zero matches against paths that exist (4 workflows, 70+ suites). True, and **misleading: `changelog.ts` is not in this repo** — it is `get-orbit/lib/changelog.ts`. I demanded a gate from a repo that does not own the file. One grep, one conclusion, again.

The real shape is better. `get-orbit/tests/tripwires/` is an existing 19-file convention, and `cohesion-drift.test.mjs` already reads `changelog.ts`. It checks **coverage** — does the current version have an entry — **non-blocking**, so a missing note cannot strand a version bump. Correct for coverage; blind to **decay**.

**Commit: `get-orbit/tests/tripwires/wont-fix-decay.test.mjs`** — sibling, same suite, same textual read. Scan for won't-fix language, take the version from the slug, compare to `LATEST_MCPB_VERSION`, fail past three minors. **Blocking**, unlike its sibling: a stale won't-fix strands nothing, so a warning serves nobody. And **scheduled as well as on push** — `release-lag.yml` argued it better than I can: *"Standing still is not an event, so it cannot be caught by an event."* `0-32-0-integrations` gained eleven releases of distance on days nobody pushed. 1.5h, reversible, owner Sentinel.

## Top concession

**I should have stopped filing findings after R1** — the findings, not the ledger. F1 reframed the round on half a proof, and Voyager and Sentinel found the surviving half better within a day. Drones read the orchestrator as pre-cleared: that is why one grep cost three drones a round, and why "verify F1" came back 3/3.

## Line in the sand

**Nova's diff does not ship on top of the deletion, in any form.** Shipping both because both are "fixes for the same widget" re-runs August — a child given a floor after the parent's constraint is gone — with the measurement in front of us.

## Vote — the three principles

1. **Prose that cannot fail a build is not a decision — it is a note.** Three instances here.
2. **Brief to break, not to verify.** F1 is the exhibit; 3/3 confirmations bought nothing.
3. **Measure the product, not the harness.** ~8,800 words, zero observations of Claude Desktop.

## Open question for R4 — asked aloud, verbatim

`~/code/pulsar/scripts/say.sh "Vector — Iris, Nebula and Echo landed on the same three assets by two incompatible routes, and Echo said out loud that the agreement is worth less than it looks. Nobody has named who the site visitor is. Does a roster three people reached by different arguments count as settled for R4, or does it go to Justin as a decide item? I will record whichever you rule, but I will not let R4 call it consensus by default." --agent pulsar`

`CONSULT justin: Nebula's challenge — name the site visitor — is unanswered after two rounds and is all that stands between the roster of three and a fifth roster in R4.`

— Pulsar
