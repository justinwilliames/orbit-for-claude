> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# NOVA — R4 — Product Design / UI Craft

Scope this round: the two widget commits that landed since R3 closed
(`cb02496` — verdict fingerprinting, image-load abstention, shared
`flash()`, bridge-less artifacts — and `82bbddf` — diagram-view type text,
notif-clip contrast fix, tool-list budget). R3's two findings both shipped
in `82bbddf`, confirmed by diff, not re-checked live since the fix is
self-evident from the patch. This round is about whether the *new* work in
`cb02496` introduced anything, since that is genuinely unreviewed surface.

## New findings

### 1. The render gate's headline verdict pill isn't wired to its own abstention logic — a partially-unmeasured email can still show a clean PASS

`server/ui/widgets/render-gate.js:377-399` is exactly the fix this round's
commit message describes: when any image fails to load, `geometryUnreliable`
becomes true and the four geometry checks that read a collapsed layout
(`checkOverflow`, `checkCtaWrap`, `checkHeight`, `checkTapTargets`) are
skipped rather than run against fiction. Good — that's the documented bug
fixed.

But `geometryUnreliable` is a `var` scoped inside `measureAll()`
(line 377) and it is never read anywhere else in the file. I grepped:

```
$ grep -n "geometryUnreliable" server/ui/widgets/render-gate.js
377:  var geometryUnreliable = images.total > 0 && images.broken > 0;
378:  if (geometryUnreliable) {
387:  if (!geometryUnreliable) checkOverflow(readable);
392:    if (vp.id === "mobile" && !geometryUnreliable) checkTapTargets(doc, vp);
394:  if (!geometryUnreliable) {
```

Five hits, all inside `measureAll()`. `verdict()` (line 799) and `counts()`
(line 794) — the functions that decide what the big pill at the top of the
widget says — only look at `findings`:

```js
function counts() {
  var c = { fail: 0, warn: 0, info: 0 };
  findings.forEach(function (f) { c[f.severity]++; });
  return c;
}
function verdict() {
  var c = counts();
  return c.fail > 0 ? "fail" : c.warn > 0 ? "warn" : "pass";
}
```

Skipped checks produce zero findings by construction — a check that never
ran cannot fail. So if a document has a broken hero image (triggering
abstention) but the widow and contrast checks that *do* still run come back
clean, `findings` is empty, `verdict()` returns `"pass"`, and
`renderHead()` (line 806-812) paints `#verdict` — the pill sitting directly
next to the `<h1>` at line 1000-1001, the first status a reviewer reads —
green: `background: var(--ok-wash); color: var(--ok-strong)`
(`render-gate.js:114`). The one place this gets disclosed is the "Not
measured" block at the very bottom of the rail
(`renderRail()`, lines 856-858), styled at `font-size: 11px` in
`var(--ink-3)` — the dimmest text tier the design system has — inside a
`.abstain` box painted `background: var(--sunk)`, i.e. deliberately
recessed (`render-gate.js:102-105`).

This is the exact failure the commit message names — "measuring it anyway
and calling the result PASS is worse than measuring nothing, because it is
a pass nobody earned" — surviving one layer up. The numeric findings are
now honest; the headline verdict that a reviewer actually scans for is not.
A gate whose whole premise is "we measured what only a render reveals"
showing a bold green PASS pill while four of six check categories silently
didn't run is the render-gate equivalent of the review-gallery bug this
same commit fixed elsewhere in the same diff — a green signal the reviewer
has no reason to distrust, produced by absence of measurement rather than
presence of quality.

**Fix:** hoist `geometryUnreliable` (or the `abstained.length > 0` check,
which is equivalent and already module-scoped) into `verdict()`. At minimum
downgrade `"pass"` to `"warn"`/`"REVIEW"` when abstentions exist and
findings are otherwise clean, so the pill can never read a clean colour
while checks are known-incomplete. Cheap — `counts()` already runs after
`abstained` is populated for the call; it just isn't consulted.

### 2. `.stale-note`'s text colour reads an undefined CSS variable — the "your approval expired" warning renders as plain body text

`server/ui/widgets/review-gallery.js:171-172`, added in the same commit to
surface exactly the state R3 flagged as missing (a verdict whose fingerprint
no longer matches its creative):

```css
.stale-note {
  margin-bottom: 8px; font-size: 11.5px; color: var(--warn-strong, var(--ink));
  border-left: 3px solid var(--warn, var(--rule)); padding: 5px 0 5px 9px;
}
```

