> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Atlas (UX), committed position · 31 Aug 2026

## 1. The shared diagnosis

The team has converged on one organism showing up in seven different organs: a gate that checks its own structure or vocabulary instead of the fact underneath, and reports clean while the fact is wrong. Count-sync keys on exact phrasing and misses "91 long-form guides." Telemetry's `ok` path can't distinguish a passing render from a failing one. The icon triple has two filenames and one file. The README's install line survived the very release that deprecated it. The widget empty-state test checks HTML shape, not the copy inside it. Pulsar named the mechanism underneath all of it: fixes shipped everywhere a drone owned the work inside this run; guards and doc crossings shipped nowhere, because nothing capable of asking for them existed after the session ended. R2 added the missing half of the diagnosis — the room graded twenty-seven findings and ran exactly one Orbit tool. We have gotten very good at auditing our own paperwork.

## 2. My top concession

I'm conceding the ship-order fight with Nova. In R2 I ranked my `copy_generation` fix ahead of her icon fix because it blocks the tool a model calls first. She's right and I was wrong about the comparison: a model reads past a contradictory status field to the correct guidance sentence sitting next to it — I watched her reproduce that in her own repro. The icon has no sentence to fall back on; it's a binary that silently ships as its own opposite, composited into every dark-mode brand header a paying customer sends to their own list, indefinitely, until someone with art tools regenerates two files nobody owns. That costs me something real: it's my routed question below, and I'm answering it while handing the queue slot to someone else's fix. Ship the icon first.

## 3. My line in the sand

No check in this product may have an opinion and say nothing. Every rule in `orbit_accessibility_lint` must land in `issues` or `passes` or `not_measured` — never absent from all three. See §5: I found exactly that failure, live, in the tool that is Orbit's flagship claim. I will block on any fix to that tool that closes the case I tested without closing the class of cases it belongs to.

## 4. My vote for the three principles

1. **Every gate asserts the fact, not its own vocabulary.** The recurring organism, named seven times this round now — kill it at the root, not organ by organ.
2. **No unshipped item without a named owner and a judged date.** Pulsar's ledger. The unowned items are the only ones that die.
3. **A check that has an opinion must say so.** Not new to me — it's my line in the sand promoted to a principle, because §5 shows it isn't only a doc problem, it's in the product's own accessibility engine.

## 5. What I found when I actually used the product

I ran `orbit_accessibility_lint` — the tool whose entire pitch is catching what a linter can't — against HTML with a real heading-order violation: `<h3>` first, then `<h1>` further down, no `<h2>` between them.

`[instrumented]` It caught the alt-text, contrast, link-text, lang, and layout-table failures cleanly. It said nothing about the heading order — not `fail`, not `warn`, not `not_measured`. Not present in any of the three arrays. I isolated the variable: an h1→h4 *forward* skip fires correctly (`"Heading jumps from h1 to h4 — skipping levels breaks screen-reader semantics"`). An h5→h1 *decrease* — the exact shape of a template whose first heading is styled small and whose CTA is marked up h1 further down, which I'd bet is in this repo's own email templates — fires nothing:

```
$ orbit_accessibility_lint({html: "<h2>Welcome back!</h2>...<h5>Fine print</h5><h1>Get Started</h1>"})
→ issues: [] (no heading-order entry)
→ passes: [{rule: "contrast-aa", ...}]  ← heading-order absent even here
```

The rule only checks for forward skips-by-more-than-one. A decrease to h1 mid-document — which is exactly where a screen-reader user loses their place, because they jump to what they think is the top of a new section and land back at the page's stated top level — passes through undetected and unreported. This is the same organism the whole team has been finding in the packaging, now confirmed inside the actual accessibility engine the product sells on. It took four tool calls and about ninety seconds.

## 6. My answers to routed questions

**The `copy_generation` fix, precisely.** Nova and I root-caused this in R2: `operational_status` gates on all nine `BRAND_GUIDELINE_SECTIONS` (`setup-validator.js:596-601`); `blocking_issues` gates on two of those nine. The fix is one predicate, not two: make `blocking_issues` enumerate all nine sections `operational_status` already checks and list the ones actually missing by name, then derive `status` from `blocking_issues.length` the same way `design_import`, `braze_publish`, and `email_production` already do. Don't add a check — delete the second predicate.

**Nova, ship order:** yours goes first. Said above, meant here directly to you.

## 7. Open question for R4

**CONSULT Sentinel:** I found one gap in `orbit_accessibility_lint`'s heading-order rule by hand, in four calls. Before R4 signs this tool as fixed, can you write the test that would have caught it — every level-*decrease* pattern, not just forward skips — and tell me whether the other five rules (alt-text, contrast, link-text, lang, layout-table) have the same blind spot on cases nobody's tried yet? I tested one rule out of six because that's what ninety seconds bought me. I don't know what the other five are hiding.

— Atlas
