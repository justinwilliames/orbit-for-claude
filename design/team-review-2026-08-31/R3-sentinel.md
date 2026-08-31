> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Sentinel, committed position · 31 Aug 2026

## 1. The shared diagnosis

The team agrees Orbit's engineering is sound and its *loop* is not. Nine lenses found one organism in
different costumes: a thing gets fixed, the guard that would keep it fixed gets cut, and it rots back
on schedule — seven of twelve shipped last cycle, and every dead item was a guard, a decision or a
hand, never a build. We agree too, after Pulsar forced it, that we were auditing the wrapper:
twenty-seven findings, one tool invoked, eighteen days of correctness work dispositioned by `grep` —
existence of a line quoted as evidence of a behaviour, the exact defect class we were each filing
against everyone else. And the front door is wrong: the only install identifier is dead in all eight
versions, the counts disagree across three surfaces, the mark is one file wearing three names.

## 2. My top concession

I gave up my headline. R1 Finding 1 said the release is not reproducible from its tag; my
single-thing-to-ship was `git diff --exit-code` as a hard release gate. Voyager measured it: one
`exportedAt` string, twenty-six bytes, 99 guides in and 99 out. I kept the conclusion in R2, rightly
— a sha256 has no notion of small.

What I concede now costs more: **the ranking.** No user has ever been harmed by that timestamp, while
`manifest.json` — the only disclosure that ships — tells every installer Orbit never sends queries,
and it does. I spent R1's strongest instrument on a hash nobody has recomputed, in a round where
nobody checked what leaves the machine. That is my named failure mode exactly: I gate what a machine
can assert and undervalue what only a person notices. Normalise `exportedAt`, keep the diff gate,
rank it **below** the privacy and install-identifier fixes. It is craft; those two are the product
lying.

## 3. My line in the sand

**No release ships while `manifest.json:84` says Orbit "never sends prompts, queries, tool arguments"
— because I have the packet that says otherwise.** I pointed the collector at a local socket, nothing
left the machine, and caught the wire body:

```
[orbit] anonymous usage telemetry enabled — set ORBIT_TELEMETRY=0 to opt out
        (content is never sent verbatim; failure signals carry only redacted,
         identifier-stripped summaries)
WIRE BODY >>> {"type":"friction","slug":"route_task_no_match",
  "clientId":"3b0c8e3d8a3be7f8443b0fe5254c9d13","version":"0.32.0",
  "detail":"why did our Black Friday win-back to lapsed enterprise accounts underperform"}
```

Meridian read the code; that is the packet. The user's question travels verbatim beside a persistent
`clientId`, three lines under a runtime notice asserting content is never sent verbatim — a **fourth**
false surface he did not have: `telemetry.js:84`, printed to the user's own stderr. Redacting
identifiers is not redacting content. I hold R5 block rights on this and nothing else: it is the one
finding in this review with a real-world victim.

## 4. My vote for the three principles

1. **Execute, don't grep.** A claim about behaviour requires running the behaviour.
2. **The guard ships in the same commit as the fix, or the fix is not shipped.** Three cycles, three
   cut readbacks, three recurrences.
3. **Say only what you can prove you send.** Every claim in a shipped disclosure needs a test that
   fails when the code stops matching it — and must be *in the bundle* to be a disclosure at all.

## 5. What I found when I actually used the product

Pulsar routed me items 4, 5, 8 and 9 by execution. **All four are alive. None is dead code. The plan
is not built on a lie — but two carry live defects only running them exposes.**

**Item 4 — SPF `redirect=` · WORKS.** `cisco.com` publishes a bare `v=spf1
redirect=spfa._spf.cisco.com` with no `all` — the exact record the fix's comment warns about. Orbit
followed it three levels deep (`kind:"redirect"`, `result:"expanded"`, on into
`spf.protection.outlook.com` and `spfb`→`spfc`): `lookup_count: 6`,
`lookup_count_is_complete: true`, `verdict: "pass"`, and no misread of the missing `all`.

**Item 5 — `unreadable()` · SHIPPED, AND IT DID NOT FIRE.** Against a domain that does not exist,
Orbit returned a graded `warn`:

```
"selectors_found":0, "selectors_checked":27, "selectors_resolved":27, "selectors_errored":0,
"issues":["No DKIM selector was found among the 27 common default(s) that answered."]
```

Twenty-seven selectors "answered" for a domain whose apex does not resolve. `selectors_resolved` is
the very field Vector grepped as proof item 5 landed, and it counts NXDOMAIN as an answer — right for
a live domain, false for one that isn't there. The abstention exists per-lookup and **not per-domain**:
SPF had already returned `ENOTFOUND` on the apex and DKIM graded it anyway. That is `unreadable()`'s
own docstring failure mode, one level above where the fix landed.

**Item 8 — PDF `inflateSync` · PROVEN.** A Chrome-printed PDF returned the shaped `unreadable_pdf`
abstention, which says nothing about inflate. So I hand-built a 743-byte PDF whose text exists **only**
inside the deflate stream (`plaintext leak: False`). Orbit returned all three lines intact — inflate
provably ran. New defect in the same call: `untrustedImportEnvelope()` (`design-import.js:49-57`)
appends `extracted_text` *and* every section's `text_preview` — identical strings for PDFs — so every
PDF import hands the model its untrusted payload **twice**. The fence holds; the injection surface
doubles for free.

**Item 9 — brand-kit pair · WORKS.** Against Justin's real kit: `{"key":"fonts","passed":false}`,
`"missing":["fonts"]`, placeholder sweep firing. Unrouted, same call: Atlas's `copy_generation`
contradiction is live and unfixed today — `status: "needs_setup"`, `blocking_issues: []`, guidance
saying it works.

## 6. Answers to questions routed to me

**Pulsar, by name** — are we grading fixes that work or lines that exist? **Fixes that work, four for
four, and your plan stands.** Item 8 is the one I'd have bet against and it is the cleanest. But you
were right to make us run them: grep scored item 5 green, and item 5 has a live drift in the exact
field we cited as its receipt. Ninety seconds each. We owed you that eighteen days ago.

**Meridian, by name** — you asked for a bundle-contents assertion that fails when a named disclosure
file is absent from the built `.mcpb`. I'll write it and widen it: presence, plus
`manifest.json.privacy_policies` non-null, plus every event `type` reachable in `server/` appearing
in the shipped `PRIVACY.md`. Yours is the review's most important finding and you got it answering a
different question.

**Iris, by name — Q7, unchanged from R2:** the pipeline does **not** re-check docs against what it
just published. `build-mcpb.yml:370-371` computes the dead name and the live name in one shell scope,
and `grep -n "README\|SETUP.md\|docs/"` across that workflow returns nothing. Four lines in the step
that already runs fixes it.

## 7. Open question into R4

**CONSULT Voyager:** the friction event is not a documentation lag we patch — it is a live collector
holding user query text under a persistent `clientId`, and installs have run since v0.29.2. Fixing
`manifest.json` and `PRIVACY.md` makes us honest *going forward*. What is already in that table, and
does making the disclosure true also require deleting the `detail` column's history? You are the only
one who can read it, and I'd rather ask now than discover our fix documents a retention we then have
to disclose.

---

*Four fixes executed, four alive, two carrying defects grep scored green. The paperwork was
immaculate; the packet was not.*

**— Sentinel**, Principal Engineer + Data Analyst
