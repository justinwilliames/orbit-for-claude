> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — ATLAS × NOVA, design pair cross-reference

Round 2, cycle 2, 12 Aug 2026. Read all eight R1 files from this round before
touching anything. Everything below was measured today against
`team-review-round-2` HEAD, the two shipped `docs/images/*.png`, and the widget
artifacts rendered in a real Chrome at a real viewport — not read off a diff.

Tooling note, because it changes what we could see: the two README screenshots
are byte-identical to files still sitting in this session's scratchpad
(`gate-shot.png`, `gallery-shot.png`) alongside the HTML that produced them
(`gate-proof.html`, `gallery-shot.html`). That let us render the exact
documents the README publishes, in Chrome, and measure them. Most of what
follows comes out of that.

---

## Where we agree with R1, flatly

atlas: Sentinel's through-line is correct and it is the correct through-line for
us too. *A check that can only pass* has a design-layer twin: **a control that
can only look fine.** Four of our five findings below are that twin.

nova: Voyager §1 and Sentinel §1 are the same bug at two altitudes and both are
right. No argument, nothing to add, not re-filing either.

atlas: Pulsar §1 and Sentinel §5 (`needs_setup` on every keyless install) is the
single highest-value item on any of the eight lists. It is the first sentence
the system says about itself and it is wrong. Agreed at high, no dispute.

nova: Nebula §5 — the generated brain carrying no attribution and no next step —
is correctly filed and correctly reasoned. We looked for a reason to argue with
the fix and did not find one.

---

## Where we FIGHT

### atlas × nova vs Nebula §6 and §1: "one re-shoot, the capture path already exists"

nova: That sentence is false and it is the load-bearing part of the fix.

```
$ git ls-files | grep -iE 'shot|capture|screenshot|docs/images'
docs/images/render-gate.png
docs/images/review-gallery.png
```

Two PNGs. No script, no fixture, no HTML, no workflow. The documents that
produced them exist only in a session scratchpad that gets wiped. There is no
capture path in this repository; there was a capture *session*, and it is over.

atlas: Which matters beyond pedantry, because a re-shoot performed the same way
reproduces two defects the current shots already carry (findings 1 and 4 below).
Nebula's fix as written re-ships them. The sharpened version is in finding 4.

### nova vs Nebula §1's proposed remedy specifically

nova: Nebula offers two options — promote the flawed email to be the snippet, or
change line 20 to name what the shot actually is. Take the first. The second
leaves the README's best paragraph attached to a hedge, and that paragraph is
the only piece of writing in either repo that a sceptic can check in ten
seconds. Do not weaken it to make a stale asset survive; regenerate the asset.

### atlas vs Voyager §3's fix

atlas: Voyager says rewrite `skills/template-brain.md:136` down to the four
checks the generator emits. Correct, but the sentence to write is not a list of
four. The user needs to know *what the gate cannot see* — that is the thing that
gets someone hurt. The generated script's own header already gets this right
("the AUTHORITATIVE mobile check is an emulated-viewport render"). Copy the
script's honesty upward rather than trimming the skill's claim downward. Same
number of words, different job.

### nova, on Iris §1 and Nebula §3 (the word "Orbit" resolving to the corpse)

nova: Both right, and both understate the brand-system consequence by treating
it as a search-index problem. The registry entry's `title` field is literally
`"Orbit"` and is not indexed. That is not a naming accident to route around with
a description edit — it means the registry has no concept of a display name, so
**every** surface Orbit owns has to carry the package string verbatim or the
brand and the artifact are two different objects. Iris's fix (put "Orbit" in
`description`) is right and cheap. It is a workaround, not a resolution, and the
resolution is Nebula §2's: print
`io.github.justinwilliames/braze-lifecycle-mcp` everywhere a human is told how
to install. No new finding from us — just: do both, and do §2 first.

---

## RETRACTION — nova retracts the recommendation in her own R1 finding 1

nova: I filed `tap-min-token-unused` at a severity and with a fix that I now
think are both wrong. Retracting the sharp half.

What I claimed: `.o-btn`'s `min-height: 30px` against a declared-and-unread
`--tap-min: 44px` is "the same failure shape as the render-gate pill contrast
finding — the tool that fails customers for a bar it doesn't clear itself," and
the fix is `min-height: var(--tap-min)`.

