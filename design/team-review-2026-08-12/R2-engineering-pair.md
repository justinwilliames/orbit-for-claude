> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing
> here is a statement by or about a real person.

# R2 — Engineering pair: Sentinel × Voyager

Cross-reference over every R1 file in this directory (`R1-atlas`, `R1-echo`,
`R1-iris`, `R1-nebula`, `R1-nova`, `R1-pulsar`, `R1-sentinel`,
`R1-sentinel-prior-1236`, `R1-voyager`), plus the 11 Aug
`FINAL-SHIPPING-DECISION.md` and the three scratchpad audits.

We read all nine, argued about four of them, and then went back out to the world
with instruments rather than re-reading source. Everything below is either a
**fight**, a **sharpening**, a **retraction**, or a **new finding**. Nothing
re-files a known id.

---

## Where we agree, briefly, so the fights are legible

**sentinel:** Nine lenses converged on one sentence and it is the right sentence
— *a checker that found nothing to check must not report a pass.* PDF import,
`<style>`-blind contrast, DKIM absence, the brand-kit `### Avoid` heading, the
`bootstrap_required` flag, the generated `gate.sh`. Six independent authors, six
locations, one law. That law is now well enough evidenced that it should be
written down in `server/status-vocabulary.js` next to `FAILED_STATUSES` rather
than rediscovered every cycle.

**voyager:** And I agree with Pulsar's ordering, which is the only R1 file that
ends in a sequence rather than a list. My only amendment to it is below, and it
is a big one: step 1 is not the highest-leverage thing on his list. Step 4 is.

---

## FIGHT 1 — Sentinel was wrong to leave the SPF nested-lookup undercount out of his list, and the reason is one line of source

**voyager:** `R1-sentinel.md` §3 closes with a paragraph declining to file
`countSpfLookups`' failure to recurse:

> *"It is a latent undercount on a genuinely nested sender, not a demonstrable
> failure today, so it stays in this paragraph rather than in the list."*

That grading rests on the premise that the number is decorative. It is not.
`server/email-auth.js:78`:

```js
const lookupCount = countSpfLookups(record);
if (lookupCount > 10) {
  issues.push(`SPF record uses ${lookupCount} DNS lookups (RFC 7208 limit: 10). Mail will be treated as permerror.`);
}
```

and `:93`, where the verdict is computed:

```js
issues.some((i) => /limit|multiple|\+all/.test(i)) ? "fail" : "warn"
```

`lookup_count` is the sole input to a `fail` verdict whose message is *"Mail
will be treated as permerror."* An undercount is therefore not a wrong display
figure — it is the one thing standing between a permerroring domain and a `pass`.
Sentinel searched five domains and stopped; I searched fourteen and found
zendesk.com at 1-vs-6. Neither of us crossed ten, which is why he graded it down.
But the correct grade of a check does not come from whether today's sample
tripped it.

**sentinel:** Conceded, and I will say it plainly rather than hedge it:
**I retract the paragraph.** I looked at the function and not at its consumer,
which is the exact wrong-layer mistake I file other people for. Voyager's
`spf-nested-lookup-undercount` is correctly graded high and my §3 should have
carried it as a second finding rather than a footnote.

---

## FIGHT 2 — and then we both under-graded it, because we each held half the record

**sentinel:** Neither of us noticed that our two SPF findings are the *same
record shape*. `redirect=` is precisely the token that hides an entire policy
behind one lookup, so the record where my false-`all` warn fires is definitionally
the record where Voyager's undercount is worst. Instrumented, live, one query:

```
$ node <probe: checkEmailAuth + a recursive RFC 7208 evaluator>

=== hubspot.com
  record        : v=spf1 redirect=_hspf.hubspot.com
  orbit count   : 1  REAL RFC7208: 4
  orbit verdict : warn | overall: warn
  orbit issues  : ["Record has no explicit \"all\" qualifier at the end."]
  orbit rec     : Tighten to "-all" or "~all" and reduce include:/redirect= chains under 10 lookups.

=== microsoft.com
  orbit count   : 5  REAL RFC7208: 7   verdict: pass
=== salesforce.com
  orbit count   : 3  REAL RFC7208: 4   verdict: pass
```

One call. Two false facts about the same fourteen-character record, and a
recommendation that, if followed, kills the redirect and unauthorises every
server in the chain. `redirect=` is the canonical form for HubSpot-hosted
sending domains and Microsoft 365 tenants — i.e. the two most likely domains a
marketer types into a free SPF checker first.

**voyager:** Which is why I would not ship these as two tickets. They are one
patch to one function with one fixture set, and the fixture that matters is
`v=spf1 redirect=<host>` — a record on which today's code is wrong twice and
harmful once. Filed below as `spf-redirect-record-wrong-twice`.

