> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 evidence audit — 31 Aug 2026

Run by the orchestrator between R1 and R2, per SKILL.md §2b. Required reading in R4.

## Result

**All nine drones pass. Zero re-spawns triggered. Zero findings failed the gate.**

27 findings filed: **23 `[instrumented]`, 4 `[judgement]`.**

## Per-drone tally

| Drone | Model | `[instrumented]` | `[judgement]` | Gate |
|---|---|---|---|---|
| Sentinel | opus | 3 | 0 | pass |
| Voyager | opus | 3 | 0 | pass |
| Nova | sonnet | 3 | 0 | pass (see note) |
| Atlas | sonnet | 3 | 0 | pass |
| Nebula | opus | 1 | 2 | pass |
| Echo | sonnet | 2 | 1 | pass |
| Iris | sonnet | 2 | 1 | pass |
| Vector | opus | 3 | 0 | pass |
| Pulsar | opus | 3 | 0 | pass |

All nine files carry the required §1 disclaimer header.

## Note on Nova

A mechanical pass flagged `R1-nova.md` as 3 `[instrumented]` findings with **zero fenced
code blocks** — the exact signature of judgement dressed as measurement. Read in full, it
is a false positive: she quotes her outputs inline in backticks rather than in fences.

- Finding 2 is the strongest instrumented finding in the round: `shasum icon.png
  icon-light.png icon-dark.png`, one hash quoted (`d3beefd7…`), byte size and format
  confirmed with `file`.
- Finding 1 cites `server/ui/tokens.js:54-56` and `server/orbit-branding.js:44-74` with the
  declared font literals quoted, and names the three embedded `.ttf` files on disk.
- Finding 3 is the softest: `ls -la` dates on two PNGs against code edit dates. She states
  the limit of her own instrument out loud — *"I can't tell you from a file date alone that
  the pixels moved enough to change the screenshot's honesty"* — which is the opposite of
  the failure mode this gate hunts. **Pass, with the hedge preserved into R4.**

Nobody's tag was downgraded.

## Orchestrator re-verification

Three R1 claims were re-measured independently by the orchestrator rather than taken on
the drone's word. All three hold.

**1. Nova's icon claim — CONFIRMED.**
```
$ shasum icon.png icon-light.png icon-dark.png
d3beefd77fd508c50c23c00f85e8a081354e57bc  icon.png
d3beefd77fd508c50c23c00f85e8a081354e57bc  icon-light.png
d3beefd77fd508c50c23c00f85e8a081354e57bc  icon-dark.png
```

**2. Iris's and Pulsar's README claim — CONFIRMED, and broader than either stated.**
Two lenses found this independently (Iris on install friction, Pulsar on process). The
orchestrator's third check makes it three.
```
$ grep -n "braze-lifecycle-mcp\|orbit-lifecycle-mcp" README.md docs/SETUP.md
README.md:78:io.github.justinwilliames/braze-lifecycle-mcp
```
```
$ curl registry.modelcontextprotocol.io/v0/servers?search=…
   io.github.justinwilliames/braze-lifecycle-mcp v0.28.3 status=deprecated
   … (0.28.4, 0.28.5, 0.29.0, 0.29.1, 0.29.2, 0.30.0) …
   io.github.justinwilliames/braze-lifecycle-mcp v0.31.0 status=deprecated
   io.github.justinwilliames/orbit-lifecycle-mcp  v0.31.1 status=active
   io.github.justinwilliames/orbit-lifecycle-mcp  v0.32.0 status=active
```
**All eight versions of the name the README gives are deprecated. The live name appears in
neither README.md nor docs/SETUP.md.** The README's only install instruction points at a
fully deprecated registry entry whose newest version is two releases behind.

**3. v0.32.0 publication — CONFIRMED live.** Registry returns `orbit-lifecycle-mcp v0.32.0
status=active`. All CI publish steps succeeded, including "Promote to latest" and "Verify
the published registry entry". Not verifiable by the orchestrator: what a signed-in visitor
actually receives from `yourorbit.team/api/mcpb-download`, which returns 401 to an
unauthenticated caller.

## Question ledger opened at R1

Nine CONSULTs were routed. Where each is answered:

| # | From | To | Question (abbrev.) | Routed to |
|---|---|---|---|---|
| 1 | Sentinel | Voyager | Can `guides-export.json` be a pinned committed input instead of a build-time fetch? | R2 engineering pair |
| 2 | Voyager | **Meridian** | Does adding a closed-vocabulary `verdict` field to telemetry require re-consent? | **R2 consult spawn — Meridian is NOT otherwise active** |
| 3 | Nova | Nebula | Which type system is canonical, and who regenerates the icons? | R2 story pair |
| 4 | Atlas | Nebula | Restructure SETUP.md's CLI section to lead with the zero-credential command? | R2 story pair |
| 5 | Nebula | Iris | Which README opener does a stranger actually convert on? | R2 Iris solo |
| 6 | Echo | Iris | Is anything in place to measure a stranger we point at this? | R2 Iris solo |
| 7 | Iris | Sentinel | Does the pipeline re-check README install instructions against what it just published? | R2 engineering pair |
| 8 | Vector | Voyager | Of 106 installs since 13 Aug, how many client_ids ever ran a tool? | R2 engineering pair |
| 9 | Pulsar | Iris | Is the dead registry name still carrying discovery — redirect or string swap? | R2 Iris solo |

Question 2 has no live owner. Meridian was not summoned (`--with-legal` absent), but the
question is squarely his and it is the same question the 12 Aug review left open as its
Decision #2, eighteen days ago. Per §1c the orchestrator spawns the owning drone rather
than letting Voyager guess. He is spawned in R2 to answer that one question only — he does
not join the review, and he holds no block rights this run.

A question asked and never answered is a dropped handoff, and it is the orchestrator's drop.
R4 must list any of the nine that died unanswered.