Why that is wrong: **44px and 30px are answers to two different published
bars.** WCAG 2.2 SC 2.5.5 (Target Size, Enhanced) is 44×44 and it is **Level
AAA**. SC 2.5.8 (Target Size, Minimum) is **Level AA** at 24×24. A 30px button
clears the AA bar with six pixels to spare. Orbit's render gate cites 44 for
*emails* — a surface read on phones, where AAA is the right call and where the
gate's own copy says so. The widgets are a console inside a desktop host pane.
Holding a review console to the email bar is not consistency, it is a category
error, and I made it.

So: no hypocrisy finding here. There is no bar Orbit fails that Orbit enforces.
I withdraw that framing entirely.

What survives, at **low**: an unused token is a claim in the codebase with
nothing behind it, and the next person to read `tokens.js` will believe it.
Delete `--tap-min: 44px` from `server/ui/tokens.js:60`. Do **not** wire `.o-btn`
to it — the filter-chip rows in `qa-report.js` and `audit-report.js` are dense
by design and a 47% height increase on every chip is a real layout cost bought
for a AAA criterion nobody asked for.

atlas: Agreed, and I would have argued the other way an hour ago. The console is
also the surface most likely to be driven by keyboard, and 2.5.8 plus a visible
`:focus-visible` ring — which `tokens.js:231` already has — is the honest bar.

---

## SHARPENED — atlas's R1 finding 1 (`readystate-degrade-race-unfixed`)

atlas: The finding stands unchanged. What I got wrong is the mitigation I
credited it with. I wrote:

> The fallback isn't nothing — `render-gate.js`/`review-gallery.js` re-check
> `app` truthiness at click time and flash an honest message if it's null by
> then.

nova looked at what that message renders as. It is honest in words and lying in
colour. See finding 2. The fallback is weaker than I said, which raises the
value of fixing the race rather than leaning on it.

---

## The finding that needed BOTH lenses — finding 1

Neither of us files this one alone. nova sees three CSS rules that interact.
atlas sees the only artifact Orbit produces that reaches a person who does not
have Orbit. It is a layout bug in one lens and a distribution bug in the other,
and it is only worth a high severity in both at once.

---

## NEW FINDINGS

### 1. The standalone artifact's "Made with Orbit" signature is rendered exactly one pixel below the fold and clipped, in all five widgets — HIGH

nova: `server/ui/shell.js:300` — `orbitSignStandalone()` — appends a row to
`document.body`. Its comment is unusually clear about why it exists:

> A shared artifact is the only object Orbit produces that reaches someone who
> does not have Orbit installed — and it carried the product name in a `<title>`
> tag and nowhere else: no link, no footer, nothing that survives a screenshot.
> That is a K-factor of zero by omission, on the one surface that leaves the
> building.

Every widget's CSS opens with the same two rules:

```
$ grep -n "^body { height: 100vh" server/ui/widgets/*.js
audit-report.js:27   diagram-view.js:26   qa-report.js:25
render-gate.js:42    review-gallery.js:94
```

`body { height: 100vh; overflow: hidden; }` and `.wrap { … height: 100vh; }`.
The wrap consumes the entire body box; the appended row starts at the next
pixel; `overflow: hidden` means nothing can scroll to it.

Measured in Chrome at 1400×900, against the exact two documents the README
publishes:

```
==== render-gate ====
  vh: 900   bodyOverflowY: "hidden"   bodyHeight: 900   wrapHeight: 900
  signatureExistsInDom:     true
  signatureText:            "Made with Orbit — a free lifecycle marketer, built into Claude."
  signatureRect:            { top: 900, bottom: 938, h: 38 }
  signatureInsideViewport:  false
  signatureVisibleToUser:   false

==== review-gallery ====
  … identical: top: 900 in a 900px viewport, false, false
```

`top: 900` in a `900` viewport is not a near-miss at one size. `.wrap` is
`100vh`, so the row starts at the fold at *every* viewport height, on every
device, forever. It is deterministic.

atlas: And there is photographic confirmation already in the repository, which
is what moves this from a CSS nit to the finding I would put first.
`docs/images/render-gate.png` and `review-gallery.png` are byte-identical
captures of these two documents:

```
$ shasum -a 256 docs/images/render-gate.png <scratch>/gate-shot.png
be4df032b109bec8f8976ce335ac91eee89a9fac4119422e4c8afe4ca6ab3485  (both)
$ shasum -a 256 docs/images/review-gallery.png <scratch>/gallery-shot.png
8083b4f809675099c2684345390cd62a7fbc048f2bf9871ae62e989f0175f7c8  (both)
```

The string "Made with Orbit" is in both source documents. It is in neither
picture. The repository is already publishing the evidence that its own
attribution row does not exist.

This is the round's hunted shape, in the design layer. The code runs. A DOM
assertion passes — the node is there, with the right text, with a working link.
Every check anyone would write returns true. No human has ever seen it. It is
the same class as the rail bug the screenshot commit itself celebrates catching
("Both are spans with no `display:block`. Every DOM assertion passed the whole
time"), found the same way, one file over.

**Fix**, and it is small: in `orbitSignStandalone()`, don't append into a body
that is exactly `100vh`. Either set `document.body.style.height = "auto"` before
appending (the standalone path has no host chrome to fight), or make the row
`position: fixed; bottom: 0` like `.o-bridge-note` already is and give `.wrap`
a `padding-bottom` on the standalone path only. Then add the test that would
have caught it: render a standalone artifact and assert
`getBoundingClientRect().top < innerHeight` on `.o-made-with` — a rect
assertion, not a `querySelector` assertion. That distinction is the whole
lesson.

Severity high on the round's own bar: this is the single organic-distribution
surface in the entire product, it was built on purpose, and it has been shipping
blank. Actionable: yes, two lines plus one test.

### 2. `flash()` was deduped into the shell; `.sent` was not — every failure message renders in the success colour, five times over — MEDIUM

nova: Round 1 correctly pulled `flash()` out of five widgets into
`WIDGET_PRELUDE`, with a comment naming exactly why it mattered:

> …every copy wrote into a plain `<span>` — so a screen-reader user got no
> notification at all when Copy succeeded, when Send failed, or when the host
> channel had degraded. Those are precisely the messages that carry the outcome
> of the only actions a widget offers.

The JavaScript got deduped. The stylesheet did not:

```
$ grep -n "^\.sent" server/ui/widgets/*.js
audit-report.js:68    .sent { font-size: 11.5px; color: var(--ok-strong); }
diagram-view.js:88    .sent { font-size: 11.5px; color: var(--ok-strong); }
qa-report.js:62       .sent { font-size: 11.5px; color: var(--ok-strong); }
render-gate.js:72     .sent { font-size: 11.5px; color: var(--ok-strong); }
review-gallery.js:186 .sent { font-size: 11.5px; color: var(--ok-strong); }
```

Five identical copies, all hardcoded to `--ok-strong` — the green the pill
system reserves for a pass. Six of the eighteen `flash()` call sites are
failures:

```
audit-report.js:296     flash("Copy blocked by the host.")
qa-report.js:244        flash("Copy blocked by the host.")
diagram-view.js:297     flash("Copy blocked by the host.")
render-gate.js:969      flash("Report copied.") / :968 catch → "Copy blocked by the host."
render-gate.js:954      flash("No host channel — use Copy report instead.")
review-gallery.js:417   flash("No host channel — use Copy review instead.")
review-gallery.js:438   flash("Copy blocked — select the notes manually.")
```

Rendered, not reasoned. Chrome, dark scheme, 1400×900, the shipped render-gate
artifact — the degraded-send line comes up green above the buttons:

> `No host channel — use Copy report instead.`  ← `--ok-strong`

atlas: This is the sharpening of my own R1 finding. I called that click-time
message "an honest message," and in text it is. A user scanning a console reads
colour before words; green next to a disabled primary button says *done*, and
the sentence saying otherwise is 11.5px. It is my pet hate with the sign
flipped — not status carried by colour alone, but colour actively contradicting
the only other channel. The round-1 fix gave this element a correct accessible
name and left the visual channel wrong, which means the screen-reader user is
now better served than the sighted one.

**Fix:** give `flash()` a tone. `flash(msg, tone)` where tone defaults to `ok`
and the failure call sites pass `warn`; the function sets
`el.dataset.tone = tone`, and the five `.sent` rules collapse into one in
`ORBIT_BASE_CSS` with `.sent[data-tone="warn"] { color: var(--warn); }`. Same
move the JS dedupe already made, one layer down. Fifteen minutes.

Severity medium: small, but it is the confirmation channel for every action
every widget offers, and it is currently incapable of reporting a failure.

### 3. The bridge-failure banner covers the Copy button it tells you to use — MEDIUM

atlas: `.o-bridge-note` (`tokens.js:236`) is `position: fixed; left: 0;
right: 0; bottom: 0`. Its comment states the design intent:

> Fixed to the bottom edge so it is visible in any widget layout **without the
> widget having to reserve a slot for it.**

Not reserving the slot is the bug, written down as the feature. Measured, by
appending the exact node `shell.js:279-283` appends, into the real render-gate
document at 1400×900:

```
bridgeNoteRect:            { top: 872, bottom: 900, h: 28 }
copyRect:                  { top: 858, bottom: 890 }
noteOverlapsCopyButton:    true
elementOnTopOfCopy:        "o-bridge-note"
interactiveElementsUnderNote: ["finding", "copy", "send"]
```

`document.elementFromPoint()` at the centre of the Copy button returns the
banner. The banner has no `pointer-events: none`. So in the one state this
banner exists for, the sentence *"findings can be copied but not sent back to
Claude"* sits on top of, and swallows the click on, the Copy button — plus the
Send button and the last finding in the rail.

Review-gallery is luckier by 68 pixels (`noteOverlapsCopyButton: false`) but the
banner still covers the reviewer's `#notes` textarea, which is the only place a
"needs changes" verdict acquires a reason.

nova: Worth being precise about when this is reachable, because it composes with
two other findings and only bites in one specific world. The banner requires
`orbitEmbedded && ORBIT_BRIDGE_ERROR` — embedded, with the bridge script
genuinely missing. atlas's `readystate-degrade-race` means the async-failure
path never reaches here. Sentinel §2 describes exactly how the synchronous path
becomes reachable: the build-time assertion that the bridge is inside the bundle
resolves upward and cannot fail, so one `npm prune` away, **every** embedded
install lands in this state — and then every render-gate user gets an error
banner sitting on the button it recommends. Three findings, one failure.

**Fix:** `pointer-events: none` on `.o-bridge-note` is the one-line floor, and
it is not enough — the note would still hide the control. Do it properly: when
the note is injected, set `document.body.style.setProperty("--o-note-h", h)` and
have the widgets' `.wrap` carry `height: calc(100vh - var(--o-note-h, 0px))`.
The widget then reserves the slot the comment says it shouldn't have to, and the
comment gets rewritten to say why it does.

Severity medium: it is a conditional state today, and Sentinel's finding 2 is
the condition. Actionable: yes.

### 4. Both README hero shots are captures of the bridge-less standalone artifact, so both advertise the Claude-integration control dead — and the commit says otherwise — MEDIUM-HIGH

atlas: Distinct from Nebula §1, which is about *which email* is in the picture.
This is about *which product state* is in the picture, and it is visible in both
shots without reading any code.

In `render-gate.png`, bottom right: **Copy report** is the primary indigo
button; **Send to Claude** is grey and disabled. In `review-gallery.png`:
**Copy review** primary, **Send review to Claude** grey and disabled. That
inversion is not decoration — it is precisely what `orbitDegradeWithoutHost()`
does when there is no host:

```js
send.disabled = true;
send.classList.remove("o-btn--primary");
const copy = document.getElementById("copy");
if (copy) copy.classList.add("o-btn--primary");
```

Measured on the source documents:

```
send: { disabled: true, className: "o-btn",
        title: "No host to send to in a standalone copy — use Copy instead." }
copy: { className: "o-btn o-btn--primary" }
```

Both source files carry `window.OrbitApp = null` and
`window.ORBIT_BRIDGE_ERROR = null` — the standalone path, by construction.

The commit that added them (`90fad0c`) says:

> Item 4 closed: the widgets were driven through the live MCP server after a
> Claude Desktop restart, not just built. … Both captured, both real.

The measurements may well have come from a live run — we are not disputing the
findings in the panel, and Nebula already established they are from a real,
deliberately-flawed email. But the *pictures* are renders of the standalone
export, not of the widget inside Claude Desktop, and the disabled button is the
tell. A claim of provenance that the artifact itself contradicts is the same
shape as everything else this round is hunting; it just happens to live in a
commit message.

nova: The cost is not the commit message, it is what the two pictures teach a
stranger. The single thing that makes these MCP App widgets rather than HTML
files is the round-trip back to Claude. Both hero images show that control
greyed out, with no caption explaining why, directly under a README paragraph
about what Orbit does inside Claude. A reader who notices reads it as "the
integration doesn't work." A reader who doesn't notice learns nothing, and the
widget's entire differentiator went unphotographed.

**Fix**, which is also the fix to the "no capture path" fight above — one
script, `scripts/capture-widget-shots.mjs`, committed, that:
(a) renders each widget with a stubbed `window.OrbitApp` so the embedded state
    is what gets photographed and **Send to Claude** is live and primary;
(b) runs after finding 1's clip fix, so the signature row is in frame;
(c) crops to the widget rather than the viewport (Nebula §6's third point,
    which is equally true of `render-gate.png` — its email card is 225px of
    content in a ~700px stage);
(d) emits the light and dark pair (finding 5).
Then Nebula's §1 and §6 re-shoots become `node scripts/capture-widget-shots.mjs`
instead of a session someone has to recreate from memory.

Severity medium-high: the README is the front door, these are its only two
pieces of visual evidence, and both currently depict a degraded state.

### 5. No dark variant for either README image, from the product that ships `orbit_dark_mode_check` — LOW

nova: `README.md` embeds both PNGs as plain markdown images. GitHub serves the
README in the viewer's theme; roughly half of them get a 1400px near-white slab.

The irony is only worth mentioning because the fix is free. The widget system is
genuinely theme-complete — `tokens.js` carries
`@media (prefers-color-scheme: dark)` plus `:root[data-theme="dark"]` and
`[data-theme="light"]` overrides, and the header comment explains the discipline.
We rendered both artifacts at `colorScheme: "dark"` and they are good: the chrome
inverts cleanly, the FAIL/WARN pills hold, and `.o-stage` correctly stays light
because a reviewer must see the email as a recipient would. That last detail is
a genuinely sharp call and it is invisible in the light capture — the dark shot
is the *better* advertisement for the design system.

**Fix:** `<picture>` with `<source media="(prefers-color-scheme: dark)">` in the
README, and one `colorScheme` flag in finding 4's capture script. Zero new
craft.

Severity low, and we will say so plainly: on its own this does not make Orbit
more findable to a stranger and it should not be scheduled on its own. It costs
one line inside a fix that is already happening.

---

## What we checked and are NOT filing

- **`flash()`'s live region actually being live.** We suspected the round-1 fix
  stamped `role`/`aria-live` at call time in the same task as the text mutation,
  which is the classic non-announcing pattern. It doesn't matter: all five
  widgets already carry `role="status" aria-live="polite"` in their markup
  (`grep -n 'id="sent"' server/ui/widgets/*.js`), so the region is registered at
  parse time and the call-time stamp is a belt-and-braces no-op. Genuinely
  fixed. atlas's R1 verification holds.
- **Screenshot legibility at GitHub's rendered width.** We downscaled both PNGs
  to 830px — GitHub's README column — and looked. The mono ratio strings the
  README asks the reader to "note" survive it. On a non-retina display it is
  tight, but it reads. Not a finding, and we are not padding.
- **`.o-stage` staying light in dark mode.** Deliberate, commented, correct.
- **Every `@media` breakpoint across the widget set.** Re-swept; the three
  rail/main layouts all stack rather than hide, consistently. Closed last round,
  still closed.
- **The 26-field flat credential form in `manifest.json`.** Third round. The
  ordering mitigation shipped; the structural grouping still depends on a
  platform primitive nobody has verified exists. Filed once, not filing again.
- **`--tap-min`.** Retracted above, not re-filed.

---

## The one-line version

nova: The dedupe fixed the copy that was right and left five copies of the one
that's wrong.

atlas: And the row built so a shared artifact carries the product's name out of
the building renders exactly one pixel below the fold, in every widget, at every
viewport — which the repository's own two screenshots have been quietly proving
since 11:33 this morning.

— Atlas × Nova