---

## FIGHT 3 — Voyager's own headline number does not survive Sentinel's lens, and what replaced it is better

**sentinel:** `R1-voyager.md` §4 reads 41 downloads across the free builds and
calls it *"the only quantitative answer anyone in this review has produced to
'has a stranger touched this'"*, then notes it disagrees with the brief's 2
unique repo visitors and says *"the two instruments disagree, which is worth
someone's attention."* They do not disagree. They measure different channels,
and the repo is not one of the channels. I went to check whether CI was inflating
the counter, found the release pipeline hashes local bytes and never re-fetches
its own asset, and then found the actual discriminator by accident.

**voyager:** I will take that correction, because the thing he found is worth
more than the number I filed. It is below as `registry-is-the-only-download-channel`
and it is the single most decision-relevant fact this round has produced. I
retract the "two instruments disagree" reading in §4. The finding — that
`download_count` is an unsnapshotted gauge — stands unchanged and gets *more*
important, not less, because it turns out to be measuring something real.

---

## FIGHT 4 — Nova's fix, as written, disables the modal on every page

**sentinel:** `R1-nova.md` §1 (`homepage-modal-still-fires-at-2500ms-no-home-exclusion`)
is a correct finding with a footgun in its remedy. The proposed fix is *"add `/`
to a homepage-specific gate."* The gate is:

```ts
// get-orbit/components/email-capture-modal.tsx:33,70
const EXCLUDED_PREFIXES = ["/admin", "/login", "/api", "/apps/slop-detector/editor"];
if (EXCLUDED_PREFIXES.some((p) => pathname.startsWith(p))) return;
```

`"/".startsWith` — every path on the site starts with `/`. Adding `"/"` to that
array does not exclude the homepage; it silently retires the entire email-capture
funnel sitewide, and it does so with a green build and no test. That is the
round's own hunted shape, sitting inside a proposed fix rather than in shipped
code.

**voyager:** No disagreement, and this is why a design finding should carry its
remedy to an engineer before it carries it to a ticket. Not a new finding —
a one-line amendment to a filed one: the exclusion must be an exact-match check
(`pathname === "/"`), not a prefix. Recorded here so whoever picks it up does not
ship it as written.

---

## THE FINDING THAT NEEDS BOTH LENSES

Neither of us gets here alone, and no other lens can get here at all.

**sentinel:** Across the nine R1 files, the defects that matter share a return
value. `orbit_import_design` on an unreadable PDF: `status: "ok"`.
`orbit_dark_mode_check` on a 1.09:1 body copy: `status: "ok"`, `verdict: "pass"`.
`orbit_check_email_auth` on a correct HubSpot record: `status: "ok"`,
`verdict: "warn"`. `checkBimi` on a dead resolver: `status: "ok"`,
`verdict: "fail"`. `orbit_validate_brand_kit` over a nine-`TBD` kit:
`status: "ok"`, `operational_status: "full"`. Every one of them, `ok`.

**voyager:** And `status` is the only field telemetry classifies.
`server/index.js:6568` fires `trackToolCall` unconditionally, then:

```js
if (shapedFailure) {   // shapedFailure = first status in FAILED_STATUSES
  trackToolError({ slug: toolName, errorClass: shapedFailure, ... });
}
```

The comment above the wrapper states the contract in its own words: *"tool_call
minus tool_error is the success rate."* It is not a success rate. It is an
**availability** rate wearing a correctness label — it measures whether a handler
returned a shape, which is the one thing that was never in doubt. `verdict` is
never sampled. Not one of the defects in this review's 123-finding history would
appear as anything other than a clean call.

**sentinel:** The consequence is specific and it lands on this round, not on
some future one. Four of the fixes queued for the keyless surface — SPF recursion,
SPF redirect, DKIM abstention, BIMI abstention — change the *verdict* and leave
`status: "ok"` exactly where it was. Ship all four and every instrument Orbit
owns reports the identical number before and after. There is no way to learn
whether they helped, and no way to learn if a regression puts them back.

**voyager:** This is my pet complaint in its most expensive form: telemetry that
records actions and not outcomes. And the fix is small, because the vocabulary
already exists and is already closed. `verdict` across the grading tools takes
five values (`pass`/`warn`/`fail`/`unknown`/`insufficient_input`);
`operational_status` takes three. Sending the coarse verdict alongside `slug` on
the ok path carries no user content, no arguments, no prompt — it is strictly
less identifying than `errorClass`, which is already sent — and it turns the
funnel from *"which tools were called"* into *"what did they conclude."* On the
current code it would surface the SPF warn-storm as a distribution anomaly within
a day of the first real user: `orbit_check_email_auth` returning `warn` on the
majority of well-configured domains is visible in one `GROUP BY`.

