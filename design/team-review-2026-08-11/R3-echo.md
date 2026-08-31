> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# ECHO — Round 3 growth/product-marketing review

Lens: who this is for, activation funnel, retention loops, friend-repeatable test.
Pet hate: features without a story.

R1 and R2 already covered the ground I'd normally walk first — the signup-wall
funnel, the manifest description, the star-history chart, the version-nag URL —
and a lot of it has since shipped (`654291f`, `cd5351a`, `ba1bf34`, `d28988a`
in get-orbit; `464d124`, `cb02496` in orbit-for-claude). I re-read the current
state of each before hunting further, confirmed they're either fixed or
already tracked under a known slug, and did not re-file any of them. This
pass went looking specifically for proof and narrative that describes a
business model the relaunch just deleted — the place "features without a
story" most often hides is old social proof nobody re-reads once it's live.

## What I found

### The homepage's last word to a convinced visitor is a marquee of paying supporters, for a product that can no longer take a payment

`app/page.tsx:576-587` — immediately after the closing CTA ("A lifecycle
marketer, built into Claude... Free, every ESP, every future update
included... Get Orbit MCP"), the very next and final section before the
footer is:

```tsx
{/* Supporters ticker — last section before the footer. Async
    server component that fetches opted-in supporters. Renders
    null until there are at least 10 qualifying supporters, so
    this is invisible pre-launch and fills in naturally as
    payers accumulate. ... */}
<Suspense fallback={null}>
  <SupporterTicker />
</Suspense>
```

`components/supporter-ticker.tsx` renders a scrolling marquee headed
"Backed by operators around the world" — first name + city for each row,
e.g. "**Jane** from **Austin**." Its own header comment: "scrolling marquee
of **paying Orbit supporters**." The query it runs (`lib/db.ts:1587-1600`,
`getSupporterTicker`):

```sql
SELECT first_name, supporter_city, supporter_country
  FROM email_signups
 WHERE show_on_supporters = true
   AND supporter_city IS NOT NULL
   AND first_name IS NOT NULL
   AND payment_count > 0
 ORDER BY random()
```

`payment_count` is populated **only** by the Stripe checkout/donation flow
(`total_paid_cents, payment_count, first_paid_at, last_paid_at` all set
together at `lib/db.ts:1428`, from the webhook/verify-session path). That
entire flow is gone — confirmed by `git log`: `ffed3ae Remove all commerce
and entitlement surfaces — Orbit MCP is free`, `cd5351a Stop selling a price
we removed, and stop walling off a free file`. `next.config.ts` 301s
`/pricing`, `/support`, `/support/thanks`, and `/donate` straight to the
homepage. There is no live code path left anywhere in the repo that can
write a new `payment_count` row above zero.

I confirmed the opt-in itself is now orphaned too. `app/api/account/create/
route.ts:233-238` still accepts and processes a `showOnSupporters` flag —
and its own comment already knows the punchline: *"Free users who tick it
won't appear because their payment_count stays at 0."* But I grepped every
`.tsx` in `app/` and `components/` for `showOnSupporters` / `show_on_
supporters` and found **zero** matches outside that one API route file — no
current sign-up form actually renders the checkbox anymore. So the backend
still has a vestigial code path for an opt-in nobody can reach, feeding a
query that nobody can ever populate again, whose output sits as the very
last thing a stranger reads on the homepage.

**Why this is a finding and not just dead code:** it's live in production
today if the pre-relaunch row count clears the `MIN_SUPPORTERS = 10` gate —
I can't query the prod DB from here, but the gate exists precisely because
the ticker "reads as sad / early-stage" when thin, which means someone
already knows headcount matters to how this lands, they just didn't revisit
what the headcount now *means*. A stranger who just read "free, no account,
no key" and clicked through to the very bottom of the page sees a list of
named people framed as current backers of a thing they're being told costs
nothing. There is no way to become one of them today. The ticker can only
shrink in relevance from here — every day since the paywall came down, the
"operators around the world" it shows get staler as a signal of anything
happening now. That's the exact "proof without a current story" pattern:
built for one narrative (a paid product accumulating payers), left running
unmodified under a different one (free, no commerce, no way to pay).

