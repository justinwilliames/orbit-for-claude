> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# ECHO — Round 2 solo pass

Lens: who this is for, activation funnel, retention loops, friend-repeatable test.
Pet hate: features without a story.

I didn't re-audit my R1 ground (already covered exhaustively by `R2-story-pair.md`,
the Nebula×Echo paired session — `shareable-artifact-is-unbranded`,
`no-repeatable-sentence-anywhere-a-stranger-lands`, `orbit-intelligence-is-a-signature-tax`,
`artifact-path-opt-in-on-the-only-portable-surface`, and a set of honest R1 retractions).
That pass already covers the "make the sentence travel" and "make the artifact travel"
territory better than I would redo it solo. This pass went hunting specifically in the one
sub-lens nobody has fully walked yet: **the loop that brings someone who already installed
Orbit back to get the next version.** That's retention, not acquisition, and it's mine.

## What I found

### The in-product update nag — Orbit's own retention mechanism — points every returning user at the signup wall the whole relaunch exists to remove

`server/version-nag.js` runs on every MCP session start, checks for a newer release, and —
once per session — attaches an update notice to the first tool response:

```
server/version-nag.js:106
notes: `Orbit v${cached.latest_version} is available (you're on v${cached.installed_version}).
Download the latest .mcpb from https://yourorbit.team/download and double-click it — Claude
replaces the old version in place, no uninstall needed.`
```

`server/version-check.js:82` and `:85` carry the identical URL, both as a `download_url` field
and as the first line of `suggested_next_steps`.

I traced `https://yourorbit.team/download` (singular) against `get-orbit/next.config.ts`:

```
next.config.ts:36-40
// /download — renamed to /sign-up in April 2026 to reflect
// that the page is primarily account creation (which then
// unlocks the MCPB download + tool history + certifications),
// not a direct download. Preserve every external link.
{ source: "/download", destination: "/sign-up", permanent: true },
```

A permanent 301, dated to the old paid-account-required model. It was never touched when
`/downloads` (plural) was rebuilt as the free, no-account canonical install page — I read that
page's own header comment confirming it's the fix (`app/downloads/page.tsx:9-27`: "The paywall
came down and the email wall did not... So the primary button is now a direct hit on
`/api/mcpb-download` with no session"). Good page, correctly built, genuinely free. Nothing
in the product tells anyone it exists under this name.

So the actual sequence for an existing, activated user — the single warmest lead Orbit has,
someone who liked the tool enough to keep it running — is: run Orbit, see "Orbit v0.29 is
available, download it from yourorbit.team/download," open that URL, land on `/sign-up`,
hit email + password + secret question to get an update to a tool the README, the homepage,
and this very session all describe as "free, no account."

It's wider than the version nag. The same stale URL is hardcoded in three more places I
checked directly:

```
$ grep -n "yourorbit.team/download\b" get-orbit/lib/faq-data.ts
110: "Download the .mcpb file from yourorbit.team/download..." (the install FAQ)
118: "...Download the latest .mcpb from yourorbit.team/download..." (the update FAQ)

$ grep -n "downloadUrl" get-orbit/app/layout.tsx
265: downloadUrl: "https://yourorbit.team/download",
```

Line 265 is inside the homepage's `SoftwareApplication` JSON-LD block — the exact structured
data Google/Bing/AI answer engines read to answer "how do I download Orbit MCP." In the same
JSON object, three lines below, `offers: { price: "0", ... }` claims free. The machine-readable
data self-contradicts: a `$0` offer whose own `downloadUrl` field resolves to an account wall.
That's not a copy nit, it's the kind of thing an AI shopping/answer agent could quote back to
someone as "you'll need to sign up" — actively working against the "genuinely findable" goal
this whole review serves.

Net: the site's own well-built session-aware nav CTA (`orbit-cta.tsx`) correctly routes
anonymous visitors to `/downloads` and never touches `/download` — that part of the funnel
is fine and I want that on record so this doesn't read as "the whole site is broken." But the
one loop specifically designed to reconnect with someone who already uses the product — the
in-chat version nag, the FAQ page people actually read when something breaks, and the
structured data that's supposed to make the offer legible to machines — all point at a URL
that was renamed away from "free download" fourteen-plus months before this relaunch and
never updated to point at the page that now legitimately deserves the name.

**Fix:** one line in `next.config.ts` — repoint `/download` at `/downloads` instead of
`/sign-up` (or better, make `/download` the canonical slug and 301 the plural to it, since
that's what four external references already assume the word means). Then update the two
literal strings in `orbit-for-claude/server/version-nag.js` and `version-check.js` to match
whichever slug wins, so the in-product nag and the website agree. Fifteen minutes, four files,
and it's the only fix in this review that specifically repairs the mechanism aimed at people
who already chose the product once.

Evidence tag: instrumented — every quote above is a direct file read, not inference. I did not
run a live HTTP request against the redirect (no network egress in this environment); the
`permanent: true` redirect rule in `next.config.ts` is Next.js's own declarative redirect
config, so the 301 is the code, not a guess about runtime behaviour.

## What I looked at and didn't flag

I checked whether `OrbitUseMenu` (`components/orbit-use-menu.tsx`) — the "Use Orbit" popover
that fires for signed-in users on the latest version, copying a starter prompt to clipboard and
firing a `claude://` deep link — actually closes the first-prompt gap Atlas flagged in R1. It's
a genuinely good, accessible (APG menu-button keyboard pattern), well-reasoned piece of retention
design: four concrete starter prompts, not a generic "open Claude" link. It only reaches
signed-in users, which is a small slice today, but it's real, working, unclaimed-by-anyone-else
prior art for the first-prompt fix, not a gap. Not filing it — noting it so nobody re-flags
`OrbitUseMenu` as missing in a later round.

I also went back to my own R1 #1 (signup-wall-hides-free-download, since credited to me in the
known-findings list) to check whether it's stale: the homepage CTAs, footer, and nav all now
route to `/downloads`, not `/sign-up` — that part of the fix has shipped since R1. I'm not
re-filing it, but flagging for whoever owns closeout that the *acquisition* half of that finding
looks resolved; what's left open is the *retention* half documented above, which is a different
code path (`version-nag.js`/`version-check.js`/`layout.tsx`/`faq-data.ts`) that nobody touched
when `/downloads` was built.
