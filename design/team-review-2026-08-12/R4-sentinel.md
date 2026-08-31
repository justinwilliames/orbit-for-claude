> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R4 — Sentinel

Baseline, because a review that doesn't run the thing is a review of a summary.
`npm test` on `team-review-round-2` @ `57cfb1a`:

```
ℹ tests 687
ℹ suites 109
ℹ pass 687
ℹ fail 0
  796 passed · 0 failed · 796 total
```

Green. Two of my four R3 findings were fixed in the intervening six hours and I
re-ran both against the outside world rather than reading the diff:

- **Re-release guard** (`7e52cdb`) — `tests/suites/40-release-guard.test.mjs`
  lifts the step's `run:` body straight out of `build-mcpb.yml` and executes it
  against a local registry it controls, with a deliberately crude extractor that
  asserts loudly if the step is renamed. That is the correct shape and I want it
  on the record: it is the first test in this repo that runs a workflow step
  rather than describing one.
- **ESP routing** (`3ac6b28`) — verified live through a spawned server, not from
  the manifest:

```
"How do I write a Klaviyo template tag for a product block?"
  -> klaviyo-documentation-expert   platform=klaviyo   platform_source=request
"Set up a Mailchimp welcome automation for my newsletter"
  -> mailchimp-documentation-expert platform=mailchimp platform_source=request
"customer.io broadcast segmentation help"
  -> customerio-documentation-expert platform=customerio platform_source=request
"Build an Iterable journey for post-purchase"
  -> lifecycle-design               platform=iterable  platform_source=request
```

All four now detect the platform from the request. The R3 finding is closed.

And that closure is exactly where the new one starts.

---

## 1. `orbit_liquid_state_matrix` is blind to three of the six ESP dialects Orbit ships adapters for — and says so as a fact about your template

`3ac6b28` taught the *router* that six ESPs exist. The module that does the
actual Liquid work still knows two.

`server/liquid-resolve.js:373` `personalisationTokens()` recognises exactly
four token shapes — `${x}`, `custom_attribute.${x}`, `campaign.${x}` (Braze) and
`person|event|organization.x` (Klaviyo). `discoverAxes()`
(`liquid-state-matrix.js:394`) opens with `const tokens =
personalisationTokens(html); if (tokens.length === 0) return [];`. A bare Liquid
variable — Iterable's `{{firstName}}` / `{% if hasOrder %}`, Customer.io's
`{{customer.x}}`, plain Shopify-flavoured Liquid — is not a token, so it can
never be an axis.

Same template, five times, changing only the token spelling. `{% if … %}` /
`{% else %}` throughout, with the same CTA label ("Track it") on both arms — a
real, plantable defect:

```
braze  ${has_order}              status=ok verdict=fail        axes=1 states=2 files=2 findings=2
klaviyo person.has_order         status=ok verdict=fail        axes=1 states=2 files=2 findings=2
iterable bare firstName          status=ok verdict=no_branches axes=0 states=- files=0 findings=-
customerio customer.has_order    status=ok verdict=no_branches axes=0 states=- files=0 findings=-
shopify plain has_order          status=ok verdict=no_branches axes=0 states=- files=0 findings=-
```

The message the last three get:

> "No personalisation binding drives a conditional in this template, so there is
> exactly one state and nothing to enumerate. **That is a fact about the
> template, not a pass** — if you expected branches, check that you passed the
> COMPILED html with Liquid intact rather than a resolved render."

It is not a fact about the template. The template has three `{% if %}` tags and
an `{% else %}`. The sentence was written to stop this reading as a clean bill of
health and it does the opposite — it asserts the negative *and* pre-blames the
user for the discrepancy. I passed the compiled HTML with Liquid intact. It is
still wrong.

**The documented escape hatch is unreachable.** `max_axes`' own description tells
the over-cap user to "pin the axes you care about", and `variables_json` is the
mechanism. It cannot fire here, because `discoverAxes` returns on
`tokens.length === 0` *before* it reads `variables`:

```
orbit_liquid_state_matrix(html=<iterable template>,
                          variables_json={"hasOrder":["true","false"]})
-> { "status":"ok", "verdict":"no_branches", "axes":[] }
```

There is no argument a Customer.io or Iterable user can pass that makes this tool
work.

**Why it matters more than it looks.** This is the tool the *generated brain
gate* names, in the header of the one file Orbit hands a stranger. I generated a
brain for a Klaviyo shop and read what it printed into `build/gate.sh`:

```
# This script has no templating engine of its own and will happily pass a
# document whose branches were never varied.
#
# Orbit's `orbit_liquid_state_matrix` does that resolution. … pass
# `write_states_to` to get the branch files this gate needs, then loop:
#   orbit_liquid_state_matrix(html=<compiled>, write_states_to="build/states")
#   for f in build/states/state-*.html; do build/gate.sh "$f" || exit 1; done
```

