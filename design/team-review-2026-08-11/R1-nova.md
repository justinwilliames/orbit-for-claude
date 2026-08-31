> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# NOVA — R1 — Product Design / UI Craft

Scope reviewed: `orbit-for-claude/server/ui/` (tokens.js, shell.js, and all five
widgets — review-gallery, render-gate, qa-report, audit-report, diagram-view)
and `get-orbit/` (homepage, nav, email-capture-modal, download-counter) on
branch `free-orbit-remove-monetisation`. I did not re-walk the licensing or
tool-inventory ground the prior Sentinel/Voyager audits already covered —
that's not my lens and it's already documented.

## What's actually good here, first

`server/ui/tokens.js` is the real thing. Four-declaration theming (`:root`
light default, `prefers-color-scheme: dark`, then both explicit
`data-theme` overrides) with a written rule that no component CSS lives
inside a media query — that's the correct fix for the exact bug class that
themed UI usually ships with (host stamps a theme, media query still wins,
half the page is unreadable). The one deliberate light-locked exception —
the creative stage never darkens because a dark console mis-sells a
light-only email — is a real design ruling with a dated rationale attached,
not a default left unexamined. `render-gate.js` and `qa-report.js` both
pair every severity signal with a text label (`f-check`, the mono evidence
chips, the `o-pill` text) — color never carries meaning alone there. That's
the discipline the rest of the system should hold to everywhere, and mostly
does.

## Findings

### 1. Review-gallery's verdict dot is color-only signal — the one place in this widget set that breaks its own house rule

`server/ui/widgets/review-gallery.js:56-58`:
```
.dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 6px; flex: none; background: var(--pending); }
.dot[data-v="approved"] { background: var(--ok); }
.dot[data-v="changes"] { background: var(--warn); }
```
This 8px dot is the *only* place in the rail list a reviewer's own verdict
state shows. There's no text label, no icon, no `title`/`aria-label` — just
grey/green/amber at 8px, sitting next to item text that already carries
name and channel, not verdict. Compare `render-gate.js` and `qa-report.js`
in the same commit: both encode severity as a colored left-border *plus* an
uppercase text chip (`f-check`, `o-pill[data-sev]` with visible text). Three
sibling widgets, shipped together, and the one that tracks a human decision
(approved / needs changes / pending — the highest-stakes state in the whole
set) is the one relying on color alone. This is a straightforward parity
fix, not a redesign: give the dot a `title` attribute reading the verdict,
and/or put a 1-character glyph in it (✓ / △ / ·). Fifteen minutes of work,
and it closes the actual gap — reviewer scans a 20-item list and currently
has to distinguish state by hue, which fails for the ~1 in 12 people with
red-green color vision deficiency and fails on a bad monitor for everyone
else.

### 2. Review-gallery's mobile breakpoint deletes navigation with no replacement

`server/ui/widgets/review-gallery.js:111-114`:
```
@media (max-width: 860px) {
  .wrap { grid-template-columns: 1fr; }
  .rail { display: none; }
}
```
Under 860px the entire left rail — every way to move between items, see
progress, or see the group structure — disappears. Nothing replaces it: no
prev/next control, no dropdown, no drawer toggle. Whatever `currentId` was
set to when the breakpoint crossed is the only item the reviewer can ever
see; if they opened the widget on a narrow host pane (an MCP host sidebar,
a phone-width Claude session — plausible, not exotic, for a review tool
meant to be used from wherever a reviewer is) they are reviewing exactly
one creative and can never reach the rest. `render-gate.js`, styling the
same rail/main layout shape, handles its own narrow breakpoint by stacking
the rail *below* the stage at `max-height: 46vh` (line 116-119) — it stays
reachable. Review-gallery should do the same, or add a minimal item-switcher
(a `<select>` populated from `items` is enough) gated to that breakpoint.
Right now the fix in the sibling file is sitting three files away and
wasn't reused.

### 3. The homepage email-capture modal fires at 2.5s, before a first-time stranger has read the pitch it's trying to sell

