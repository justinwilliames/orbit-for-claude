> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# ECHO — growth/product-marketing review (cycle 5, 13 Aug 2026)

Lens: who this is for, activation funnel, retention loops, friend-repeatable test.
Pet hate: features without a story.

## What I re-verified before hunting further

This folder already carries four full cycles of my own findings (R1–R4, 12–13
Aug), on top of the 11 Aug review. Rather than re-walk that ground, I read all
five of my own prior files plus `FINAL-SHIPPING-DECISION.md` and
`R4-orchestrator-action-plan.md` (this folder's), then checked whether their
open items shipped.

**Fully fixed since my R4 (13 Aug, 12:22) — confirmed, not re-filing:**

- The "one email to download" / "an email address, nothing else" overclaim I
  flagged across ten surfaces in R4 is gone. `git log` shows `b53f4c1` (13 Aug,
  13:58 — after my R4 file) fixed all ten: `app/layout.tsx` sitewide meta,
  `app/downloads/page.tsx` title/OG, `components/McpCtaBanner.tsx` both
  variants, `lib/chat/knowledge-base.ts`, plus three lower-reach pages. It also
  added `tests/tripwires/signup-cost-claim.test.mjs` — I ran it directly
  (`npx node --test tests/tripwires/signup-cost-claim.test.mjs`) and all four
  assertions pass. This is a real regression guard, not a rubber stamp: it
  greps both known phrasings across `app/`, `lib/`, `components/` (excluding
  guide-content directories where "one email" legitimately means "a single
  send"), asserts the account-creation route still enforces the fields it
  claims, and asserts the guide/course CTA resolves to a page naming the
  ungated GitHub path. Good, careful work — closed.
- My R1 finding (`manifest.json.description` pre-repositioning, "Orbit
  Intelligence" signature) — fixed. Direct read confirms it now leads with the
  outcome sentence, no signature.
- The registry rename/deprecation, hero CTA routing to `/downloads`, and the
  supporter-ticker removal — all previously confirmed fixed, re-confirmed
  clean.

**Still open, unowned by any numbered action-plan item — re-flagging once
more, briefly, not re-arguing:**

`app/downloads/page.tsx` step 4 ("Ask Claude to run Orbit's render gate on an
email, or to size an A/B test") still doesn't link to `/getting-started`,
which is linked from nav, footer, `/apps`, `/account/downloads`, and the chat
CTA — everywhere except the one page that's the actual first stop after every
"Get Orbit MCP" click. I've now confirmed this unchanged across four cycles
(R4 11-Aug, R1/R3 12-Aug, now). It's a one-file, one-line fix sitting inside a
file that's been touched twice this round for other reasons. Grading this
medium, not high — it's real but self-evident (a confused user can still find
`/getting-started` via nav) and it's costing the loop nothing to leave open,
which is why I'm not spending more words on it.

## What I found

### The paid, licence-gated build is still live and downloadable right now, and it's still reachable by searching the one word every surface teaches

This is `R4-orchestrator-action-plan.md` item 4(ii) in this same folder
("Close the brand-name door"), filed by Nebula in R1 and re-verified by the
orchestrator in R4 as "the only thing on any list actively harming a live
stranger right now." I'm not discovering it — I re-ran the two checks that
prove it myself, fresh, this session, because it sits exactly in my lens (does
Orbit's first ninety seconds work for a stranger who's never heard of it) and
because a re-verification that it's *still* live matters more than a first
discovery would:

```
$ curl -sIL -o /dev/null -w "%{http_code}\n" \
  https://github.com/justinwilliames/orbit-for-claude/releases/download/v0.27.7/orbit-lifecycle-marketing-system-for-claude.mcpb
200

$ gh release view v0.27.7 --repo justinwilliames/orbit-for-claude --json assets
{"assets":[{"name":"orbit-lifecycle-marketing-system-for-claude.mcpb",
  "downloadCount":72, "size":32258974, "state":"uploaded", ...}]}

$ curl -s '.../v0/servers?search=orbit&limit=100' | grep justinwilliames
io.github.justinwilliames/orbit-for-claude  0.27.6  deprecated
io.github.justinwilliames/orbit-for-claude  0.27.7  deprecated
```

The live registry entry for the exact word "Orbit" — the only brand term the
README, the site, the certificates, and every piece of copy teach a reader to
search — resolves to nothing but this deprecated, paid, licence-gated entry
(the renamed `braze-lifecycle-mcp` entry doesn't contain "orbit" and so never
appears in that search; confirmed separately, matches Nebula's R1 finding).
The registry's own `statusMessage` says it's deprecated, but that field is a
vendor `_meta` extension outside the spec object a conformant client renders —
whether a given MCP client surfaces it at all is not something either repo
controls — and even if a client does show the notice, the asset behind it
still returns a clean 200 either way. 72 people have already downloaded it.
Anyone who does now gets a build that demands an activation key against a
pricing page that no longer exists — the single worst first-90-seconds outcome
this whole review has been trying to prevent, and it's live at this moment,
not hypothetical.

**Why I'm filing this again rather than assuming Justin's queue has it:** the
fix needs his hands specifically (deleting a public GitHub release asset), the
action plan flagged that explicitly, and enough time has passed since R4
(this morning) that it was worth a fresh check rather than a stale assumption.
It hasn't moved. I'd rather cost one re-verification than let a live-harm item
go quiet because everyone assumed someone else was tracking it.

**Fix (unchanged from the R4 plan, and still the cheapest lever available):**
delete the `.mcpb` assets from the v0.27.6 and v0.27.7 GitHub releases (`gh
release delete-asset v0.27.7 orbit-lifecycle-marketing-system-for-claude.mcpb
--repo justinwilliames/orbit-for-claude`, and the same for v0.27.6). The
release entries can stay for history; only the installable file needs to go.
Fifteen minutes, needs Justin's authorisation to run since it modifies public
content.

Evidence tag: instrumented. Live `curl`, `gh release view`, and `curl` against
the production MCP registry, all quoted verbatim above, run fresh this
session — not inherited from a prior file's output.

## What I looked at and didn't flag

- **The `b53f4c1` diff itself** — read in full rather than trusting the
  commit message. All three GitHub-release links it touches
  (`app/sign-up/page.tsx`, `app/api/mcpb-download/route.ts` ×2,
  `components/McpCtaBanner.tsx`'s doc comment) point at the releases *index*
  (`/releases`), not a version-pinned URL, so none of them risk handing a
  stranger the stale v0.27.7 asset directly — that risk lives only in the
  registry path covered above. Clean.
- **Whether the new six-field account form itself should be shortened rather
  than the copy corrected** — a legitimate alternative, but R3 (12 Aug) already
  named the password/security-question requirement as a considered constraint
  (no transactional email for password reset), not an oversight. Not
  relitigating a business trade for the third time.
- **Retention loops (version-nag, `/getting-started` prompts, cert/LinkedIn
  share loop)** — all re-checked, all unchanged and clean since R2/R3. Nothing
  new this pass.

## Verdict

One re-verified, still-live, high-severity item (the paid build stays
downloadable under the brand's own search term) that the team already knows
about and hasn't actioned since this morning — I'm confirming it hasn't
quietly resolved itself, with fresh evidence, because it sits squarely in my
lens and is actively costing Orbit its best first impression right now. One
low-cost, medium-severity item (`/downloads` → `/getting-started`) still open
across four cycles, mentioned briefly rather than re-argued. Everything else I
checked this pass — the ten-surface overclaim fix, the manifest repositioning,
CTA routing, retention loops — is clean and correctly shipped. My lens is
close to exhausted on this branch; the next new ground is more likely in
Nebula's or Sentinel's territory than mine.
