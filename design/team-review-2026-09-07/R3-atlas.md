> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Atlas

## The shared diagnosis

[judgement] The team converged on one mechanism wearing five costumes: a hand-maintained mirror (`skills-library.ts`) and a hand-maintained page constant (`downloads/page.tsx`) both drift silently against a source of truth that already has a working sync pattern next to it. Six R1 files named the count spine independently; Iris's R2 ruling closed my own open R1 question — "drift, not curation" — with the receipt that `braze-canvas-conformance` shipped a day before the site's last "full" audit commit and was still missed. That resolves my R1 ambiguity (five skill-count numbers, one glued into a visible "79lifecycle" concatenation bug) into a plain defect with a plain fix. The design pair I ran with Nova added the sharper half: the same promise-vs-delivery failure sits under the diagram-render crash — README:6 sells "diagram generation," onboarding's six starter prompts never touch it, so the one broken capability is hidden from users and telemetry alike. Pulsar's synthesis is right that convergence is its own blindness: nine files on the count spine, and the thing that shipped *this morning* — three Braze-routing skills making Orbit the layer above Braze's own hosted MCP — got one sentence, as a slug in a list.

## Top concession

[judgement] In R2 I ranked the registry-name fix ahead of Nova's diagram-render crash — cheapest win, earliest funnel position, decides which build a stranger runs. I'm giving up that ranking. The joined finding Nova and I filed is sharper than either R1 finding alone: a correctly-installed user following the README's own opening line hits a hard crash, and onboarding's prompt set is built so nobody — user or metric — ever routes through that path to find it. That's worse than my finding, where the harm at least resolves to "an older, gated build" rather than "the capability doesn't run." The cost is real — it was my headline "sharpest cost" claim in R1 — but CoS's ship-bucket table already prices both ship-now with separate hours and the same owner, so forcing an order buys nothing; the concession costs a ranking, not a ticket.

I also owe a close on my R1 deferral. The 35-field flat `user_config` list got no second lens in R2 — nobody could say whether the MCPB manifest schema or Desktop's settings renderer even supports sectioning. I'm not dropping it, and I'm not calling it a ticket: **commit a 1-hour spike, owner Nova, question only** — does the schema support a `group` field. No, closes clean. Yes, becomes an R4 ticket. An unscoped feasibility question sitting in queue is worse than a cheap answer either way.

## Line in the sand

[judgement] The registry-name fix and the count-spine fix do not get marked "shipped" on a green CI run alone. They get verified from the literal first-three-minutes path — the live `/downloads` page, the extension picker's `manifest.json` description as Desktop actually renders it, and `gh repo view`'s description — because that is exactly the gap that let issue #19 close on 01 Sep and regress by 07 Sep with the guard still green. Sentinel proved a repo-boundary guard can be honest while the surface a stranger reads is wrong; "the test suite passes" is not proof this ships fixed. I'll re-pull the live surfaces myself once Nova lands the PR.

## My vote for the three ship-against principles

1. Verify a fix at the surface a stranger reads, not the surface CI reads — a green suite and a wrong live page coexist, proven twice this round.
2. One root cause, one ticket — five drones filing the same file as five ship-now items is a process defect, not five findings.
3. A guard line plus the test it needs is a repair, not an addition — it clears the NOT-building gate without naming a displacement.

## ANSWER to routed questions

None routed to me this round — [instrumented] the CoS question ledger staffs "Owners: Nova ×3, Iris ×4, Voyager ×1, Sentinel ×1," Atlas absent from RUN.md's R2-direct-×5 budget. I answer my own brief's two directives instead.

**The registry fix's first three minutes, once it lands alongside the count fix:** a stranger fetches `yourorbit.team`, sees "86 skills / 135 tools" consistently across hero, FAQ schema, and `gh repo view`; picks the no-account route on `/downloads`; the page names `io.github.justinwilliames/orbit-lifecycle-mcp`, matching README:78, no gate, no stale build. Installs, empty config returns `status: "ready"` with one next step — the skeleton I already verified sound in R1. **The next doubt point:** [instrumented] the design pair's own unanswered question to Sentinel — "does a `manifest.json` skills-count fix even reach that [connector instruction] string, or does closing the website's number leave the in-session connector text still lying?" (`R2-design-pair.md`) — was never answered. If Desktop's stale-env behavior needs a full quit-and-relaunch to reach a spawned session's self-description, a fixed website and a lying assistant coexist in the same afternoon — this round's regression, again.

## Open question — asked aloud, to Sentinel

"Sentinel — Nova and I asked this in R2 and it's still open. Once the manifest carries a skills count and the site syncs it, does that number ever reach the live connector's instruction string, or is that string frozen at process spawn regardless of what the manifest says afterward? I can't sign off the first three minutes as fixed until I know whether the assistant itself keeps repeating a stale count after the page is correct."

— Atlas
