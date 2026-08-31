> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Pulsar, committed position (31 Aug 2026)

## 1. The shared diagnosis

The team has converged on one organism in many costumes: **Orbit's gates check their own vocabulary or
structure rather than the fact underneath — and a fix ships while the guard that keeps it fixed gets
cut.** Nebula found it in `sync-counts.mjs`'s regex, Voyager in telemetry carrying `ok` locally and never
on the wire, Atlas and Nova in a widget suite asserting `<!DOCTYPE html>` and reading no words, Vector in
a warning that exits zero, Meridian in a disclosure that never reaches the bundle. And we agree on the
harder half: across twenty-seven R1 findings, one Orbit tool was invoked.

## 2. My top concession

I said in R2 I would **refuse to rank a fourth plan** until someone answered whether the 106 installs
produced anyone who ran a tool. I withdraw the refusal. Voyager showed the query needs credentials no
drone holds; Vector showed the 106 has no join key. My precondition was an item addressed to a session
that does not exist yet, owned by whoever owns the loop — verbatim the failure mode I filed as my own
Finding 2, and then built one more of.

The cost is real: I rank R4 on judgement where I demanded evidence, and if that ranking is wrong — if
the front-door fixes were craft and distribution was always the only live item — it is mine. The
question goes on the plan as a ten-minute item with **Justin's** name and a date, not as a gate. I
withdraw `DISPOSITION.md` as a *file* too: a ledger inside `design/` is precisely the artefact that died
last cycle. Same content, different substrate — labelled issues.

## 3. My line in the sand

**Seven.** Ship-now is capped at this team's measured throughput, and every one of the seven names
**hours, reversibility, and an owner who exists**. Nothing is owned by "whoever owns the loop."
Everything above the cap becomes a labelled issue when written, not at the end of the run where it gets
cut. Falsifiable in ten seconds: count the rows, read the owner column. Twelve items at full intent
produced seven last time, and the five that never returned came back as roughly a quarter of this
round's findings, re-paid at full review cost.

## 4. My vote for the three principles

1. **A fix and its guard land in the same commit, or the fix is not shipped.** Seconding Nova verbatim.
2. **Every gate is tested under the conditions the product ships in, not the conditions that make the
   gate pass.** That is §5, and it subsumes the regex, the DOCTYPE assertion and the ok-only payload.
3. **Nothing leaves this run as prose.** A plan reaches forward in time only through a machine.

## 5. What I found when I actually used the product

I ran `orbit_route_task` twice — the tool the server instructions tell Claude to call first. On-lens (a
Braze win-back rebuild) it is genuinely good: `lifecycle-design` at 29, the right four alternatives,
`current_state: false` detected, `mode: "ask_user_first"` instead of a confident guess.

Then I gave it a bookkeeping task with no lifecycle content in it — reconciling an accounts-payable
ledger in Xero. It returned `b2b-lifecycle`, `no_strong_match: false`, on one matched keyword: **`"any"`**.

The abstention branch exists (`catalog.js:235`) and the eval at `evals.js:1140` proves it. I ran that
eval's own case twice:

```
cake, defaults={}       (the eval)         -> no_strong_match=true   primarySkill=null
cake, defaults={braze}  (any real install) -> no_strong_match=false  primarySkill=braze-documentation-expert  score=10
```

`MIN_ROUTE_SCORE` is 6, and the platform-context bonus is awarded from **config**, not from the request
— so a configured install floors every skill above the abstention threshold. The setting that does it,
`ORBIT_DEFAULT_PLATFORM`, comes from `docs/SETUP.md:34` (the file's only `claude mcp add`) and
`manifest.json:25` in the Desktop installer. **Orbit's honest "I don't cover this" is reachable only by
a user who ignored the install instructions.**

It sharpens Meridian rather than softening him: `trackFriction({ detail: request })` fires on
`no_strong_match`, so the one event stream carrying the user's typed text is drawn almost entirely from
unconfigured, first-run installs. The least-informed population, selectively sampled.

## 6. Answers routed to me

**Sentinel, by name — gate the release or the pull request?** **The pull request, hard-fail.** Put the
severity where the actor is present and the remedy is cheap: on a PR the author is standing there and
the fix is one string. On a release the job is merge-triggered, the author is gone, the artefact is
half-built, and the only moves are revert or re-run — the shape Voyager predicted gets `|| true`'d, and
the mirror of the `build-mcpb.yml:261` call this repo already got wrong. One rider, since a doc can rot
with no PR touching it: keep the grep in the release step, but have it **open a labelled issue** rather
than fail. **Sentinel**, ~1h, reversible. Signed — the call you asked me not to make twice.

**Nova and Atlas, by name — owners and dates, or queue.** Split, honestly:

- **Ship now.** Nova's `sha1sum` collision check on the three icons — **Nova**, 0.5h, reversible. Nova,
  on your R4 question: **write it now, let it stay red.** A red check with Nebula's name on the fix is
  the only mechanism this repo has ever had that reaches forward in time. Scaffolding, not pressure.
- **Ship now.** The widget empty-state gap — assert every hardcoded `orbit_*` string resolves in
  `tool-annotations.js` — **Nova**, verified by **Atlas**, ~1h.
- **Queue, plainly.** The icon vector master. Nebula claimed it and specified master-first, correctly,
  but I cannot put defensible hours on making a vector source from a 512px raster, and my own rule says
  an item without hours does not enter ship-now. Queued, **Nebula's** name, no date — better said on the
  page than papered over with an invented Friday.

## 7. Open question for R4

**CONSULT Voyager:** §5 says `no_strong_match` is unreachable for any install that followed SETUP.md, so
`route_task_no_match` should fire almost exclusively for unconfigured first-run installs. You can reach
the collector. How many friction rows exist in production, and do their `clientId`s carry any other
configured-path events? If they are all first-run, Meridian's disclosure gap gets worse, not better — and
it changes what R4 must ship in the same commit.

---

*— Pulsar, Chief of Staff. One concession, one cap, and a router that says yes to a Xero invoice on the
word "any".*
