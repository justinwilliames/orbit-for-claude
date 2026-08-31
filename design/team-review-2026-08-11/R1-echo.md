> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# ECHO — Round 1 growth/product-marketing review

Lens: who this is for, activation funnel, retention loops, friend-repeatable test.
Pet hate: features without a story.

Scope read: `get-orbit` (app/page.tsx, app/sign-up/page.tsx, components/download-account-form.tsx,
app/api/mcpb-download/route.ts, app/account/downloads/page.tsx, components/nav.tsx,
app/certifications/[certId]/page.tsx, lib/changelog.ts) and `orbit-for-claude`
(README.md, manifest.json). Prior audits read in full, not re-derived.

## Headline

The homepage copy is genuinely good — "A lifecycle marketer, built into Claude" is a real hook,
the Claude-alone-vs-Claude+Orbit table is the right device, and the certification/LinkedIn-badge
loop off the courses is an actual K-factor mechanism, quietly well built. None of that is the
problem. The problem is the three steps between "a stranger is convinced" and "a stranger has the
file" — and the first-impression copy at the one moment that matters most (the install dialog)
undoing the story the homepage just told.

## What I found

### 1. The "free, no account" claim is false at the only door most visitors will use

I read `app/api/mcpb-download/route.ts` end to end. Its own header comment says it plainly: "No
auth required — the .mcpb is free for everyone... a session is never required to download." The
GET handler has zero session or entitlement check before it issues a signed S3 URL. This is real —
someone already did the work to make the actual download endpoint account-free, consistent with
the monetisation removal this review is auditing.

Then I checked who links to it. Exactly one page does: `/account/downloads` — which is gated
behind a mandatory login, which is reached only through `/sign-up`, which is a full account-
creation form (`components/download-account-form.tsx`): email, first name, password, and a secret
question for password reset. Every "Get Orbit MCP" CTA on the homepage (`app/page.tsx`, both hero
and closing section) routes to `/sign-up`. The nav's install link does the same. A code comment on
the homepage confirms this is deliberate, not an oversight: "No direct links to the raw .mcpb
anywhere on the site — they'd bypass the portal."

So: the backend already ships the frictionless path. The frontend actively hides it. A stranger who
reads this session's own framing — "free with no key, no account, no call-home for authorisation"
— or orbit-for-claude's README ("no account, no licence key, no signup. Install the extension and
start using it") hits an email+password+secret-question form before they see the file. That gap
between claim and experience is exactly the kind of thing that makes a stranger bounce and not come
back, and there is no engineering left to do — the free path is built, tested, and simply not
linked. `lib/changelog.ts:893` even has a stale changelog line describing the old portal-gated
behaviour ("Downloads are now portal-gated... Unauthenticated hits get redirected") that no longer
matches what the route does today — the code moved on, the site's own history didn't notice.

Fix: add a plain "Download without an account" link straight to `/api/mcpb-download` next to the
"Get Orbit MCP" CTA on the homepage, in the nav, and on `/sign-up` itself. Keep the account flow —
it's legitimately useful for saved tool history and course certs — but stop making it the only
door to the free product.

### 2. The install-dialog description — the actual first impression — has no story

`manifest.json`'s `description` field is what Claude Desktop shows in the extension install
dialog, the single highest-leverage "friend-repeatable" moment in the whole funnel — it's the text
someone reads in the two seconds before they click install or don't. I read it verbatim:

> "Lifecycle marketing, CRM, email, SMS, push, retention, deliverability, segmentation,
> experimentation, and martech operating system for Claude — Orbit Intelligence."

That's a twelve-noun capability list with no outcome, no "who this is for," no story — precisely
the pattern I can't stand in a launch post. It also directly contradicts the homepage's own hook,
which someone clearly spent real design effort on: "A lifecycle marketer, built into Claude." The
homepage earns the story; the install dialog throws it away at the exact moment it matters most.

Fix: lead `description` with the outcome line (something like "A lifecycle marketer, built into
Claude — for anyone running Braze, Klaviyo, Iterable, or any ESP"), and move the noun-list into
`long_description`, where a reader has already decided to look closer.

### 3. The README's Star History chart is currently an anti-social-proof widget

`orbit-for-claude`'s README ends with a live Star History chart spanning four sibling GitHub repos.
I checked all four directly (`gh repo view`): comet-by-orbit (1 star), pulsar-by-orbit (0),
orbit-for-claude itself (0), orion-by-orbit (0). At the exact moment the goal is "genuinely
findable, worth a stranger's time," a chart that proves in one glance that almost nobody has
starred any of these is working against the ask, not for it. It also splits a first-time reader's
attention across four differently-named products in one README, when the brief says the site
itself already dropped three of them as satellite products — one more "wait, which one is this?"
tax on a reader who hasn't decided to care yet.

Fix: remove the chart until there's a number worth showing, or replace it with something that
doesn't invite the zero-stars read (e.g., "77 skills, 119 tools, one operator's decade of Braze
work" — the numbers that are actually strong).

## What I did not flag

I looked for the classic "features without a story" failure across the wider tool/skill surface
(the 8 CAPS cards, the BRAZE feature grid, the skill chips) and it's clean — every card on the
homepage is written as an outcome ("Turn one HTML template into dozens of variations," "Surface
naming issues, stale content, and duplicates"), not a bare capability noun. That discipline just
doesn't survive the handoff into `manifest.json`, which is finding #2.

I also didn't find a retention-loop gap worth a finding. The course-completion → LinkedIn
certification path (`app/certifications/[certId]/page.tsx`) is a real, working share loop, and an
installed MCP doesn't need a "come back" trigger the way a web app does — it's sitting in Claude
Desktop waiting to be asked something. Nothing to fix there.
