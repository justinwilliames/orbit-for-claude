> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# RUN.md — the run's own instrument (31 Aug 2026)

**Outcome: BLOCKED at R5. No `FINAL-SHIPPING-DECISION.md` was written.**
One block (Iris), nine agree-with-caveat. Escalated to Justin for a tiebreaker.

---

## CONTRACT

| Round | Agents | Wall clock | Subagent tokens | Tool uses | Landed |
|---|---|---|---|---|---|
| R1 — solo diagnoses | 9 | 10m 13s | 1,240,185 | 269 | 9/9 |
| R2 — cross-reference | 6 | 9m 47s | 858,203 | 235 | 6/6 |
| R3 — convergence | 10 | 9m 05s | 1,514,867 | 414 | 10/10 |
| R4 — action plan | orchestrator | — | — | — | 1/1 |
| R5 — sign-off | 10 | 2m 39s | 1,011,487 | 151 | 10/10 |
| **Total** | **35** | **31m 44s** | **4,624,742** | **1,069** | **37 files** |

**Zero agent errors, zero empty results, zero stalls across all four fan-outs.** The liveness gate
never fired because the Workflow engine returns a stalled agent as `null` rather than hanging, which
is why it was chosen over fire-and-forget background spawns.

**Models per drone (triaged, not blanket-Opus):** Opus — Sentinel, Voyager, Nebula, Vector, Pulsar,
Meridian. Sonnet — Nova, Atlas, Echo, Iris.

**Cast:** nine drones at R1. **Meridian was not summoned** (`--with-legal` absent). He was spawned in
R2 to answer one routed question no live drone owned, found the two most serious findings in the
review while doing so, and was **activated with full block rights by orchestrator call at R3**.

**Evidence gate (§2b):** 27 R1 findings — 23 `[instrumented]`, 4 `[judgement]`. Zero failed. Zero
re-spawns. One false positive investigated and cleared (Nova quotes output inline, not in fences).

**Bounded re-run (§2b):** fired once, resolved in-round. Voyager contradicted Sentinel's
build-reproducibility measurement; she re-measured, retracted the magnitude, kept the conclusion,
and conceded the fix ordering. No extra round consumed.

**Orchestrator re-verification:** five drone claims were independently re-measured rather than taken
on trust — the icon hashes, the deprecated registry identifier, the v0.32.0 publication, the shipped
bundle's privacy contents, and the `mcp_telemetry` retention path. All five held.

---

## FINDINGS

| id | drone | claim | evidence | disposition |
|---|---|---|---|---|
| F01 | Meridian | Shipped `manifest.json:84` says Orbit never sends queries; `server/index.js:1590` sends them | `unzip -p` on the downloaded v0.32.0 artefact | **R4 item 1 — unshipped. BLOCKED** |
| F02 | Meridian | Root `PRIVACY.md` (5,790B) absent from bundle; `privacy_policies: null` | `unzip -l *.mcpb \| grep -i privacy` → only `docs/PRIVACY.md`, 816B | **R4 item 5 — unshipped. BLOCKED** |
| F03 | Sentinel | Fourth false surface: `telemetry.js:84` writes "content is never sent verbatim" into the user's own log | wire body captured against a local socket | R4 item 1 |
| F04 | Meridian | `orbit_gdpr_consent_audit` returns false consent passes; `kind` is `z.string()` not `z.enum()` | live tool run; form with no marketing checkbox returned two passes | R4 items 3+4 |
| F05 | Voyager | `no_strong_match` unreachable for any configured user — platform bonus +8 vs floor 6 from config | `catalog.js:235`, `:515-517`; A/B with config stripped | R4 queue (router) |
| F06 | Voyager | Friction `detail` retained 400 days, no client-scoped erase path | `get-orbit/lib/db.ts:2546` — the only DELETE on `mcp_telemetry` | **R4 Decision 1 — Justin's call** |
| F07 | Nova | `icon.png`, `icon-light.png`, `icon-dark.png` byte-identical | `shasum` → `d3beefd7…` ×3 | R4 queue, master-first |
| F08 | Nova | `orbit_dark_mode_check` passes the identical-icon composite; never inspects `<img>` | live run, `invert_risk_count: 0` | R4 queue |
| F09 | Atlas | `orbit_accessibility_lint` misses heading *decreases* entirely | live run; absent from all three arrays | R4 queue |
| F10 | Atlas/Nova/Iris | `orbit_check_setup` `copy_generation` status contradicts empty `blocking_issues` | reproduced in 3 independent environments | R4 item 7 |
| F11 | Nebula | `orbit_score_subject_line` scores best line and deliberate slop identically at 96/sharp | live run ×3 | R4 queue |
| F12 | Iris/Pulsar | README's only install identifier is fully deprecated | `README.md:78`; all 8 versions `status=deprecated` | R4 item 6 |
| F13 | Echo | Orbit's own flagship pitch routes to `graphic-design`; `template-brain` never appears | live `orbit_route_task` | R4 queue |
| F14 | Vector/Pulsar | Prior plan's dead items were all guards, decisions or hands — never builds | 12 Aug plan vs git log | R4 structural change 2 |
| F15 | Pulsar/Voyager | **`design/` is `.gitignore`d — this review is invisible to git** | `.gitignore:13`; 0 tracked, 37 on disk | **R5 caveat — unresolved** |
| F16 | Vector | `build-mcpb.yml:261` still `exit 0` on the ship-nothing path | re-measured at R5 | R4 structural gap |
| F17 | Sentinel | Prior item 5 shipped but does not fire — nonexistent domain graded `warn` | executed against a live lookup | Re-opened |