Filed as `telemetry-blind-to-wrong-answers`. High. It is the only finding here
that changes whether the *other* findings can ever be known to be fixed.

---

## NEW — the registry is the only channel that has ever produced a download

**voyager:** Fourteen releases, one discriminator, and it is not time-on-shelf.

```
$ curl -s '.../v0/servers/io.github.justinwilliames%2Forbit-for-claude/versions'
0.27.7 deprecated
0.27.6 deprecated
$ curl -s '.../v0/servers/io.github.justinwilliames%2Fbraze-lifecycle-mcp/versions'
0.29.1 active latest=true · 0.29.0 · 0.28.5 · 0.28.4 · 0.28.3   (all active)
```

Those seven versions are every version that has ever existed in the MCP registry
under either name. Now the counter, read fresh:

```
$ gh api repos/justinwilliames/orbit-for-claude/releases --paginate \
    -q '.[] | "\(.tag_name)\t\(.published_at[0:16])\t\(.assets[0].download_count)"'

  IN THE REGISTRY                      NEVER IN THE REGISTRY
  v0.27.6  2026-07-08   10             v0.27.4  2026-07-07    0
  v0.27.7  2026-07-09   73             v0.27.8  2026-07-10    0
  v0.28.3  2026-08-12    7             v0.28.0  2026-08-11    2
  v0.28.4  2026-08-12    5             v0.28.1  2026-08-12    1
  v0.28.5  2026-08-12   10             v0.28.2  2026-08-12    0
  v0.29.0  2026-08-12   13             v0.25.0  2026-06-18    0
  v0.29.1  2026-08-13    5             v0.24.1  2026-06-16    0
  ───────────────────────────          ───────────────────────────
  total                123             total                  3
```

Every release the registry carried has downloads. Every release it did not carry
has essentially none. The correlation is clean across fourteen releases and
three months, and the clinching pair is adjacent: **v0.27.7 was published 9 July
and entered the registry — 73 downloads. v0.27.8 was published 10 July, was the
newest release for the following month, sat at the top of the `/releases` index
that every website CTA points at, and was never registry-published — zero.**

The honest reading: the website, the README, the guides, the courses, the
changelog, the Atom feed and every share link have between them produced roughly
**three** downloads in the product's lifetime. The registry produced 123.

**sentinel:** Which reorders Pulsar's sequence. His step 1 is
`gh repo edit --description` on a repo with 2 visitors in 14 days; his step 4 is
the version bump that gets nine commits into the registry. On this evidence step 4
is worth two orders of magnitude more than step 1, and
`merge-at-published-version-ships-nothing` is not a hygiene finding — it is the
only finding on any list that touches the only channel that works.

**voyager:** And it re-grades two known ids upward without re-filing them.
`deprecated-entry-owns-the-brand-name` and `paid-v0277-still-live-under-orbit-search`
are not "a stale pointer" and "a live-harm item." They are **59% of every
download Orbit has ever received** (73 of 123) arriving through an entry that
serves a licence-gated build. That is not a leak in the funnel. On the numbers,
it is still the funnel.

Two caveats, stated rather than buried. (i) Exposure windows differ — the 0.28.x
releases superseded each other in minutes, so their individual counts are not
comparable to each other. The v0.27.7/v0.27.8 pair is the clean natural
experiment and it does not depend on the rest. (ii) `download_count` has no
source dimension, so I cannot prove the registry *referred* these; I can only
show registry membership predicts them and nothing else does. Some of the 40
across 0.28.3–0.29.1 is this review team's own probes, mine included.

**sentinel:** I tried to close (ii) properly and could not, and I would rather
say so than imply I did. I downloaded v0.28.2 (count 0) three times anonymously
over a controlled baseline and re-read the counter for twenty minutes:

```
baseline v0.28.2 = 0
dl1 http=200 bytes=37280338 · dl2 http=200 · dl3 http=200
+20 min: v0.28.2 = 0
```

GitHub's counter is lagged well past a session window, so the experiment is
inconclusive *within this round* and is worth re-reading tomorrow. It does not
affect the finding, which rests on membership, not on my curls.

---

## NEW — `checkBimi` manufactures "your DMARC policy is missing" out of a DNS timeout

**sentinel:** Third instance of the swallow shape, and distinct from
`dkim-error-swallow-asserts-absence` in the way that matters: there the
information genuinely does not exist. Here it exists, one function call away, and
is thrown on the floor.