That header is ESP-independent — every brain gets it. For half the ESPs Orbit
ships adapters for, `write_states_to` writes zero files (verified: `files=0`,
`output_files` absent from the response entirely), the glob matches nothing, and
the user's conclusion is the one the tool handed them: one state, nothing to
enumerate, gate the single document. The exact hole the gate header exists to
warn about, closed by a tool that reports it closed.

`self_test:true` on the same template *does* notice — `control_verdict:
"no_branches"`, `"1 case(s) BROKEN"`. The instrument that checks the instrument
fires. Nothing on the normal path reads it.

**No test covers it.** `tests/suites/38-liquid-matrix-client-sim.test.mjs`
contains no `customer.`, no `iterable`, no bare-variable case. 796 tests and not
one feeds this layer a dialect other than Braze's or Klaviyo's.

The joke writes itself and I'll take it: `discoverAxes`' own docstring opens
*"Derive the axis set FROM THE TEMPLATE, never from a fixed list. A fixed list is
a list somebody has to remember to extend, and the one this technique came from
skipped five of eight sends in a programme … while printing PASS the whole
time."* The fixed list is one function call away, in the first line of its body.

**Fix, in order of honesty:**

1. **Minimum, ships today.** In `liquidStateMatrix`, when `discoverAxes` returns
   `[]` *and* the template contains `{%\s*(if|unless)\b`, do not return
   `no_branches`. Abstain: `verdict: "unknown_dialect"`, naming the four shapes
   it recognises and the conditions it can see but cannot bind. Orbit already has
   the abstention precedent (`too_many_axes`, `insufficient_input`). `no_branches`
   must be reserved for a template with no conditionals at all.
2. **Make `variables_json` real.** Move the `tokens.length === 0` bail below the
   `variables` merge so an explicitly pinned axis works regardless of dialect.
   That alone unblocks every ESP without guessing.
3. **Extend the dialect table** in `personalisationTokens`: `customer.\w+`
   (Customer.io), and — inside `{% %}` conditions only, where the risk of
   false-positives is bounded — any identifier read by an `if`/`unless`/`elsif`
   that is not a Liquid keyword or literal. That covers Iterable and plain Liquid.
4. **Parameterise the suite over all six ESPs**, the way `39-skill-routing` now
   is. The known-bad fixture must be a real branching template with a plantable
   defect, not a token-free control.

Owner: Sentinel or Voyager. ~2h including the fixture matrix.

---

## 2. `orbit_parse_postmaster_signal` answers "all green" over a CSV whose columns it never matched

`server/postmaster-parse.js`. The overall verdict is
`worstSeverity(findings)`, and `worstSeverity([])` returns `"pass"` (line 254).
`findings` only gains entries when a metric was *parsed*. So zero parsed metrics
is a pass.

```
csv: "hello,world\n1,2\n"
-> { "status":"ok", "overall_verdict":"pass", "finding_count":0,
     "message":"0 signal(s) checked — all green.",
     "parsed_snapshot":{ spam_rate_pct:null, domain_reputation:null,
                         ip_reputation:null, authenticated_traffic_pct:null,
                         delivery_errors_pct:null, feedback_loop_pct:null } }
```

Same result for `snapshot_json:"{}"` and for `snapshot_json:
'{"bounce_rate":9.9,"foo":"bar"}'` — a snapshot of real numbers under keys the
tool doesn't know.

"0 signal(s) checked — all green" is a sentence that contradicts itself in eight
words, and `overall_verdict: "pass"` is the field a model reads and relays. The
user asked *is my deliverability healthy*, and Orbit said yes, over data it never
read.

**The realistic trigger is not junk.** `parseCsvSnapshot`
(`postmaster-parse.js:215`) does `header.findIndex(h => h.includes(name))`
against a hardcoded set of substrings, and the only structural check is
`lines.length < 2`. A Postmaster export with renamed, localised, or reordered
columns — Google has changed these labels, and the UI localises them — parses to
all-nulls and reports green. There is no assertion anywhere that even one column
matched.

The author *did* think about degenerate input, one level up: a header-only CSV
correctly returns `status:"error", "CSV needs at least a header row and one data
row."` The row check exists; the column check does not.

**The discriminator exists and nothing uses it.** A genuinely healthy snapshot
and a junk CSV are distinguishable in the payload and identical in the verdict:

```
HEALTHY  -> {"v":"pass","n":2,"msg":"2 signal(s) checked — all green."}
JUNK CSV -> {"v":"pass","n":0,"msg":"0 signal(s) checked — all green."}
```