It also sits next to the exact language the R4 action plan already used for
a sibling problem: "Show a stranger provenance, not traction" (on the
download counter). The supporter ticker fails that same bar in the opposite
direction — it's provenance for a fact that stopped being true.

**Fix, in order of cost:**
1. Cheapest and safest: change the caption from "Backed by operators around
   the world" to something honestly retrospective — e.g. "Orbit's early
   supporters" or "From Orbit's paid-launch chapter" — so the tense stops
   implying an active, joinable cohort.
2. Better: retire the component. It cannot grow, its opt-in path is
   unreachable, and the product it's proving no longer exists. Pull
   `<SupporterTicker />` from `app/page.tsx`, and either delete
   `components/supporter-ticker.tsx` + `getSupporterTicker` or leave them
   dormant with a comment explaining why (matching the pattern already used
   elsewhere in this repo, e.g. the `/download` redirect comment).
3. Delete the dead `showOnSupporters` handling in `app/api/account/create/
   route.ts` (lines 233-238) and `setShowOnSupporters` in `lib/db.ts` in the
   same pass — an accepted-but-unreachable request field is exactly the kind
   of drift this relaunch has been actively hunting down elsewhere (the
   `/api/account/create` grandfathering bug in the prior audit came from the
   same shape of problem: a flag nobody was watching anymore).

Evidence tag: instrumented. Every claim above is a direct file/grep read
(`app/page.tsx`, `components/supporter-ticker.tsx`, `lib/db.ts`, `app/api/
account/create/route.ts`, `next.config.ts`, `git log --oneline`), quoted
verbatim, not inferred from a summary.

## What I looked at and didn't flag

- **The MCP server's `instructions` block** (`server/index.js:294-317`) — I
  went in expecting a retention gap (does Claude actually reach for Orbit
  unprompted, or does a user have to know tool names by heart) and found the
  opposite: a genuinely well-built default-behaviour instruction telling
  Claude to consult `orbit_route_task`/`orbit_load_skill` first on any
  lifecycle/Braze/Stripo/deliverability/segmentation/naming work, with named
  high-value skills and a stated cost-of-guessing argument. This is the
  retention mechanism that matters most for an installed MCP (it's dormant
  until asked, so "does Claude know to ask it" is the real loop) and it's
  solid. Not filing it.

- **`orbit_render_gate`'s degraded path** — I checked whether the README's
  flagship "try it in ninety seconds" example strands a user on a host that
  doesn't support MCP Apps widgets yet (the ecosystem audit flags this as
  genuinely unconfirmed). It doesn't: the tool always computes the one
  check that needs no render (Gmail byte-size) inline, and always writes a
  standalone artifact HTML file via `writeWidgetArtifact(..., {bridge:
  false})` that runs the same layout/contrast/tap-target/widow measurements
  in any real browser, with its path stated plainly in the tool's own text
  response ("open it in a browser or send the file to anyone; it works
  without Orbit installed"). The one soft spot — the response also says
  "wait for that message" for the richer render-based findings, which never
  arrives on an unsupported host — is real but minor once the artifact
  fallback is accounted for, and it's adjacent to ground R1/R2 already
  covered in depth (`widget-bridge-not-in-mcpb`, `render-gate-ignores-image-
  load`). Not filing it as a standalone finding.

- **The certification/course K-factor loop** — re-checked post satellite-app
  removal (`app/certifications/[certId]/page.tsx`, `app/courses/**`) for
  breakage from the big `ac45c8d`/`b2d1802` deletion pass. Both still
  resolve and the share mechanic is intact. Nothing to file.
