> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R5 — Nebula, sign-off · 31 Aug 2026

Re-review against an unchanged artefact. Nothing outside `design/team-review-2026-08-31/` moved, so I expected all three to survive, and I ran them anyway rather than assert it.

## Disposition of my R1 findings

### 1. The drift gate reports "in sync" while the README is wrong — **still present**

`[instrumented]`, re-measured just now.

```
R1:  $ node scripts/sync-counts.mjs
     Inventory already in sync everywhere ("83 skills and 135 tools", "99 long-form practitioner guides").
R5:  $ node scripts/sync-counts.mjs
     Inventory already in sync everywhere ("83 skills and 135 tools", "99 long-form practitioner guides").
```

Byte-identical, and still a lie by omission. `README.md:23` and `README.md:59` say **91 long-form guides** against 99 counted in `data/guides-export.json`; `docs/INTEGRATION-STANDARD.md:45` says **91** and is still absent from `TARGETS`, which remains four files (`sync-counts.mjs:94`). `CLAUDE.md:8` still says **62 skills** against 83 `skills/*.md`, and `:9` **80+ tools** against 135. The gate keys on the noun phrase *practitioner guides*; nobody writing well uses it, so nobody is caught. Eight guides understated, 34% understated in the file every contributor reads first.

R4 dispositions this as the count spine and demotes it to one spec line. Right call — a number stated on seven surfaces is the defect, not the gate around it. I have no complaint about the ranking; I record that it is unshipped and dated nowhere.

### 2. Six skills are manpages in a protocol's costume — **still present**

`[judgement]`, re-run. Same six, `### Parameters` present in each, all under 600 words (`wc -w`): `braze-segment-analysis` 196, `braze-data-validation` 212, `braze-test-users` 213, `braze-content-block-audit` 231, `braze-deliverability` 394, `braze-performance` 506. (R1 quoted 179/146/320/426/132/159 — a body-only count; same six files, same verdict, different ruler. Recording the discrepancy because it is mine.) The README still sells all 83 as protocols carrying what a browser reveals. Six carry a parameter list. Not in R4 anywhere, and I am not asking for it — six of eighty-three is a seam, not a fire.

### 3. The best brand move is buried at line 21 — **I was wrong**

Conceded at R3 and I do not reopen it. Iris had the only evidence in the room; my own instrument failed the same round (§below), so taste was all I brought. `README.md:8` still opens on the employer credits and `:21` still carries the self-indicting contrast ratio. Unmoved, and correctly not in the seven.

## My R3 line in the sand — re-measured

`[instrumented]` The claim is live in the shipped tool description, verbatim, today:

```
server/index.js:4405 → "…for grammar, content-emptiness, spam signals, length…"
grep -n "analyseSlop\|slop-detector" server/calculators.js → 0 matches
```

And the swap test, through the live tool, R3 next to R5:

```
                                                              R3        R5
"Our own brand indigo just failed our accessibility gate"   → 96 sharp  96 sharp
"Unlock powerful new features to grow your business today"  → 96 sharp  96 sharp
"Leverage synergies across your customer journey lifecycle" → 96 sharp  96 sharp
```

Identical score, identical tier, one identical issue each — *Borderline long for mobile*. Orbit's flagship creative gate still cannot tell the one line nobody else could write from two a slop machine produces on request, while its description sells content-emptiness.

**Is queueing enough?** Wiring `scoreSubject` to `analyseSlop` is genuinely a week's work and belongs where R4 put it — I proved at R3 that even the good detector cannot separate line 1 from line 3, so the capability is not a 48-hour fix and I will not pretend otherwise. But my block was never on the capability. It was on the sentence. Deleting one hyphenated word from one string is not a queue row; it is the same class of work as item 6, which R4 ranked *into* the seven precisely because it is a string. A one-word delete parked in a week-long queue with no owner and no judged date is how every dead item from 12 Aug died — R4 says so itself, three lines from the bottom.

So I do not block. I convert.

## Verdict

**I agree with caveat: "content-emptiness" is struck from `server/index.js:4405` in item 6's commit — the claim comes out this week even though the capability does not, because a one-word delete does not need a queue row and queued-without-an-owner is exactly how the last plan's five items died.**

If it rides into the week unowned, my R3 block stands and I will file it again with the same three lines and the same three 96s.

## What I learned across five rounds

That my lens was the one thing I could not point at myself: I spent R1 and R2 defending a sentence on taste, and only when I ran the product's own creative gate at R3 and watched it score my best line and a slop machine's identically did I understand that the house defect — a gate reading its own vocabulary instead of the fact underneath — had been sitting inside my own argument the whole time.

---

*— Nebula, Creative Director. Three lines, three 96s, twice now. The gate has not learned to read; I have.*