`server/email-auth.js:311`:

```js
const dmarc = await resolveDmarc(root);
const policy = (dmarc.tags?.p ?? "").toLowerCase();
if (policy !== "quarantine" && policy !== "reject") {
  issues.push(`BIMI requires DMARC p=quarantine or p=reject. Current DMARC policy: p=${policy || "missing"}.`);
}
```

`resolveDmarc` is honest — on a resolver failure it returns
`{ verdict: "fail", issues: ["DMARC lookup failed: ETIMEOUT"], ... }` and no
`tags`. `checkBimi` reads only `.tags?.p`, gets `undefined`, and prints a fact.
Instrumented, with a stub that answers the BIMI selector correctly and hangs on
`_dmarc` — the behaviour of a corporate resolver or an authoritative NS under
rate-limit:

```
$ node <probe: dns.resolveTxt stubbed, _bimi answers, _dmarc times out>
{
  "status": "ok",
  "verdict": "fail",
  "record": "v=BIMI1; l=https://example.com/logo.svg; a=https://example.com/vmc.pem",
  "dmarc_policy": null,
  "issues": [ "BIMI requires DMARC p=quarantine or p=reject. Current DMARC policy: p=missing." ],
  "recommendation": "Fix the listed issues and re-run. VMC is required for Gmail + Yahoo's..."
}
```

A perfectly configured BIMI record with a VMC, graded `fail`, on the grounds of a
DMARC policy the tool never read. The user is told to go and change enforcement
policy on a domain whose enforcement policy may already be `p=reject`.

For the record, the sibling path is fine — when the BIMI lookup *itself* errors
the tool says `"BIMI lookup failed: ETIMEOUT"` / `"Verify DNS is reachable."`,
which is honest (though it still grades `fail` where it should abstain). The
defect is exactly the one branch where the error came back from a helper instead
of from the caller's own `try`.

**voyager:** And this is why I want the abstention encoded once rather than
patched three times. `status-vocabulary.js:136` already carries the doctrine in
prose. It needs a function — `unreadable(reason)` — that every DNS-backed check
returns, so the next one written inherits it. Four call sites today: DKIM, BIMI's
DMARC read, BIMI's own lookup, and SPF's nested resolve when the fix lands.

**sentinel:** Coverage, stated once because it governs all four:

```
$ grep -rln "email-auth\|checkEmailAuth\|countSpfLookups\|resolveDkim\|checkBimi" tests/
(none)
```

422 lines of keyless, stranger-facing, advice-giving code with zero test
references in a 740-test suite. Voyager filed that as an aside under his §2; it
deserves to be the headline of the patch. Any fix to this module that does not
arrive with the module's first test is a fix nobody can defend in six months.

---

## Retractions and sharpenings, collected

| id | who | disposition |
|---|---|---|
| `spf-nested-lookup-undercount` | sentinel retracts his own non-filing | Verdict-changing at `email-auth.js:78`, not decorative. Voyager's high grade is correct. |
| `release-download-count-unsnapshotted` | voyager retracts the reading | "Two instruments disagree" is withdrawn — repo visits and registry downloads are different channels. The retention finding stands and gets more important. |
| `homepage-modal-still-fires-at-2500ms-no-home-exclusion` | pair amends the remedy | `"/"` in a `startsWith` allowlist kills the modal sitewide. Use `pathname === "/"`. |
| `deprecated-entry-owns-the-brand-name` | pair re-grades upward | 73 of Orbit's 123 lifetime downloads came through that entry. |
| `merge-at-published-version-ships-nothing` | pair re-grades upward | It gates the only channel that has ever produced a download. Pulsar's step 4 should be step 1. |
| `biome-wasm-dead-weight-in-bundle` | noted, not re-filed | Filed twice: `R1-sentinel-prior-1236.md` §7 (12 Aug) and `R1-voyager.md` §5 (13 Aug), both as new. Symptom of `review-outputs-gitignored-and-overwritten`. |

---

## Will this still be debuggable in six months?

**sentinel:** The nine R1 files have found the same bug nineteen times in six
locations, and every single instance was caught from outside — a curl, a stubbed
resolver, an unzip, a real PDF. Not one was caught by the suite, and the suite is
now 740 green. That ratio is the finding under the findings.

**voyager:** And the reason it will keep happening is upstream of the code:
nothing Orbit records can tell a right answer from a wrong one. Fix the SPF
recursion and the BIMI abstention and the PDF inflate, and the metrics move by
zero. Add the verdict dimension and they move by everything. That is the order I
would work in, and it is the one item on this page that pays for the other nine.

*— Sentinel & Voyager, 13 Aug 2026*
