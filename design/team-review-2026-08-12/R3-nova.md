> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# NOVA — R3 (this cycle) — Product Design / UI Craft

Scope this round: re-verified my own R2 finding (`o-btn-primary-dark-contrast`)
against current source rather than trusting the commit log, swept the two
widget files that didn't exist at my last pass (`dark-pairs.js`,
`esp-matrix.js`) plus the most-recently-touched widget (`auth-panel.js`, its
DNS-abstention rewrite), then went looking at the get-orbit marketing site —
since the "already-known" list already covers close to every widget-level
bug shape I'd normally hunt, and the site is where a stranger actually forms
an opinion of Orbit.

## Verifying my own R2 finding shipped correctly

`server/ui/tokens.js:239-262`. Read the source, then ran the same WCAG
formula I used in R2 against the values actually in the file now:

```
$ node -e '
function luminance(hex){const c=hex.replace("#","");
  const [r,g,b]=[0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255)
    .map(v=>v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4);
  return 0.2126*r+0.7152*g+0.0722*b;}
function cr(fg,bg){const a=luminance(fg),b=luminance(bg);
  return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);}
console.log("dark  resting: #101219 on #818CF8 =", cr("#101219","#818CF8").toFixed(3));
console.log("dark  hover:   #101219 on #a5adfb =", cr("#101219","#a5adfb").toFixed(3));
console.log("light resting: #fff    on #4F46E5 =", cr("#ffffff","#4F46E5").toFixed(3));
console.log("light hover:   #fff    on #3F35B8 =", cr("#ffffff","#3F35B8").toFixed(3));
'
dark  resting: #101219 on #818CF8 = 6.271
dark  hover:   #101219 on #a5adfb = 8.882
light resting: #fff    on #4F46E5 = 6.288
light hover:   #fff    on #3F35B8 = 8.704
```