`finding_count` moves. `overall_verdict` does not, and the word "green" does not.
Note also that `n` is the count of *findings*, not of signals checked — the
message mislabels it in both rows. The one number that could separate "we read
six metrics and they are fine" from "we read nothing" is printed under the wrong
name.

**Fix.** Two lines and a sentence:

- `parseCsvSnapshot` returns `{ error: "None of the expected Postmaster columns
  were found in the header: <header row>. Expected one of spam rate / domain
  reputation / IP reputation / authenticated traffic / delivery errors." }` when
  every `cell()` lookup misses.
- In `parsePostmasterSignal`, before computing the verdict: if every field of
  `data` is null, return `status: "insufficient_input"` — the render gate's
  existing abstention vocabulary — not `ok`/`pass`.
- `summarise()` takes the count of metrics *present in `data`*, not
  `findings.length`, so "N signal(s) checked" is true.

Owner: Voyager (this is the deliverability surface). 45 min with a fixture pair:
a real export that passes, and a header-mismatched export that must abstain.

This is the same disease as `has-html-structure-cannot-fail` and
`presend-verdicts-pass-a-non-email`, which Pulsar deferred behind the gate family
with the note *"apply the render gate's existing abstention precedent when they
come up"*. It has come up, in the one place where a wrong green costs a domain
reputation rather than a re-render.

---

## What I looked at and cleared

Recorded so the next round doesn't re-spend the lens.

- **Generated `build/gate.sh`, run on a real 47 KB production email** (Sophiie's
  PMF survey send, compiled): `byte-clip PASS 47343/104448 · overflow PASS ·
  orphan-link PASS · CTA-parity PASS`, exit 0. The overflow check now measures
  against the declared 600px container and no longer warns on every correct
  email; the basename-only master exemption is in place with the "mastercard"
  case named in a comment. R4's item-2 fixes landed and they landed correctly.
- **`orbit_check_setup` on a virgin `HOME`** → `status: "ready"`. The free-path
  claim now survives turn one.
- **Flagship chain, end to end, as a stranger** — `bootstrap_brain` (14 files) →
  `learn_email_template` on a real 47 KB email (6 modules, brand tokens, source
  mirrored) → `generate_brain_gate` (`orbit-gate-generation: 2` marker present,
  `skipped/upgraded/unchanged/hand_edited` all reported). No `ok`-over-nothing on
  this path any more.
- **`write_states_to`** on a Braze-dialect template writes real, *distinct*
  documents — two states, two files, two different hashes. The R3 finding is
  properly closed for the dialects it can see.
- **Version drift**: `manifest.json`, `package.json` and `server.json` all read
  `0.29.1`; the workflow's `VERSION` and `build-server-json.mjs` both source from
  `manifest.json`, and the committed `server.json` carrying a `v0.28.0`
  identifier with an empty `fileSha256` is a documented template, refused for
  publication by the bundled-version check. Not a finding.
- **Content gate** (`server/content-gate.js`, new this cycle): runs on every
  response via `makeJsonToolResponse`. I ran it over Orbit's own 79 skill
  descriptions — `fields_gated 20, min_score 93, worst_tier sharp`, ~18% payload
  overhead. The `fields_skipped` / `skipped_fields` coverage sentence does what
  it was written to do. Nothing to file.
- **Calculators, adversarial**: `orbit_parse_test_readout` returns `status:error`
  on both 0/0 and a 0%→100% degenerate split rather than a fabricated interval;
  `orbit_list_growth_forecast` handles churn=0 and churn=100 without dividing by
  zero. Clean.
- `path-safety.js` still has no direct test and still does not `realpath`.
  Unchanged from R3, still not worth filing while the MCPB runs locally.

## What I did not find

- **No new release-pipeline defect.** The website-dispatch step (`57cfb1a`) was
  the last `|| echo` in the file and it is gone; both branches now emit
  `::warning::` annotations and the curl captures its status code. The comment
  block above it names the exact evidence and date. This pipeline is now the
  best-documented thing in the repository.
- **No security defect, no credential residue.** Swept again. Nothing to report
  is the correct report.
- **Nobody has still watched a widget render in a live Claude Desktop host.**
  Third cycle. Not my finding to make — it is Q1, it needs a human, and it stays
  the largest unverified claim in the release.

Both findings above are the round's hunted shape and both are the *same instance*
of it: a fixed list that somebody extended in one place. `3ac6b28` taught the
router six ESPs and left the Liquid layer at two. `postmaster-parse.js` checks
that the CSV has rows and never checks that it has columns. Neither was caught by
796 tests, and both were caught in under a minute by asking the tool a question
whose right answer I already knew.
