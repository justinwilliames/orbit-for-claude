> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Iris (convergence)

## The shared diagnosis

[judgement] Nine R1 files and five R2 pairings land on the same shape: supply and craft are real and improving — 1427/1427 green, five releases in ten days, a brand voice Nebula calls "one hand" — and every surface a stranger reads before deciding anything understates, contradicts, or misroutes that supply. Six drones independently re-derived the count spine because it is one mechanism in five costumes, and Pulsar's synthesis names the blindness that convergence produced: a capability shipped this morning — three Braze-MCP skills, 0.39.0 — that no positioning finding accounted for, because everyone was looking at the same drifted number.

## My top concession

[instrumented] I built R1 on one falsifiable number — weekly active MCP installs, 4 against the gate of 50 — and told the team to score the loop against it moving. Sentinel and Voyager's engineering pair showed it's dirtier than I claimed: `getPmfData()`'s `activeClient` predicate is `type = 'tool_call' AND client_id IS NOT NULL`, no `tool_error` subtraction, so a client whose every call crashes still counts active. [judgement] I reported "4 vs 50" as the health read; it's the ceiling on it. That costs me the clean scoreboard I wanted to carry into R4. Voyager's substitute — 482 `.mcpb` downloads across 31 releases, last five 11/7/10/17/2 — is worth the trade: unpoisoned, and readable without the DB access none of us has. I'm dropping "4 vs 50" and adopting the download curve until `getPmfData()` subtracts failures.

## My line in the sand

[judgement] No distribution action — Search Console reindexing, the MCP-directory listing, the awesome-mcp PR — goes out before Atlas's registry-name fix lands. All three are megaphones, and today they'd all point strangers at the deprecated, gated `braze-lifecycle-mcp`. Publishing reach before fixing the destination doesn't add distribution on top of a flaw — it spends the first impression with the first real audience we've had in five months, and Echo already named that as the one experiment nobody gets to re-run.

## Three principles I vote to ship against

1. [instrumented] A number nobody reads is not telemetry — `mcp_telemetry.version` is written on every row, read by zero queries (Voyager R1#3).
2. [judgement] Fix the destination before the megaphone — every channel action inherits whatever the linked page currently says.
3. [instrumented] Drift wearing curation's clothes still needs a build-time source of truth — `skills-library.ts` carries real per-entry craft for 79 of 86 skills and has missed every skill shipped since 08-21, mine to rule (R2-iris-solo): drift, not curation.

## ANSWER — to Pulsar, routed question, aloud

[instrumented] Sharper for a named, narrow audience — a segment wedge, not a brand wedge. `skills/braze-mcp-operations.md`'s own trigger clause: "Use this skill whenever a Braze task could be done through the Braze MCP server… and you need to decide which surface actually does the job." That presupposes a reader who already has Braze, already has the MCP connected or is evaluating it, and already knows what a Canvas is. `get-orbit/lib/changelog.ts`, slug `0-39-0-braze-mcp`, matches: *"'but Braze has an MCP now' is a reasonable thing to assume and it will arrive there first."* Copy for someone mid-build, not someone deciding whether lifecycle marketing matters. [judgement] "A lifecycle marketer, built into Claude" is Vector's front door for the general ninety-second stranger. "The layer that knows where Braze's MCP stops" is a second door, for warm, technical, already-Braze traffic — it belongs on the channels that audience reads (an MCP-directory listing, an awesome-mcp PR, a Braze developer/community post), not the homepage hero.

[instrumented] Yes, it changes which weekly actives to count — but the query to count them barely exists. `server/telemetry.js`'s `trackToolCall({slug, ...})` (line 191) and `trackSkillLoad` both carry a per-call `slug`, so a Braze-MCP cohort (`slug LIKE 'braze%'`) is derivable from raw `mcp_telemetry` rows. But `getPmfData()` as Voyager read it (`lib/db.ts:2019-2043`) aggregates `DISTINCT client_id` with no slug filter — the segment cut is an unexploited column, not a built query. [judgement] So score it on a new, narrower cohort — weekly actives whose calls include a `braze-*` slug — not folded into the whole-product headline, which would dilute a segment signal to noise at this volume. And yes, it's a segment wedge, not a brand one: promoting it to the homepage's primary line would narrow the front door to people who already run Braze, which most of the "80+ apps, 99 guides" traffic does not. It belongs beside the front door, not on it.

## One distribution action before round 3

[judgement] File the awesome-mcp-servers PR after Atlas's registry-name fix ships, using the Braze-MCP-stops framing as its differentiating line — that audience is exactly who `braze-mcp-operations` is written for. **Human step needed from Justin:** he holds the GitHub relationship and the PR-authoring call; I draft the description once the registry fix lands, he opens it.

## Open question for R4 — asked aloud, to Justin

Which door gets your unblockable hours first: the Braze-practitioner wedge (MCP directories, awesome-lists, Braze community — an audience that already exists and already has the exact problem this ships for) or the SEO authority levers already queued (Search Console, the three dofollow directories)? Both need only you, both are cheap, and nobody has ranked them against each other — R3 named a second door, it didn't choose which one opens first.

— Iris
