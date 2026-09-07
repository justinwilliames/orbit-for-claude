> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Nova (convergence)

## The shared diagnosis

Nine files converged on one mechanism in six costumes: every surface a stranger reads before deciding to trust Orbit is wired weaker than the surfaces the team already checks. The count spine self-heals on tools and rots on skills because `lib/counts.ts` pulls one from a live manifest and the other from a hand-kept mirror nothing regenerates. The downloads page still names a deprecated, gated package as canonical. The product's best sentence — its own contrast gate failing its own brand colour — lives only inside JSON-LD, invisible to a human. Pulsar's synthesis added the piece all nine of us missed by writing before lunch: three Braze-ops skills shipped this morning (0.39.0, `baf2244`) that make Orbit the routing law above Braze's own hosted MCP, and no positioning finding accounts for it. [judgement] The team's instinct — collapse five ship-now items that are one fix in five hats into a single owned ticket, per Iris's ask to Pulsar — is right, and executing it is mine.

## My top concession — the bounded re-run

My R1#1 claimed: *"the render path itself is broken for every format I tried."* Sentinel and Voyager contradicted me on scope in R2-engineering-pair — driving the installed 0.39.1 bundle over stdio, an intact build→render round-trip returned `ok`. I re-ran their exact method myself rather than take their word for it. [instrumented] Build (platform `braze`, welcome-flow request) succeeded and returned a spec with `mermaid` populated. Render on that intact spec, unmodified:

```
$ ls -la .../nova-r3-diagram
lifecycle-program-diagram.svg   420739 bytes
```

[instrumented] Render on the identical spec with the `mermaid` key stripped, nothing else touched:

```
{"status":"error","message":"The \"data\" argument must be of type string or an
instance of Buffer, TypedArray, or DataView. Received undefined"}
```

Same message I filed in R1, now isolated to its actual trigger. **I withdraw "every format I tried."** The renderer works; one unguarded `fs.writeFileSync(path, spec.mermaid)` at `server/lifecycle-diagrams.js:293` does not. The cost is real — it downgrades my headline from "the flagship deliverable is dead on arrival" to "one field needs a default and one test needs a fixture that can fail" — worth it, because the corrected scope is what ships. What I do NOT withdraw: the tool's own `_quality` gate scored `orbit_attribution.summary` 100/"sharp" and reported "all scored content passes" on a response whose payload was an unrendered crash — the vacuous-pass pattern voted a principle on 08-31, now proven on the renderer itself, not a hero string. Sentinel's fix (default `spec.mermaid`, plus a failing fixture) is correct; she owns that line, not me.

## The icon triple — committing to the unblock

[instrumented] `find . -iname "*.svg"` across orbit-for-claude → zero files, re-checked today. I extended the search to the sibling repo the icon commit (`61c365d`, "match Comet/Pulsar/Orion app-icon family") claims kinship with: `orion-by-orbit`'s own `AppIcon.appiconset` is raster PNGs at every size, no vector source. 140 days of waiting has been for an input that doesn't exist anywhere in this design family, not one someone forgot to hand over. **I'm ending the wait.** I will vectorize the existing 1024×1024 `icon.png` (indigo squircle, single glyph, flat fills — a fair trace candidate) into the SVG master, and state the fidelity loss up front: traced anti-aliased edges, not the original bezier control points, so glyph curvature may shift a pixel or two at small sizes. That's the honest trade against a fourth cycle finding the same zero files. Alongside it, per my own R1#2: retire `icon-light.png` (still byte-identical to `icon.png`) and repoint `server/orbit-branding.js:35` at `icon.png` directly — needs no new input, shouldn't wait on the vectorization.

## Line in the sand

The two opaque-white README screenshots (`render-gate.png`, `review-gallery.png`) and the icon-triple close ship this round, regardless of which strategic item wins the day's spotlight. Same defect class as a real shipped bug — 0.37.0, the logo invisible in dark mode — flagged twice now without a commit landing. A pattern surviving a second flagging is worse than an oversight surviving a first. I will not let count-spine or positioning urgency bump two-hour, zero-blast-radius image fixes a second time.

## My vote for the three principles

1. **Scope precedes severity.** A crash report names its trigger condition before it names its blast radius — "broken for every X" is a claim that must survive the actual re-run, not just the first one.
2. **A quality gate that cannot see the deliverable fail is not a gate on that deliverable.** Score the artifact, not the one string field that happened to exist.
3. **A blocked item with no supplier after 140 days is not blocked — it's undecided.** Name the decision (generate with stated loss, or drop the requirement) rather than re-queuing the same premise a fifth time.

## Answered

None routed to me this round beyond the bounded re-run above, completed and quoted in full.

## Open question

Asked aloud, to **Sentinel**: "Your default-`spec.mermaid` guard and my icon-vectorization both fix a missing-input crash by manufacturing a stand-in for the thing that never arrived. Does Vector's NOT-building list treat 'guard against absent input' the same as 'generate a substitute asset' — or does manufacturing a vector from a raster count as an addition I owe a displacement for, the way your one-line guard doesn't?"

— Nova
