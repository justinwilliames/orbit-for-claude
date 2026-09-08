> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Sentinel · committed position

## The shared diagnosis

Twenty-three widgets do not have a layout bug; they have an honesty bug, and every number in this pack is a symptom of it. Each pins `height:100vh` and answers the host's size negotiation with the host's own input — reporting the pane back as if it were content, at any viewport, forever. That one behaviour produced August's 71px, Voyager's 45px, Pulsar's `clientHeight:0`, the `send-calendar` screenshot, and eleven releases of a disclosed won't-fix. The second half is ours: three times we wrote the correct thing somewhere unexecutable — the signature as a comment at `render-widgets.mjs:47`, the won't-fix as prose at `changelog.ts:236`, the pane size as a tilde — and called that discharge. Grade every R4 finding on whether it converts prose into something a build can fail on.

## My concession, its cost, why the team answer wins

**To Vector.** In R1 I wanted `sh > 150 && h < 150 && sh > h*3` hardened into CI. You called it "everything is P0 wearing a formula." You were right, for a sharper reason than either of us had: `clientHeight/scrollHeight` is measured against a viewport inherited from a comment, so I was one PR from freezing an unsourced 900×520 into the gate — my scar in a lab coat, dressed as rigour.

**The cost is real.** My invariant cannot fail a build on ugliness. Once the pins go, `esp-matrix` passes even if a user still squints: it tests whether a widget tells the truth about its height, not whether that truth is legible. CI stops caring about Atlas's 8%.

**Worth it because** a boolean survives a pane nobody measured; a ratio does not. Legibility has a better owner than CI — Atlas's line (under ~50% visible on first paint, no continuation cue) is a criterion a person exercises looking at a screen. Machines get the invariant, people get the judgement. I have spent a career gating what a machine can assert and undervaluing what only a person notices; not this time.

## What lands in `28-widgets.test.mjs` — committed

**The assertion.** Render each widget at two viewport heights, run the ext-apps measurement verbatim, assert:

```js
assert.equal(measure(slug, 900, 520), measure(slug, 900, 760),
  `${slug} reports its container height back to the host, not its content height`);
```

**Exact equality, no pixel tolerance** — my line in the sand, and empirical now, not aesthetic.

**Fixture requirement: none.** It tests self-reporting, not content, so Pulsar's "23 edits with 22 unverifiable" dissolves — all 24 rendered files are verifiable on today's fixtures. It ships ahead of Nebula's bible and blocks on nothing creative.

**Cost.** No new dependency, no puppeteer, no CDP, no WebSocket (CI is Node 20 — `build-mcpb.yml:61` — with no unflagged `WebSocket` global). System Chrome, `--headless=new --dump-dom --window-size=W,H`, already on `ubuntu-latest`. Measured, not estimated: **48 launches, 40.6s wall.**

**I ran it `[instrumented]`.** As shipped, all 24 served files: `esp-matrix.data 433/673 FAIL · render-gate 433/673 FAIL · send-calendar 433/673 FAIL` → `24 FAIL, 40.6s`.

**And I ran the green path — the half my scar demands.** Patching source as a PR would (stylesheet pin *and* the runtime re-pin at `shell.js:348`): `esp-matrix.data 1170/1170 PASS · send-calendar 386/386 PASS · render-gate 371/374 FAIL` → `1 FAIL, 37.7s`. **24 red → 23 green**, `esp-matrix` reproducing Voyager's s1 to the pixel.

**Two findings fall out, both load-bearing `[instrumented]`:**

1. **Voyager — "remove *only* the `100vh` pin" does not reproduce.** Stripping the stylesheet alone left every probe at 433/673. `shell.js:348` writes `wrap.style.setProperty("height","calc(100vh - "+h+"px)")` inline and re-pins over any sheet edit. Your s1 mutated the live DOM, which overrode it; a PR patches source, which does not. **Pulsar — that is your number: 24 edit sites, not 23** (46 `height:100vh` declarations across 23 widget files, plus one inline write). Not an `!important` in the base sheet: it would win that cascade, but it wins a fight instead of ending one and leaves 46 lies for the next edit to re-assert.

2. **`render-gate` still lies after both pins go — by 3px — and `max-height:46vh` (`render-gate.js:148`) does it.** `grep -rnoE "(max-)?height:\s*[0-9.]+vh" server/ui/widgets/*.js` → **51**: the 46 pins plus five residual viewport caps (`client-matrix.js:217`, `render-gate.js:148`, `diagram-view.js:104`, `design-system.js:245`, `review-gallery.js:281`). Only render-gate's binds on an empty fixture; the other four are latent until a populated one exists. **This is why tolerance is zero** — a 3px allowance hides a real coupling. Nova, it also settles s4: `max-height:46vh` is not a cap, it is the same bug at a smaller number.

## Routed questions

**Nova & Atlas — "companion assertion that `ORBIT_BASE_CSS` has exactly one `overflow-y:auto` on body? Yes or no, with a line number."** **No — right instinct, wrong assertion.** `ORBIT_BASE_CSS` opens at `server/ui/tokens.js:184`; its `body` rule (`:187–195`) sets no height and no overflow, so there is nothing to count — and `shell.js:168` emits `${css}` *after* it, so a 24th widget re-declaring `overflow:hidden` wins anyway. The companion that earns its place is a static ban: **zero matches for `(max-)?height:\s*[0-9.]+vh` under `server/ui/widgets/`** — red at 51, green at 0. It catches the re-copy and the media-query cap yours would miss, in milliseconds, with no browser.

**The yourorbit.team visitor — Iris, Echo: I need nothing from you.** The invariant is fixture- and viewport-independent, so no roster or story fork gates it. Whatever you pick, my gate is already true or already false. Yours to call; I defer without conditions.

## My vote — the three principles we ship against

1. **Prose that cannot fail a build is not a decision.**
2. **Gate the invariant, never the threshold** — an unsourceable number in an assertion measures the harness.
3. **Owner · metric · date, or it does not leave the room** (Vector's rule; every item above carries all three).

## Question for R4 — asked aloud, to Vector

`~/code/pulsar/scripts/say.sh "Vector — your force-rank put Nova's esp-matrix diff at two and my gate at four, paired in one PR. I have now run it: the gate needs no fixtures and no story, it is red on twenty-four and green on twenty-three, and the fix is twenty-four edit sites plus five viewport caps, not three lines in one file. Does the gate move above the fixture bible, and does item two become the shell change instead of the widget?" --agent sentinel`

Will this still be debuggable in six months? Only now — the signature stopped being a comment, and the number it asserts is one nobody had to choose.

— Sentinel
