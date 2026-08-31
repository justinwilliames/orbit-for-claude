---
name: lifecycle-performance-report
description: >
  Use this skill when someone wants a portfolio-level performance readout of their live
  lifecycle programs — not one campaign, the whole running programme. Trigger on "how are
  our lifecycle programs performing?", "build a lifecycle performance report", "portfolio
  engagement report", "is our lifecycle programme actually working?", "what impact is
  lifecycle having?", "end of sprint lifecycle review", "pre-board lifecycle readout", or
  any request to combine engagement metrics, revenue impact and qualitative customer
  feedback into a single report. Produces a three-verdict report that keeps engagement,
  provable impact and qualitative signal separate, because those three degrade
  independently and get conflated constantly. Do not use for single-campaign metrics (use
  braze-performance), for deliverability triage (use deliverability-management), or for a
  weekly ops digest.
---

# Lifecycle Performance Report

A portfolio readout of every **live** lifecycle program: what is actually sending, how it
engages, what impact can honestly be claimed, what customers said, and what to do next.

The whole point of the format is that it refuses to average three different things into one
"performance" number. A programme can have excellent engagement, unprovable impact and
worthless qualitative data simultaneously — that is the normal state of a young programme, and
a report that hides it reads as a success when it is a to-do list.

---

## The three-verdict spine

Open with exactly three verdicts, in this order. They are the report; everything after is
evidence. Tones are semantic, never decorative.

| Verdict | Question | `good` requires |
|---|---|---|
| **Engagement** | Are sends landing and being read? | delivery ≥ 95% **and** unsubscribe < 1% |
| **Impact** | What can we claim we *caused*? | a holdout that clears p<0.05. Attribution alone is **never** `good` |
| **Qualitative** | What did customers actually say? | a response set you have checked for contamination |

Mark Qualitative `critical` if the response set is contaminated or empty — however many rows
it holds. Row count is not evidence.

---

## Sections (fixed order)

1. **What is actually live.** The live-programme table with entry counts. Always state the gap
   between programmes *specified* and programmes *sending*. "26 designed, 5 live" is a
   materially different picture from "26 live", and only one of them is true.
2. **Portfolio engagement.** Stat row → per-programme table → a short prose block naming the
   engine, the drag, and the sequence decay.
3. **Impact: what can and cannot be claimed.** Attributed revenue → the holdout maths → an
   explicit list of which programmes have no usable holdout.
4. **Qualitative.** Whether the data can be trusted, *then* what it says.
5. **What to do.** Ranked by leverage, not by ease.

---

## The eight laws

**1. Rates are calculated on delivered, not sent.** Always, and say so in the caption. Sent-based
open rates flatter every number by the bounce rate and are not comparable to anyone's benchmark.

**2. Attributed is not incremental — put that in the report, not just in your head.** ESP revenue
figures are conversion-window attribution: every purchase inside the window by a recipient
counts, caused or not. Carry an explicit callout next to the revenue figure. Quoting attributed
revenue as programme-generated revenue is the most common way a lifecycle readout misleads its
own author.

**3. Report the holdout maths, not the holdout verdict.** Print control n, treatment n, both
rates, the test, the p-value — and when it fails, **the n that would have cleared it**. "Not
significant" is a dead end. "Five people short of significant" is next sprint's ticket.

**4. Machine opens get their own number.** Report the raw unique-open rate and the rate with
machine opens stripped; label the second the conservative floor. Never silently pick one. Apple
MPP and corporate scanners inflate opens differently per audience, so a single figure is a
guess dressed as a measurement.

**5. Small-n rows are labelled as anecdote in the caption.** A 12-send programme showing 83%
opens belongs in the table for completeness and must be named as not-measurement, or someone
will put it in a deck.

**6. Contamination is reported before content.** If the qualitative set is polluted, the
contamination *is* the finding. Show the signature before any sentiment split, and state plainly
which numbers must not be quoted.

**7. Every figure comes from a live tool call in the generating session.** No recall, no
estimate, no carry-forward from the last instance. The footer names the exact endpoints and the
pull date. If a source returned empty, say it returned empty.

**8. Name the window's limits.** Most ESP summary endpoints cap the queryable range (Braze's
Canvas summary caps at 14 days), so a portfolio figure is a slice, not a lifetime. Say which
programmes are too young to have sent their later steps — a five-day-old 56-day sequence is
being judged on its openers.

---

## Detecting contaminated feedback (do this before quoting any sentiment)