Fixed correctly and generalised: dark mode now inverts to dark ink on a pale
fill (matching `.mk--on`'s pattern, as my own fix note asked for), all four
states clear AA with margin, and hover improves contrast in both themes
instead of degrading it. `FILL_PAIRS`-style coverage exists for this
specific pair now. Not re-filing.

## The two new widgets (`dark-pairs.js`, `esp-matrix.js`) and the auth-panel rewrite

Read all three in full. This is the same team that wrote the `.mk--on`
WCAG comment and the notif-clip fix, and it shows — `dark-pairs.js`'s
whole design is built around the exact bug class I keep finding: it
explicitly separates the "fixed-light specimen, because it's drawing the
email" surface from the "themed chrome" surface, checks every verdict pill
against `#ffffff` in a code comment before shipping it, and states four
rules at the top of the file that are, near verbatim, findings I've filed
in earlier rounds against other widgets (abstain-in-words rather than
draw-a-fictional-zero; glyph+word never hue-alone; a pane that can't
resolve draws as absent, not as a guess). `auth-panel.js`'s SPF pip meter
and DMARC ladder follow the same discipline — the pip count has a text
caption stating the exact numbers, the ladder's floor gets a flag glyph in
addition to position and colour, and the not-measured path gets its own
`V.not_measured` state checked *before* the `V[verdict] || V.warn`
fallback, which is exactly the order bug the auth-panel commit fixed on
the engineering side.

I checked the specific things that usually hide in a rewrite this size:
the `.vp[data-cls]` and `.flip[data-cls]` pill/text colour pairs in
`dark-pairs.js` are all literals checked against `#ffffff` (fixed-light
stage), not theme tokens — correct, per the file's own §"pane verdict
pills" comment. The DMARC ladder's `rung--here`/`rung--past` states use
themed tokens (`--brand-wash`, `--sunk`) correctly, because that chrome
*does* theme. Nothing new here; ruled out, not filing.

## Finding: the flagship-brain website fix — and the follow-up comparison guide — are real, tested, and shipping to nobody

This is the "reported SUCCESS while being wrong" shape the brief asks for,
just one level up from code: not a function that lies about what it did,
but a **commit** that does.

`git show --stat 4133764` (get-orbit) is titled "site: the flagship path
existed everywhere except the website" and its own body says exactly what
it's fixing: `flagship-brain-path-invisible-on-site` — the homepage brain
section, the metadata title/description (was "Lifecycle Marketing & Braze
AI", now "Build Your Own Lifecycle Marketing System"), `/getting-started`'s
prompt 01, and two missing `/skills` entries. A second commit, `0d3bdb6`
("guides: what Claude with Orbit does that Claude without it cannot"),
builds directly on it — a full new comparison guide, `slug:
claude-with-orbit-vs-without`, citing the same flagship path. Both commits
carry real diffs (`app/layout.tsx`, `app/page.tsx`,
`app/getting-started/page.tsx`, `lib/skills-library.ts`, plus the new
`lib/guides/claude-with-orbit-vs-without.tsx`), and I read all of it —
title, five-task comparison, FAQ, `SkillCallout` component — no craft
defects; the copy is disciplined about not overselling the baseline
("Claude alone is already good at most of this").

Then I checked where these commits actually live:

```
$ git branch --contains 4133764
  nova-brain-path-visible
$ git branch --show-current
team-review-round-2
$ git merge-base --is-ancestor 4133764 HEAD && echo YES || echo NOT_ANCESTOR
NOT_ANCESTOR
$ git rev-list --count main..team-review-round-2
4
$ git rev-list --count team-review-round-2..main
0
$ git show main:app/layout.tsx | grep -n title: | head -1
60:  title: "Orbit MCP — Lifecycle Marketing & Braze AI Inside Claude",
```

Both commits sit on `nova-brain-path-visible`, a branch two commits ahead
of `main` that is not merged into `main` and not merged into the
currently-checked-out `team-review-round-2` either — `main` has zero
commits `team-review-round-2` lacks, so it isn't downstream of it. I ran
the actual dev server (already running on :3000, this repo's checked-out
branch) and confirmed live, not just via git: page `<title>` reads "Orbit
MCP — Lifecycle Marketing & Braze AI Inside Claude" — the exact string the
commit's own message quotes as the defect it fixed. Grepping the working
tree directly confirms the whole fix is absent, not just the title:

```
$ grep -n "brain\|Scaffold" app/getting-started/page.tsx | wc -l
0
$ grep -n "template-brain\|brain-graphify-setup" lib/skills-library.ts | wc -l
0
$ grep -n "Build your own lifecycle brain" app/page.tsx | wc -l
0
```

So the already-known finding this fix was written against —
`flagship-brain-path-invisible-on-site` — is **still true today**, on both
the branch actively under review and on what looks like the production
branch (`main`, tagged with the live 0.29.1 version-sync commit). The
fix isn't wrong or incomplete; it's stranded. This is a distinct instance
from `merge-at-published-version-ships-nothing` (a different, already-
resolved set of nine commits) — same failure mode, new branch, discovered
after that one shipped, so the class of bug is recurring rather than
closed.

**Fix:** merge `nova-brain-path-visible` into whichever branch is actually
building the live site (`main`, on this evidence) before crediting either
commit as shipped. Nothing about the two commits themselves needs
changing — the content passed its own verification (95/100 slop, 20/20
tripwires, per the commit's stated checks) and I found no further craft
defects reading it cold. The gap is entirely integration, not content.

## What I checked and ruled out

- The `.pairs`/`.panes` grid math in `dark-pairs.js` and the `BRAIN_STEPS`
  four-card grid on the (unmerged) homepage section: worked through the
  border-index arithmetic by hand for both the 2-row and 4-row cases
  (`i < length-2` / `i < length-1` thresholds against `floor(i/cols)` row
  membership) — both resolve correctly for their item counts. Not a bug,
  despite looking like one on a first read of the ternary.
- `SkillCallout`'s silent-null-on-bad-slug path (flagged as a risk in the
  guide's own commit message): the slug it's actually called with,
  `braze-documentation-expert`, resolves in `lib/skills-library.ts:92`.
  Confirmed live in the same session — not a defect, and moot until the
  branch merges regardless.
- The `.mk--on` / `.o-btn--primary` fix pattern generalising to
  `esp-matrix.js`'s own pill set: same literal-on-fixed-light discipline,
  no drift.

## Verdict

One finding, and it's a merge-integration gap rather than a code defect:
the flagship-brain website work — the exact fix the last round's
`flagship-brain-path-invisible-on-site` finding called for, plus a
substantial new guide built on top of it — is real, tested, and shipping
to nobody, because the branch carrying it was never merged into the branch
actually serving the site. Verified against running code, not the commit
message: the live dev server's `<title>` still reads the pre-fix string,
and three separate greps of the working tree confirm the whole fix is
absent, not just the metadata. I read the widget surface closely too
(`dark-pairs.js`, `esp-matrix.js`, `auth-panel.js`'s rewrite) and found
nothing new there — the contrast and abstention discipline from earlier
rounds has generalised cleanly across all three. Not padding the list with
a restated widget finding to look busy; the merge gap is the one thing
here that's real, new, and worth a fix.
