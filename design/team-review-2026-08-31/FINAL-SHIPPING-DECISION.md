> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# Final shipping decision — Orbit, cycle of 31 Aug 2026

**Signed off. Ten of ten, zero blocks.** The review reached R5 blocked, the plan was
executed, and the team re-signed at R5b against the shipped artefact rather than the plan.

---

## The three principles the team ships against

Voted in R3, and each earned by a defect this cycle actually found.

**1. A fix and its guard land in the same commit, or the fix is not shipped.**
Nova's line, seconded by Pulsar and Vector and generalised by all three. Every *rider* on
the 12 Aug plan — a guard attached to a fix — shipped its demoable half and lost the other.
Seven of twelve items landed; the three that died were a guard, a decision and a hand.

**2. Every disclosure obligation is verified against the shipped bundle, not the repo.**
Meridian's, voted independently by Iris. The root `PRIVACY.md` existed, was well written,
and was not in the `.mcpb` at all. A notice that does not travel has not been given.

**3. A check with an opinion must state it — pass, fail, or not-measured — and must key on
the fact, not its own vocabulary.**
Atlas's, promoted by Meridian after he found it loose inside his own tool. Six instruments
failed this in one afternoon.

---

## Sign-off tally

| Drone | R5 (unchanged artefact) | R5b (shipped artefact) |
|---|---|---|
| Iris | **I BLOCK on R4 items 1 and 5** | **I agree** — block lifted |
| Meridian | agree with caveat | agree with caveat |
| Sentinel | agree with caveat | agree with caveat |
| Vector | agree with caveat | agree with caveat |
| Pulsar | agree with caveat | agree with caveat |
| Voyager | agree with caveat | agree with caveat |
| Nebula | agree with caveat | agree with caveat |
| Nova | agree with caveat | **I agree** |
| Atlas | agree with caveat | **I agree** |
| Echo | agree with caveat | agree with caveat |

**Zero blocks at R5b.** Every remaining caveat is either satisfied below or carries a
labelled issue.

---

## What shipped — v0.33.0, verified in the downloaded release asset

Registry: `io.github.justinwilliames/orbit-lifecycle-mcp v0.33.0 status=active`, `isLatest=true`.
All seven CI publish steps green including "Promote to latest".

| Check | Result |
|---|---|
| `route_task_no_match` / `trackFriction` in shipped `server/index.js` | 0 / 0 |
| root `PRIVACY.md` in the bundle | present, 6,412 bytes |
| `manifest.privacy_policies` | two URLs |
| `kind` is a `z.enum` | present |
| bundled entry point | passes `node --check` |
| full suite | 1181 passed · 0 failed · 185 suites |

**get-orbit** (`6692ff8`, deployed and verified live): the ingest route reads `detail` and
discards it, for every event type from every client — the half that covers 0.32.0-and-earlier
installs that will never update. Build exit 0; 47 tripwires + 74 unit + 105 scenarios, zero
failures.

---

## What R5b caught — three defects in the orchestrator's own fixes

The re-sign was worth running. Every one of these came from a drone checking the
orchestrator's claims rather than accepting them.

**Sentinel — Guard 3 was decoration, and worse than she thought.** Breaking the status
derivation left the suite at 6 pass / 0 fail. Her root cause beat the diagnosis:
`validateBrandKit` early-returns when `brand-profile.json` is missing, so the fixture
labelled "guidelines and tone present" had *neither* — both fields came back `undefined`,
both blockers fired, and `blocking_issues.length === 0` was unreachable. The old guard also
passed against **the original defect reintroduced verbatim**. Rewritten with four declared
fixture states, a fixture-drift assertion, and an anti-vacuity check that fails the suite if
no state reaches the empty array. Both breaks now go red; restored, green.

**Nebula and Iris — the content-emptiness claim survived in `manifest.json:766`.** The
orchestrator checked `server/index.js` only. The product ships two surfaces and the fix
covered one. Now removed, and **Guard 4** asserts no shipped surface advertises it, proven
to fail on reintroduction.

**Meridian — `PRIVACY.md` traded one absolute claim for another.** "The receiving server
does not log it" is contradicted by the edge proxy underneath the app. Narrowed to what
Orbit can actually promise: the application never reads or stores an IP and the table has no
column for one, while the hosting layer keeps ordinary access logs correlated to nothing
Orbit holds.

That is three false or vacuous claims caught in the work written to stop false claims.

---

## Standing caveats, each with a home

- **Meridian:** the historical `friction.detail` rows are untouched. `eraseStoredFrictionDetail()`
  and `scripts/erase-friction-detail.mts` are committed with a `--dry-run`, deliberately not
  wired to boot and **not executed** — a production DELETE is Justin's. `PRIVACY.md`
  deliberately does not claim the rows are gone.
- **Echo:** Decision #4 — tell anyone — **stays blocked**, and correctly. He re-ran the test:
  Orbit's own flagship pitch still routes to `graphic-design` at score 24, `template-brain`
  absent. Nothing shipped touched the router. Issue #13.
- **Vector and Pulsar:** the twelve issues landed **17 hours after** v0.33.0 published, so the
  "before item 1 ships" ordering clause failed. Recorded here rather than smoothed over, so
  the next cycle gates on it. 10 of 12 carry owner · metric · judged date; #23 and #24 are
  multi-finding buckets without a single metric; none has a GitHub assignee.
- **Iris:** the review's falsifiable number is live and currently **failing** — v0.32.0 sits at
  8 downloads and v0.33.0 at 9, against the 42 that v0.31.1 reached in its cold eleven-day
  window. Ten days remain on the 2026-09-11 clock. If it misses, the "organic pull" story
  from R1 and R2 was noise dressed as demand, and raw `downloadCount` stops being treated as
  a demand signal either way.
- **Known staleness:** the corrected Braze guide is live on the site but
  `/api/guides/export` served the build a CDN-cached copy (`s-maxage=86400`), so the bundle
  carries the old plural for one more build.

---

## The queue

Twelve labelled `team-review` issues, **#13–#24**: router scoring · icon vector master ·
dark-mode check blind to images · accessibility heading-decrease · subject-line to
slop-detector · `exportedAt` then the diff gate · the count spine ·
days-between-commit-and-release · `build-mcpb` exits 0 on ship-nothing · prior item 5
reopened · findings dropped from the plan · the deferred three.

`design/` is out of `.gitignore`: 161 review documents tracked, image and video extensions
still ignored. The 12 Aug plan's own item 12 was "un-ignore `design/`", and it died in the
folder git could not see. That specific way of dying is closed.

---

## What's next

The router. Four independent lenses measured it and it is close to noise — a zero-lifecycle
sentence scores 14, the sharpest deliverability question scores 7, and Orbit cannot say "I
don't know" to any configured user because a config-derived bonus outranks the floor. It is
the highest-value week available and every growth question in this review is downstream of
it.

— Pulsar, for the team
