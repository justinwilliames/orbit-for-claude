> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — Engineering pair: Sentinel × Voyager · 31 Aug 2026

## 1. Where we agree

**Sentinel:** Iris and Pulsar both found the deprecated install identifier. Neither said the
sharp part: the pipeline *held every byte it needed to catch it*. `build-mcpb.yml:370-371`
computes `LEGACY_NAMES` and `CURRENT` on adjacent lines — dead name and live name in one
shell scope — and nothing in this repo ever greps a doc for either.

**Voyager:** Vector's F3 named the shape — fix ships, guard gets cut. Narrower: three of his
six dead items were *readbacks* (item 11's description check, item 1's `isLatest` assertion,
item 3's download snapshot). Cheapest guard there is, first one cut, because it demos as
nothing. Atlas's `orbit_check_setup` bug is adjacent, for a data reason not a UX one:
`status` and `blocking_issues` from different predicates is a schema that can emit a
self-contradicting row — a denormalisation, not a copy bug.

**Sentinel:** And Nebula's read of `sync-counts.mjs` is worse than she said: `TARGETS` is a
four-file literal at line 94, so `CLAUDE.md` and `docs/INTEGRATION-STANDARD.md` aren't missed
by the regex — they're *unreachable*.

## 2. Where we fight

**Voyager:** Sentinel, Finding 1 says *"1.35 MB of the 37 MB bundle is not the file in the
commit it was built from."* True — and wrong by five orders of magnitude:

```
$ git diff -U0 data/guides-export.json
-  "exportedAt": "2026-08-21T11:59:17.368Z",
+  "exportedAt": "2026-08-24T15:56:30.370Z",
$ python3 …  slugs only in HEAD: []   only in worktree: []   bodies changed: 0
```

99 in, 99 out, zero bodies moved. The whole irreproducibility of a 37 MB artefact is **one
ISO-8601 string — twenty-six bytes**, plus the same field in `courses-export.json`. Your lens
is "does this number measure what it claims." 1.35 MB claims content drift. There is none.

**Sentinel:** Correction taken on magnitude, refused on conclusion. A sha256 has no notion of
small. The registry froze `fileSha256 15b044a5…` forever; a stranger rebuilding the tag gets
a different hash and correctly concludes the release isn't what it says.

**Voyager:** Then here's the real fight. Your ship-it is `git diff --exit-code` after
packaging, as a hard release gate. Ship it today and **every build goes red**, because the
fetch rewrites that timestamp whether or not a guide moved. Smoke alarm over a toaster: it
gets `|| true`'d within two sprints, and you've spent the one gate this team would accept.

**Sentinel:** …that lands. Sequence it. Normalise first, gate second: strip `exportedAt` and
the fetch is idempotent, so `git diff --exit-code` reddens *only when guide content actually
changed*. Same twenty lines, one of them finally in the right place.

## 3. The finding neither of us files alone

`data/guides-export.json` is the only record in this repository of what the live website
contains — and it has been dirty in the working tree for six days.

```
$ git status --porcelain data/   →  M data/courses-export.json
                                    M data/guides-export.json   (mtime Aug 25 10:34)
```

Sentinel sees a reproducibility break; Voyager sees an unrecorded outcome. Same artefact. The
build-time fetch is accidentally Orbit's only instrument on the website's state, writing its
reading into a file nobody commits, on one laptop — with the reading itself (`exportedAt`)
being the field that breaks the release.

Kill the timestamp and `git diff` on that path stops meaning "a build ran" and starts meaning
**"the guide library changed"**: a restart-surviving outcome row for the site sync, and the
gate Sentinel wants, delivered by *deleting* a field rather than adding a system.

## 4. Sharpened or retracted

**Sentinel — one retraction, one sharpening.** Retracted: the "1.35 MB" framing. Sharpened:
the shipped bundle's `da7ffe4e…` is byte-identical to the **dirty local worktree**, not just
different from HEAD. CI and this laptop agree; git is the only party out of step. The first
move isn't pipeline surgery — it's `git add data/`. Right finding, fix aimed a layer too high.

**Voyager — retracted cleanly.** I ranked the `verdict` telemetry field as the thing standing
between this cycle and measurability, and routed its consent question to Meridian. Vector's Q8
shows that ranking is wrong: `verdict` needs a re-consent argument and still doesn't answer
what anyone is asking, while the query that *does* needs no new field at all. I led with a
schema change because schema changes are what I like. Named failure mode, walked into it.

## 5. Answers to routed questions

### Q1 — Sentinel → Voyager: pin the guides export instead of fetching it?

**Voyager:** Yes — and you don't have to pin it. The constraint you worried about doesn't
exist: `grep -A3 "schedule:" .github/workflows/*.yml` returns one cron, `audit.yml` Monday
07:00. The daily sync you credited me with is the *website's*; it doesn't write here.

Better than pinning: make the fetch **content-addressed**. Drop `exportedAt`/`generatedAt` at
write time in `fetch-guides.mjs` — two lines, inside the block already validating shape at
55-66. Guides stay live, identical content yields an identical file, and the build is
reproducible *without* freezing the library. Second half, not optional: that script swallows
a failed fetch into `console.warn`. Make it `::error::` and non-zero **in CI only**.

### Q7 — Iris → Sentinel: does the pipeline re-check docs against what it just published?

**Sentinel:** Absent — not by design, by omission, and provably, because the pipeline already
holds both operands.

```
$ grep -n "README\|SETUP.md\|docs/" .github/workflows/build-mcpb.yml  → (nothing)
$ grep -rn "…lifecycle-mcp" tests/ scripts/                           → (nothing)
```

Zero doc references across 500+ lines of release workflow, zero registry identifiers in the
test estate. The deprecation step knows the names it kills *and* the name it promotes, and
never asks whether a doc mentions either. Four lines, same step:

```bash
for LEGACY in $LEGACY_NAMES; do
  grep -qrl "$LEGACY" README.md docs/ && { echo "::error::$LEGACY is an install
    instruction and is about to be deprecated."; exit 1; }
done
```

That reddens this morning's run ten minutes before it shipped a README pointing at the entry
it was retiring. Confirmed, Iris — and the cause is smaller than either of us implied. Nobody
made this call, so nobody made it deliberately.

### Q8 — Vector → Voyager: of the 106 installs, how many client_ids ever ran a tool?

**Voyager:** I can't answer it, and **nobody can** from data that exists. Not permissions —
the question has no join. `telemetry.js` stamps `clientId` on every event including
`tool_call` (line 210), so the shape is fine; the denominator is the break. Your 106 is
GitHub `downloadCount` — anonymous GETs counting bots, mirrors, CI runners and the same
person twice. A `clientId` is a UUID written to `~/.orbit/client-id` on first run. No key
connects them, and by design none should. Also: your printed rows sum to **115**, not 106 —
the species of defect we're all filing this round, a figure that doesn't measure what its
label claims. v0.32.0 stands at **3**.

**The answerable question, needing nothing shipped:** *of distinct `clientId`s emitting
`session_start` since 13 Aug, what fraction emitted ≥1 `tool_call`?* Every field is already
in production Postgres — one `GROUP BY client_id` with a `HAVING`. No schema change, no new
event, no re-consent, no Meridian. That is the activation rate you're force-ranking on, and
I can't run it from here: the collector lives behind `yourorbit.team`. What has to change is
one person, ten minutes, and the query pasted into this folder.

## 6. Our questions

**Sentinel, to Pulsar:**

> **CONSULT Pulsar:** Q7's fix is four lines in a step that already runs on every publish,
> but it makes a *release* fail on a *documentation* string — a severity call, not an
> engineering one, and the same call this team got wrong at `build-mcpb.yml:261`. Do I gate
> the release, or the pull request? I'll implement whichever you sign; I won't pick the
> severity unilaterally twice in one repo.

**Voyager, to Vector:**

> **CONSULT Vector:** the activation query is answerable today — no schema change, no
> re-consent, one `GROUP BY client_id … HAVING count(tool_call) > 0`. Three cycles have
> called it a ten-minute job. If it is still unrun at R4, is the honest disposition that it's
> low-priority — say so and stop citing it as the blocker — or is the real finding that
> nobody in this loop has production credentials, a different problem with a different
> owner?

---

*— Sentinel, Principal Engineer + Data Analyst · Voyager, Staff Backend / Data Engineer.
One timestamp from reproducible, one query from knowing. Neither is a build problem.*
