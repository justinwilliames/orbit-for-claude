> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Echo · Growth/Product Marketer

**Opened 11 of 23 served pages, 12 inferred.** Real browser, 900×520, screenshots taken:
`orbit-esp-matrix-html.data.html`, `orbit-lifecycle-flow-html.html`, `orbit-rfm-map-html.html`,
`orbit-send-calendar-html.html`, `orbit-cohort-retention-html.html`,
`orbit-inbox-preview-html.html`, `orbit-design-system-html.html`,
`orbit-review-gallery-html.html`, `orbit-render-gate-html.html`,
`orbit-audit-report-html.html`, `orbit-ab-readout-html.html`. Inferred, not opened, from
EVIDENCE.md + Nebula's 24/24 sweep confirming the shared empty-state shell: `client-matrix`,
`list-forecast`, `postmaster-trend`, `preheader-clip`, `push-matrix`, `qa-report`,
`sms-segments`, `state-matrix`, `auth-panel`, `dark-pairs`, `flow-audit`,
`revenue-attribution`.

## Verdict

Not yet — but I'm running a different test than "empty = unsellable." The friend-repeatable
test doesn't care whether a widget has data; it cares whether a stranger, looking at the
shell alone, can say what it's for. Most widgets don't fail because they're empty — they
fail because the one element that would let them pass empty, a plain-language outcome line
above the void, is missing on roughly a third and jargon-poisoned on a couple more. Fix that
and half the set tells its story before a fixture ever gets written.

## Top 3 findings

**1. The subhead card is the whole mechanism — and it's inconsistent, not absent.
`[instrumented]`** Widgets with a bold outcome line + one-sentence mechanism above the
"Waiting for…" text pass the stranger test cold: `rfm-map` — "Where the money sits" / "Each
segment placed by how recently and how often it buys. Bubble area is the revenue it
carries." Stranger's line: *shows which customers make you the most money.* `ab-readout` —
"Difference in conversion rate" gets: *tells you if version A or B actually won.* Both pass
with zero data on screen. Compare `cohort-retention` and `audit-report` (screenshotted):
bare title straight to a grey box, no card — "Cohort retention" alone gets "no idea, a table
maybe?" Same builder, same shell, missing the part that explains. This sharpens Nebula's
finding 2 (which graded the "Waiting for…" sentence's voice): the sentence doesn't matter
without a card wrapping it. Structure beats copy quality here.

**2. `send-calendar` has the card slot filled and still fails — jargon can occupy the right
structure and still lose. `[instrumented]`** Subhead: "**The forward window**" / "Each send
at the local wall clock the audit read it on." A stranger repeats back nothing — "forward
window" and "wall clock" are engineering vocabulary wearing the outcome-line costume, in the
identical slot where `rfm-map`'s subhead is instantly legible. The fix isn't "add a card,"
it's "add a card a non-expert can parse" — a copy pass, not a layout pass.

**3. `review-gallery` passes with no card and no data — the second live widget nobody
counted. `[instrumented]`** Desktop/Mobile toggle, a grey creative void, then **Approve /
Needs changes / Pending** plus a notes box. Stranger's line: *this is how you sign off on an
ad before it ships.* No subhead needed — the controls tell the story. Nebula and Iris both
frame the set as "22 dead, 1 broken" (esp-matrix). That undercounts: `review-gallery`'s
layout alone is a second working proof point. `esp-matrix.data`, by contrast, tells a clean
story for about four seconds — compares six ESPs, native/partial/gap — until the eye hits
the empty grid where vendor rows should be, and the story flips from "compares platforms" to
"broken" mid-glance. Same widget, two strangers' reports, four seconds apart.

## What changes after they use it (not "shows a matrix")

- **`rfm-map`**: you stop guessing which customers matter — you find out, by name-able
  group, which handful of buyers carries revenue the rest of the list doesn't.
- **`review-gallery`**: a creative gets a tracked yes/no/pending with a reason, instead of
  an approval buried three replies deep in Slack.
- **`ab-readout`**: a real answer on whether the subject line won, backed by an interval —
  not a gut call from whoever glanced at open rate first.
- **`esp-matrix`** (once it renders): you find out, cell by cell, whether the ESP you're
  about to sign can actually run your program — before the migration, not during it.

## The single thing I'd ship

Retrofit the outcome-subhead card onto the four widgets confirmed missing or misplacing it —
`cohort-retention`, `audit-report`, `lifecycle-flow` (title straight to grey box), and
`design-system` (the card text — "Brand tokens, read out of your own email" — is strong, but
renders BELOW the waiting sentence instead of above it, so the explanation arrives after the
confusion). Pair it with a one-line copy pass where the card exists but reads as jargon
(`send-calendar`'s "forward window"/"wall clock"). Cheaper than fixture-writing, ships
independently of it, and means every widget tells its story before any dummy data exists —
the gate this whole review is stuck behind.

## What I'd defer

Fixture population (Nebula/Iris's call — five vs. twenty-three is their fight, not mine).
The `esp-matrix` structural scroll fix (Sentinel's). A full jargon audit of the twelve
widgets I didn't open — more `send-calendar`-style misses plausibly live there, but I'd
rather report eleven honest observations than extrapolate to twenty-three.

## Question — asked aloud, to Nebula

`say.sh "Nebula, before you pick the five — the subhead card is the tell, not the copy
voice. Cohort-retention and audit-report have no card at all, review-gallery needs no card.
Should the missing-card four get retrofitted before fixtures, or after?" --agent atlas`

— Echo