`--warn-strong` does not exist. Checked the token source directly, not the
static file (the shell inlines `ORBIT_TOKENS_CSS` at request time, so the
live string is what matters):

```
$ node --input-type=module -e '
import { ORBIT_TOKENS_CSS } from "/Users/justin/code/orbit-for-claude/server/ui/tokens.js";
console.log(ORBIT_TOKENS_CSS.includes("--warn-strong"));'
false

$ grep -rn "warn-strong" . --include="*.js" --include="*.css" --include="*.html"
server/ui/widgets/review-gallery.js:171:  margin-bottom: 8px; font-size: 11.5px; color: var(--warn-strong, var(--ink));
```

One hit in the whole repo: the reference itself. Every other severity
token pair in this design system has a `-strong` text variant
(`--ok-strong`, `--active-strong`, `--brand-strong` are all declared and
used for exactly this purpose — text-on-wash, distinct from the fill hue).
Whoever wrote this rule reached for the pattern that exists everywhere else
in `tokens.js` and it doesn't exist for warn. CSS's `var()` fallback syntax
means this fails silently, not loudly: `color` resolves to `var(--ink)` —
ordinary body-copy grey, same weight as every other line of prose on the
page — while the `border-left` three lines down correctly resolves
`var(--warn)` to the calibrated red/coral. The result is a callout with a
coloured accent bar and uncoloured text: the one visual cue that should
tell a reviewer "the thing you approved is not the thing on screen any
more" is carrying half the intended signal.

This is a small paper cut next to finding #1, but it's landing in the
identical spot: the message that exists specifically to stop a reviewer
trusting a stale verdict is visually underweighted the moment it ships.

**Fix:** `--warn-strong` needs a real declaration in `tokens.js` (light:
something in the `#8f2e20`–`#b3402e` family for AA against `--card`; dark:
a punch above `--warn`'s `#f87171`, the way `--ok-strong`/`--active-strong`
sit relative to their base tokens) — or, simpler, `.stale-note` should just
read `var(--warn)` directly like every other warn-text usage in this same
file (`.dot[data-v="changes"]`, line 119) and in `qa-report.js`/
`audit-report.js`/`render-gate.js`, none of which reach for a `-strong`
variant that was never built for this hue.

## What I checked and did not file

- `countImages()` (render-gate.js:296-320) itself — reads `naturalWidth`
  and `.complete` off the first readable viewport's frame doc, which is
  the correct signal and matches how email clients report "images off."
  No defect.
- The new shared `flash()` in `WIDGET_PRELUDE` (shell.js:241-250) — stamps
  `role="status"`/`aria-live="polite"` at call time rather than requiring
  the markup to remember it, so a widget that forgets the attributes on
  its `#sent` span is still announced. Correctly de-duplicates what R3
  would have flagged as five silent copies. No defect.
- The bridge-less artifact path (`register.js:135-142`,
  `shell.js:129-156`) — `bridge: false` correctly skips both
  `loadBridge()` and the 320KB inline, and the standalone
  sign-off/degrade-messaging split (`orbitSignStandalone` vs.
  `orbitDegradeWithoutHost`) is keyed off the same `orbitEmbedded` check
  used for the connect attempt, so there's no state where an artifact
  shows the wrong one. No defect.
- Whether `contentHash()`'s FNV-1a over `html + push.title + push.body +
  name` could false-negative (miss a real change) or false-positive
  (flag an unchanged item as stale) — traced the fields against
  `renderPush()`/the email stage and they cover every piece of the item
  the reviewer actually judges visually. Not a craft question, and R2/R3
  didn't own the hashing logic itself, so leaving this to Sentinel's lens
  if it wants a second pass on the algorithm rather than the presentation.

## Verdict

Two new findings, both introduced by the same commit (`cb02496`), both in
the shape "the fix is correct at the data layer, the UI never asked the new
signal a question." #1 is the sharper of the two — it's a false PASS on the
one widget whose entire pitch is "don't trust a screenshot, trust a
measurement," reachable on the routine case of one broken image, not an
edge case. #2 is a real but minor contrast/consistency slip in the same
diff. Confirmed R3's two findings shipped clean in `82bbddf` by reading the
diff; not re-verifying them live since the patch is self-evidently the
fix (type text next to the channel pill, hardcoded light-calibrated
`.notif-clip` colour, matching regression test named in the commit
message). No third finding — swept the rest of `cb02496` (shared `flash`,
bridge-less artifacts, `contentHash`) and it holds up.