One-click in-email feedback ("was this useful? 👍 👎") is the standard way to gather lifecycle
qualitative, and it is **structurally defenceless against email security scanners**, which
pre-fetch every URL in a message. If the verdict is recorded on page load, the scanner votes.

Query the events behind the responses and look for these three signatures:

- **All verdict values fired by one recipient**, seconds or milliseconds apart. A human clicks
  one pill. Sub-second spreads across every option are definitive.
- **Impression-to-submission ratio far above 1**, e.g. hundreds of verdict events against tens of
  submitted forms.
- **Opposite verdicts from the same identifier** inside the same second.

Any of these means the verdict data is unusable — including rows that reached the submitted set.
Report the split as unquotable rather than discounting it.

**The fix to recommend:** record the verdict on an explicit second interaction (a confirm tap on
the landing page), or count only the submitted-response event rather than the impression event.
Retroactively, filter identifiers that fired two or more distinct verdict values within a few
seconds — that signature identifies the scanners in historical data.

Also check for **synthetic rows** — test data from the build phase that was never cleaned out.
Grep response text for test markers before counting anything.

---

## Building it

Ask for the live programme list first, then pull per-programme summaries with step-level
breakdown, then the qualitative source, then run the significance test. Useful sequencing:

1. List programmes → filter to those actually enabled and sending.
2. Pull detail per programme for status and launch date. These payloads are large — grep the
   saved response for the status fields rather than reading the whole thing into context.
3. Pull the data summary per live programme **with the step breakdown on**. Step-level sends,
   delivered, unique opens, unique clicks and unsubscribes are what the engagement table is
   built from; the roll-up alone cannot show sequence decay.
4. Pull the qualitative source and run the contamination checks above.
5. Compute significance on any holdout. Fisher's exact test, one-sided, is right for the small
   samples lifecycle holdouts usually produce — a chi-square will mislead you at these n.

Relevant Orbit tools: `orbit_braze_performance` (Braze time-series), `orbit_esp_read` (portable
normalized read for other ESPs), `orbit_read_braze_canvas`, `orbit_audit_attributed_revenue`,
`orbit_test_significance`, `orbit_sample_size`.

---

## Presenting it

Ship it as a self-contained HTML Artifact — a report with an audience is not delivered while it
lives in terminal scrollback. Structural notes that matter:

- **Block vocabulary that covers this format:** paragraph, sub-heading, stat row, table (with a
  caption and an optional total row), callout note (semantic tone), fixed-width evidence block,
  quote grid, ranked action list. Drive it from a config so a regeneration is a config edit, not
  a hand-edit of the built page.
- **Theme the page through tokens**, and define the palette three times: bare `:root` for light,
  `@media (prefers-color-scheme: dark)` guarded by `:root:not([data-theme="light"])`, and
  `:root[data-theme="dark"]`. A colour whose only definition sits inside a media query never
  applies in the default un-stamped state.
- **Inline the typeface as a data URI** rather than linking a font CDN. A silent fallback to a
  system grotesque undoes the brand work and is invisible in the source.
- **Do not set `font-variant-numeric: tabular-nums` on `body`.** Many grotesques include the
  comma and full stop in their tabular set with a full digit-width advance, so the feature
  renders prose as `1 , 770` and `live . Engagement`. Right-align the numeric columns instead;
  that already lines the digits up.
- **Tables past about nine columns overflow at desktop width.** Shorten the headers rather than
  widening the wrapper, and keep the table in an `overflow-x: auto` container regardless.

**Render and look before you publish.** Screenshot the built page full-height with headless
Chrome and read it, in both themes. Valid CSS and a clean build are not evidence that the page
is correct — every defect listed above passed structural checks and was only visible on screen.

```bash
chrome --headless --disable-gpu --hide-scrollbars \
  --window-size=1100,7200 --screenshot=full.png "file://$PWD/out.html"
```

For dark, stamp `data-theme="dark"` on `<html>` in a copy and shoot that — it also proves the
viewer's toggle beats the OS preference, which a browser force-dark flag does not test.

---

## What this skill is not

- Not single-campaign metrics — that is `braze-performance`.
- Not inbox-placement or reputation triage — that is `deliverability-management`.
- Not a recurring ops digest. This is the on-demand portfolio question: *is the programme
  working, and what can we honestly say about it?*
- Not the measurement framework itself — `lifecycle-reporting` decides what a programme should
  measure and builds the dashboard. This skill produces one dated readout from live data once
  those programmes are running. Reach for `lifecycle-reporting` when the answer is "we don't
  know what to track"; reach for this one when the answer is "we're tracking it, so what does
  it say?"
