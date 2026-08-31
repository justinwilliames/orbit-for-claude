> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Voyager, solo diagnosis (31 Aug 2026)

## 1. Verdict

Ship it — the artifact is sound and v0.32.0 is live — but Orbit still cannot answer "did the last change reach anybody, and did it do any good?", and until it can, every future cycle is the same eleven days waiting to happen.

## 2. Findings

### F1 — `[instrumented]` The two storefronts disagree by eight guides, and the script written to prevent that cannot see the one that's wrong

**Instrument:** diff every copy of a duplicated set across its homes before trusting one.

```
$ node -e "import('./scripts/sync-counts.mjs').then(m=>console.log(m.COUNTS, m.GUIDE_INVENTORY))"
COUNTS {"skills":83,"tools":135,"guides":99,"guideWords":199000}
GUIDE_INV -> 99 long-form practitioner guides

$ node -e "…match each REWRITE pattern against README.md…"
/\b\d+\+? skills and \d+\+? tools\b/g      -> ["83 skills and 135 tools"]
/\b\d+\+? (?:long-form )?practitioner guides\b/g -> null
/\b[\d,]+-word practitioner library\b/g    -> ["199,000-word practitioner library"]
literal "long-form guides" hits: [ '91 long-form guides', '91 long-form guides' ]
```

`data/guides-export.json` holds `count: 99`, `len(guides) == 99`. `manifest.json` — the extension
card a stranger reads at the install decision — says **"99 long-form practitioner guides"**, because
it uses the noun phrase the regex matches. `README.md` says **"91 long-form guides"**, twice, because
it does not. `docs/INTEGRATION-STANDARD.md:45` says "the 91 guides" and isn't even in `TARGETS`.

The sharp bit is inside one sentence. README:59 reads *"A 199,000-word practitioner library, offline.
91 long-form guides…"* — the word count is synced, derived from all ninety-nine bodies; the guide
count beside it is eight short. One sentence, two numbers, same store, contradicting each other.

And nothing runs the script. `grep -rl sync-counts tests/` returns nothing; `package.json` has no
`sync:counts`; the workflow's gate is `npm ci → audit → test → smoke+evals → build`. Its own header
says "Exit 1 means something was stale and has been rewritten" — an exit code only a human who
remembers to type the command ever sees. Suite 58 guards the tool count in the *server instructions*
(`✔ the instructions do not misstate how many tools Orbit has`, 6/6 pass). Nothing guards the
README's guide count, which is the number on the page people arrive at.

### F2 — `[instrumented]` Telemetry counts that a tool ran. It has never recorded what one concluded.

**Instrument:** telemetry that records outcomes rather than actions.

`server/telemetry.js:191` takes `ok` and never sends it:

```js
export async function trackToolCall({ slug, version, ok = true } = {}) {
  if (ok) errorStreaks.delete(slug);
  …
  await postTelemetry({ type: "tool_call", slug, version: version ?? null, clientId });
}
```

`ok` is a local streak-reset. The wire event carries type, slug, version, install id. Success is
only recoverable as `tool_call − tool_error`, which the docstring says out loud. `grep -n verdict
server/telemetry.js` → zero hits, against 14 `verdict` fields in `server/index.js` where the gates
compute pass/warn/fail.

This is R4's item 10, `telemetry-blind-to-wrong-answers`, and its Decision-needed #2 — *"Send a
`verdict` dimension on the telemetry ok-path — or accept that this round's correctness work is
unmeasurable?"* — marked **"Justin's call and I am not shipping item 10 without it."** Eighteen days,
no answer, no R5 file in that folder. `orbit_render_gate`, `orbit_qa_email` and the accessibility
lint are the product's central claim, each returns a verdict, and Orbit has no idea whether one
install has ever seen a `fail`. Every correctness fix this cycle moves the numbers Orbit owns by
exactly zero, in both directions.

### F3 — `[instrumented]` Eighteen green runs, zero releases. Nothing anywhere holds an outcome row.

**Instrument:** check the run ledger carries an outcome row for the previous run's items.

```
$ gh run list --workflow=build-mcpb.yml --branch main   # 20 Aug 13:00 → 31 Aug 05:00
  18 success
   9 failure
$ gh release list   # same window
  (no rows)
$ git log --since=v0.31.1 …  → 35 commits, 31 touching publish-trigger paths
```

Eighteen green runs shipped nothing. The workflow *knows* — line 260 emits `::warning:: … THIS MERGE
SHIPPED NOTHING`, a good-faith attempt to make a green run legible. But an annotation is a per-run
artifact: nothing aggregates it, nothing alarms on it, and no query answers "is main ahead of the
registry, and for how long?" Whether a fix reached a user is recorded only in a human noticing.

The review process has the same hole. `design/team-review-2026-08-12/` runs R1→R4 and stops — no R5,
no `FINAL-SHIPPING-DECISION.md` — and item #1 of its action plan is
`merge-at-published-version-ships-nothing`, the exact defect that recurred. A plan with no
disposition row is telemetry that fires on start and never on finish. Confirmed live: v0.32.0 **did**
publish (release 2026-08-31T06:15:23Z, run 33362799044, success, 10m40s) — the brief's open item
closes green.

## 3. The single thing I'd ship

A scheduled `is-main-shipped` job — a cron reading `manifest.json.version`, calling the same
`/v0/servers/{name}/versions` endpoint the republish guard already uses, and **failing** when main's
version is published and HEAD is more than one commit past the last release tag. Same call, same
parser, assertion inverted a second time; roughly fifteen lines. It turns "green run, no release"
from an annotation nobody reads into a red inbox, and catches this class on day one instead of day
eleven. Add `node scripts/sync-counts.mjs` to the CI gate in the same PR — it already exits 1 on
stale, it just needs a caller — and widen its guide pattern to
`\d+\+? (?:long-form )?(?:practitioner )?guides`.

## 4. What I'd defer

Whether to add the `verdict` dimension. It is the right thing for my lens and I'd take it tomorrow,
but the tradeoff isn't mine: Orbit shipped PRIVACY.md and "What Orbit sends home" as part of a free
relaunch, and every field added to an opt-out payload re-opens a promise made in public. That is a
compliance call. I'd also leave the README's guide-count *prose* to whoever owns that voice — I can
tell you the number is wrong, not how the sentence should read once it's right.

## 5. Question for another drone

**CONSULT Meridian:** *Orbit's published telemetry contract names four event types and a closed
`errorClass` vocabulary. If I add one more closed-vocabulary field — a five-value `verdict`
(pass/warn/fail/unknown/not-measured) on the ok-path, carrying no arguments, no content, no prompt —
does that require re-consenting existing installs and re-publishing PRIVACY.md before it can ship, or
is it inside the disclosure already made? R4 left this open as Decision #2 eighteen days ago and it
is still the only thing standing between this cycle's correctness work and being measurable.*

---

*— Voyager, Staff Backend / Data Engineer. 31 Aug 2026.*
