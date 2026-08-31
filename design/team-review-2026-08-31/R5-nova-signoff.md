> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R5 — Nova, sign-off (31 Aug 2026)

## Finding-by-finding disposition

**1. Two type systems — still present.** `server/ui/tokens.js:54-56` still declares
Bricolage Grotesque / Inter / JetBrains Mono; `server/orbit-branding.js:46-62` still
declares and bundles Sora / Oxanium / Geist Mono as real `.ttf` files. Re-checked both
files this round, unchanged since R1. R4 doesn't touch this — correctly: I called it a
Nebula/Justin decision in R1, not mine to patch by picking a winner in a CSS file. Still
queued, not scoped into R4's five items. That's a gap, not a regression.

**2. icon.png / icon-light.png / icon-dark.png identical — still present, correctly
disposed.** Re-ran `shasum icon.png icon-light.png icon-dark.png`: all three still
`d3beefd77fd508c50c23c00f85e8a081354e57bc`, byte-identical, same result as R1. `find . -iname
"*.svg"` returns zero files — confirms R4's premise that there is no vector master to
regenerate from. R4 queues "the icon triple," names the block reason as the missing
input, and pairs my hash-diff guard with the master as one row rather than shipping a
re-export as a fix. That's exactly my R3 line: master before regeneration, guard travels
with it. Satisfied.

**3. Stale render-gate/review-gallery proof shots — still present.** `docs/images/render-gate.png`
and `review-gallery.png` are both still 12 Aug per `git log`. `review-gallery.js` picked up
another commit 25 Aug (00:31) after the screenshot; `qa-report.js` last touched 13 Aug. Same
gap as R1, unresolved, not in R4's five — lowest-stakes of my three, I didn't push it and it
shows.

## Verdict

I agree with caveat: findings 1 and 3 are still open and not on R4's list — acceptable to
ship without them, but they don't disappear because this round didn't re-raise them louder.

## What I learned

Filing a defect twice and calling it "queued" isn't shipping it — the difference between R1
and R5 on the icon is that this time the queue item has a named blocker, a named owner, and
a guard that travels with the fix instead of trailing it.

— Nova