`get-orbit/components/email-capture-modal.tsx:110-118`: the modal shows
`2500`ms after mount, gated only by session/dismissal/submission flags and
a path exclusion list (`/admin`, `/login`, `/api`, one app editor route) —
the homepage is not excluded. So the very first thing a cold visitor sees,
2.5 seconds after the H1 finishes animating in, is a full-screen dimmed
overlay with a name+email form sitting on top of a blurred hero (confirmed
live on production — screenshot on file). The brief for this review states
plainly: 2 unique repo visitors in 14 days, nobody's using this. Every one
of those visitors is a stranger being asked to hand over an email address
before they've finished the first paragraph of copy that's supposed to
convince them Orbit is worth their time. That's the wrong order of
operations for a product with zero earned trust yet. This isn't "remove the
modal" — the suppression logic (30-day dismiss TTL, submitted flag, geo-
aware consent default) is genuinely well built. It's "don't fire it on a
visitor's first ever pageview before they've engaged." Cheapest fix: add a
scroll-depth or dwell-time gate scoped to first-session-on-homepage (e.g.
don't arm the 2.5s timer until the visitor has scrolled past the hero, or
raise the delay specifically on `/` to something past a real read of the
H1 + subhead), or move to exit-intent for first-time homepage visits only.

### 4. The homepage "trusted by N marketers" counter is an undeduplicated raw click count wearing escalating social-proof copy

`get-orbit/lib/db.ts:412-421`:
```ts
export async function trackDownload(trafficType?: string | null) {
  await initDb();
  await pool.query(`INSERT INTO downloads (traffic_type) VALUES ($1)`, [trafficType ?? null]);
}
export async function getDownloadCount(): Promise<number> {
  await initDb();
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM downloads`);
  return result.rows[0].count;
}
```
Every click of the download button inserts a row. No unique-visitor key, no
bot/UA filter, no dedup against repeat clicks, refreshes, or the site
owner's own QA passes. `components/download-counter.tsx:64-71` then maps
that raw count through an escalating copy ladder — "Early adopters only" →
"Join N marketers who've installed Orbit" → **"You're in good company — N
marketers have installed Orbit"** → "Trusted by N" → "Loved by N" — turning
an unaudited click tally into stronger and stronger third-party-sounding
trust language as the number climbs. Given this review's own stated
baseline (0 GitHub stars, 75 all-time release downloads, ~62 of those
registry crawlers), a component whose entire job is to *sound* like organic
traction off a number nobody has checked for bots or repeat clicks is a
liability the moment a visitor's actual traffic (2 in 14 days) doesn't match
what the banner just told them. This is the same category of problem as a
stock photo of a "team" that's actually four people — it's a design choice
that manufactures a signal the product hasn't earned yet, and a skeptical
CRM/lifecycle-marketer visitor (Orbit's own target user) is exactly the
audience most likely to notice a counter that doesn't add up and discount
everything else on the page as a result. Fix: dedupe by visitor
(cookie/fingerprint) before counting, and drop or soften the copy ladder's
top tiers until the number reflects something a skeptic would accept as
real.

## Not flagged

I looked for the standard "card layout doing the type hierarchy's job for
it" failure across both repos and didn't find it — `qa-report.js`'s
check-tile grid and the homepage's feature sections both lean on actual
type-weight and color contrast to establish order, not just card borders.
Widget CSP/font-fallback handling (`tokens.js` header comment) is a
correctly-scoped tradeoff, not a gap — inlining three webfonts into every
widget payload for a near-metric-match system-font fallback isn't worth the
bytes, and the code says so.

## Verdict

Two real findings in the new MCP-Apps widget set (both parity bugs against
the widget set's own established pattern, both cheap to fix), and two real
findings on the marketing site that go directly to the brief's "make this
genuinely worth a stranger's time" goal — the email-capture modal taxes the
one thing a cold visitor has (attention, in the first 3 seconds) before
they've decided the product is worth it, and the download counter spends
trust the product hasn't earned. All four are actionable with a named fix.
