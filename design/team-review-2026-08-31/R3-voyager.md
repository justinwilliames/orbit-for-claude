> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Voyager, committed position (31 Aug 2026)

## 1. The shared diagnosis

One organism, filed nine times: **Orbit's gates check the shape of a thing rather than the fact underneath it, and its records note that something ran rather than what it concluded.** `sync-counts.mjs` matches a noun phrase, so good writing defeats it; the republish guard warns into a channel with no reader; `trackToolCall` computes `ok` and drops it; suite 28 asserts a widget starts with `<!DOCTYPE`. None can tell a finished run from an abandoned one — and the review loop had the same hole, which is why a quarter of this round's findings were re-discoveries of the last plan's backlog. The team also agrees, after Pulsar forced it, that we audited the wrapper: twenty-seven findings, one Orbit tool invoked. And the sharpest thing found — Meridian's, unsummoned — is that the disclosure the installer reads is *false*, not stale.

## 2. My top concession

**I am giving up the `verdict` telemetry field, and the shape of argument that produced it.**

Meridian ruled it ships without re-consent. I asked for that ruling, got it, and am declining to spend it. Sentinel and I already showed Q8 needs no schema change. Worse — Orbit's own quality gate returned `worst_tier: "sharp"`, `min_score: 100` on a flatly wrong answer (§5). Orbit *already* computes a verdict on every response via `attachQualityReport` (`index.js:6624`), and it measures prose slop, not correctness. Had I won my R1 argument I would have piped that to the wire and built a green dashboard over a broken router — my scar verbatim: a field measuring the wrong thing, shipped because I like schema changes. Cost: correctness stays unmeasurable another cycle. Accepted; the cheaper query answers whether that work mattered at all.

## 3. My line in the sand

**A tool must be able to say "I do not know," and whether it says so must depend on the request — not the caller's config.** Block rights at R5.

`no_strong_match` (`catalog.js:235`) is unreachable for any user with a default platform: the bonus at `catalog.js:515-517` awards +8 against a `MIN_ROUTE_SCORE` of 6, and that platform comes from **config**, not the request (`platform_source: "config"`). `status-vocabulary.js:99` calls `no_strong_match` *"an honest answer"*; a configured user cannot receive it. Fix: score the bonus only when the platform came from the request. Everything else I hold is tradeable. This is falsifiability itself — and it gates Meridian's exposure.

## 4. My vote for the three principles

1. **A gate asserts the fact, never the phrasing.** Defeatable by writing well, renaming a variable, or changing a setting means decoration.
2. **Every record carries an outcome, and it survives a restart.** Not that a run happened — what it concluded, as a file git can diff or a row a query can group.
3. **Nothing leaves this run addressed to a session that does not exist yet.** Seven is the measured throughput; twelve items is seven plus five findings we re-discover at full cost.

## 5. What I found when I actually used the product

I ran `orbit_route_task` — the tool carrying Meridian's fifth event — and asked it a woodworking question.

```
$ orbit_route_task "sharpen the blade on my grandfather's hand plane without ruining the bevel"
  primarySkill: "braze-build-packager"
  interactionRecommendation: { mode: "ready_to_proceed" }
  _quality: { min_score: 100, worst_tier: "sharp" }
```

Then A/B'd the same router with the config removed:

```
hand plane / bevel          configured → no_strong_match=false  primary=braze-build-packager
                          unconfigured → no_strong_match=true   primary=null
sourdough starter           configured → no_strong_match=false  primary=braze-build-packager
kubernetes CrashLoopBackOff configured → no_strong_match=false  primary=braze-build-packager
```

**(a)** The router's honesty is a function of settings. §3.

**(b) Meridian — the blast radius inverts.** Your friction event fires *only* on the unconfigured branch: not a rare edge case, the **first-run path specifically**. A stranger's opening sentence, typed before they configure anything or read any disclosure, is the one input Orbit posts home. And I measured the redactor you credited:

```
IN : draft the layoff comms sequence for the customer success team
OUT: draft the layoff comms sequence for the customer success team
IN : reach out to acme corp about their overdue renewal, contact is sarah@acme.com
OUT: reach out to acme corp about their overdue renewal, contact is [email]
```

Four of five confidential strings pass untouched — confirmed with output, not asserted. And a **third** copy of the false claim nobody named: `telemetry.js:84` writes to the user's own log *"content is never sent verbatim."* That is in the code, not a doc.

**(c)** `orbit_check_setup` live reproduces Atlas's contradiction and confirms Nova's sharpening with the field named: the culprit section is **"Messaging Dos And Don'ts"**, not Tone Of Voice.

## 6. Answers to questions routed to me

**Sentinel, by name — the `guides-export.json` timestamp.** Measured: the entire dirty diff across both data files is **two lines, both clocks**, six days stale. One line in `fetch-guides.mjs` before the write at `:72` — drop the clock, replace it with a digest of the sorted guide bodies. Not simply delete: `guides.js:100,212` and `index.js:1020` consume `exportedAt` for a startup banner, and `payload.version` is a schema version (`1`), useless as identity. A content digest keeps the banner honest and buys what I have wanted for three cycles — **`git diff data/` stops meaning "a build ran" and starts meaning "the guide library changed"**: a restart-surviving outcome row for the site sync, delivered by deleting a field rather than adding a system. Then your `--exit-code` gate is safe to arm. Sequence holds — normalise, commit `data/`, gate.

**Vector, by name — Q8, and does Meridian's ruling clear it.** It clears `verdict`, and `verdict` is not what you need — I am withdrawing it. The smallest change is **zero code**: `count(DISTINCT client_id) FILTER (WHERE type='tool_call') / count(DISTINCT client_id)` since 13 Aug. Every field is already in production Postgres, every install already consented. What must change is that **the result gets committed into this folder**, so the next cycle reads a row instead of re-asking. The honest half: I cannot run it — the collector sits behind `yourorbit.team`. After four cycles the finding is not "low priority", it is that **nobody in this loop has production credentials.** Different problem, different owner; file it as one.

## 7. Open question into R4

**CONSULT Sentinel:** `no_strong_match` is unreachable for a configured user and all 1,175 tests pass. Suite 40 is the best gate here because seven of its nine tests are failure modes. What is the router's equivalent — a gate on "the product can still say I do not know" that does not rot into three hardcoded off-topic strings someone tunes the scorer around in six months?

---

*— Voyager, Staff Backend / Data Engineer. 31 Aug 2026. I asked it about a hand plane and it graded its own wrong answer sharp. Eighteen days wanting a better field, and the field was never the problem.*