---

## SINGLETONS — findings only one lens produced

These are the coverage evidence. Each would have been missed by a nine-drone team without that seat.

- **F01, F02, F04 — Meridian.** The three most serious findings in the review came from a drone who
  was **not summoned to it**. No other lens read the shipped bundle against the shipped claim.
- **F05 — Voyager.** Only the data lens asked whether the abstention branch was *reachable*, not just
  whether it existed. It inverted the privacy blast radius for everyone.
- **F06 — Voyager.** Only lens to leave the review's target repo and read the collector.
- **F09 — Atlas.** Heading *decrease*. Everyone else tested the direction the rule was written for.
- **F11 — Nebula.** Only lens that fed a gate two inputs it should have scored differently.
- **F15 — Pulsar.** Only lens whose job is the loop rather than the artefact.
- **F17 — Sentinel.** Only lens that re-executed prior-cycle items instead of grepping for them.

**The `[judgement]`/`[instrumented]` split held its purpose:** all four `[judgement]` findings came
from Nebula, Echo and Iris — the taste lenses — and none was dressed as measurement.

---

## OUTCOMES — disposition of the 2026-08-12 run's twelve items

Measured by Pulsar (R2) and re-executed by Sentinel (R3). **7 shipped · 2 half · 3 dead.**

| Prior item | State | Note |
|---|---|---|
| 1 — version bump / `merge-at-published-version-ships-nothing` | **half** | Bump landed; `isLatest` assertion never written. **Recurred today** — 37 commits, 11 days unpublished |
| 2 — `get-orbit b53f4c1` false-account claim | shipped | On `main`, claim gone |
| 3 — brand-name door | **dead** | A decision. Nobody made it |
| 4 — SPF redirect | shipped | Re-executed: cisco.com expanded 3 levels, `lookup_count_is_complete: true` |
| 5 — `unreadable(reason)` | **shipped but does not fire** | Nonexistent domain returned graded `warn` claiming "27 common defaults that answered". **Re-opened** |
| 6 — `qa-report.js` "not measured" | shipped | |
| 7 — presend gate blind to `<style>` | shipped | Executed by Pulsar during R2 in ninety seconds; now returns `verdict:"fail"` on the 1.09:1 case |
| 8 — PDF import on zero extraction | shipped | Re-executed with a hand-built 743-byte PDF; also exposed `untrustedImportEnvelope` duplicating the payload |
| 9 — brand-kit pair | shipped | `fonts: passed:false` confirmed |
| 10 — telemetry blind to wrong answers | **dead** | A guard |
| 11 — GitHub repo description sync | **half** | Edit landed, drifted back to 80/130, guard never written |
| 12 — number the review folders | **dead** | A hand. **This is F15** |

**The pattern, stated once:** every dead item was a guard, a decision, or a hand. Every *rider* — a
guard attached to a fix — shipped its demoable half and lost the other. That is why R4 makes a guard
its own row.

---

## The finding this run cannot dodge

Item 12 of the last plan was "number the review folders, or un-ignore `design/`". It died. As a
direct consequence, **this review — 37 files, 35 agents, 4.6M tokens — is sitting in a directory git
cannot see**, exactly like the plan whose death it was convened to explain. Pulsar and Voyager both
found it while grading the orchestrator's own work.

That is the correct outcome of a review that grades its own loop. It is also the first thing that
must change, and it costs ten minutes.
