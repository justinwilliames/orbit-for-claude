> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Nova (Product Design, UI + craft)

## Verdict

The ESP matrix is broken, the fix is small, and it has been sitting reverted since 2026-08-24 because the last attempt fixed the wrong element. The bug isn't `.grid-box` — it's `.body` clipping instead of scrolling. Fix the ancestor, not the child, and the previously-reverted regression (child overflowing parent, detail panel on top) cannot recur, because there's nowhere left for it to overflow *to* — the whole body scrolls instead of hard-clipping.

## Top 3 findings

**1. [instrumented: headless Chrome, 900×520, `mcp__Claude_Browser`] `.grid-box` collapses to near-zero in both themes — root cause is `.body`'s `overflow: hidden`, not the grid.**
Loaded `orbit-esp-matrix-html.data.html`, ran `document.querySelector('.grid-box')`:
- Light: `clientHeight: 45`, `scrollHeight: 592`. Ratio 13.2×. 8 `<tr>` in the DOM, 0 visible past the sticky header.
- Dark: identical — `clientHeight: 45`, `scrollHeight: 592`. Screenshotted; confirms visually, zero data rows under "Operation / Braze / Iterable…".
My number (45px) differs from EVIDENCE.md's same-session re-measure (0px) — different render pass, same defect class, well past the `scrollHeight > clientHeight * 3` signature either way (592 > 135).
Root cause, traced in the markup: `.body { flex:1; min-height:0; overflow:hidden }` wraps two sibling `<section>`s — `.card-grid` (flex:1, wants the remainder) and `.card-detail` (flex:0 0 auto, capped at 32%). When the legend wraps to 3 lines, `.card-detail`'s content plus the fixed chrome eats the box, and `.card-grid`'s "remainder" rounds to nothing. `overflow:hidden` on `.body` means there's no relief valve — the grid doesn't get to say "I need more," it just clips.

**2. [instrumented] Sweep of all 23: only 1 of 23 could actually be measured with data — the fixture gap in EVIDENCE.md's point 3 is the real blocker, not more QA.**
I navigated and measured `clientHeight`/`scrollHeight` on the primary content element of all 23 widgets at 900×520 (24 page loads — esp-matrix has empty + data states). 22 of 23 are empty-state only; every one comes back with `clientHeight === scrollHeight` (no overflow possible — there's nothing to overflow). Applying the calibrated signature (`scrollHeight>150 && clientHeight<150 && scrollHeight>clientHeight*3`) to what I actually measured: **1 hit, esp-matrix, real data.** The two other historically-flagged widgets — `client-matrix.js` `.rail-list` and `render-gate.js` `.rail-list`, both carrying the byte-identical `flex:1; min-height:0` pattern inside a `100vh`/`overflow:hidden` ancestor — I could not reproduce this session; no populated fixture exists for either. That's a **[judgement]** carry-forward of the 2026-08-24 finding, not a fresh instrument reading. Until those 22 fixtures exist, "18 clean" is unverified, not confirmed.

**3. [instrumented: computed contrast, WCAG relative-luminance formula] The ESP matrix's doc-URL link fails AA contrast in dark mode only — 3.89:1 against a 4.5:1 floor.**
`esp-matrix.js:222`, `.d-row a { word-break: break-all; }` — no color. It inherits from `tokens.js:200`'s global `a { color: var(--brand-strong) }`, so this is NOT the generic-system-blue defect I went looking for (that check came back clean, worth saying so it's not silently skipped). But `--brand-strong` resolves differently per theme: light mode link `rgb(79,70,229)` on `rgb(255,255,255)` card = **6.29:1** (passes). Dark mode link `rgb(99,102,241)` on `rgb(23,26,36)` card = **3.89:1** (fails AA-normal-text 4.5:1; the link text is 12px, not large-text-exempt). One token, one theme, one failing number.

## The single thing I'd ship

The `.body`/`.card-grid`/`.grid-box` diff in `server/ui/widgets/esp-matrix.js`:

```css
/* line 137 */
.body { flex: 1; min-height: 0; padding: 14px 18px 14px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
/* was: overflow: hidden */

/* line 139 */
.card-grid { flex: 0 0 auto; display: flex; flex-direction: column; }
/* was: flex: 1; min-height: 0; */

/* line 161 */
.grid-box { flex: 0 0 auto; min-height: 220px; max-height: 46vh; margin-top: 10px; overflow: auto; border: 1px solid var(--rule); border-radius: var(--radius-sm); }
/* was: flex: 1; min-height: 0; */
```
`.card-detail`'s existing `flex: 0 0 auto; max-height: 32%; overflow: auto;` is untouched — it still gets a percentage of `.body`'s definite height (unchanged, since `.wrap` still fixes `height:100vh`). What changes: the grid gets a guaranteed 220px floor instead of losing a space fight, and if the total (legend + 220px grid + detail + chrome) exceeds the pane, `.body` scrolls instead of clipping — which is the fix the 2026-08-24 note asked for and never got, because the previous attempt hardcoded the child's `min-height` while leaving the parent's `overflow:hidden` in place, so the overflow had nowhere to go but on top of the detail panel. Removing the clip is what makes the floor safe.

## What I'd defer

Applying the identical pattern to `client-matrix.js` and `render-gate.js` `.rail-list` — same signature, same fix shape (`.rail` gets `overflow-y:auto`, `.rail-list` gets `flex:0 0 auto` + a floor) — but I'm not shipping a diff against a claim I can't back with this session's numbers. Needs the dummy fixtures from EVIDENCE point 3 first, then the same measure-then-fix pass. Also deferring: `send_calendar`'s real-screenshot clip (EVIDENCE point 2) — empty state came back clean (366/366), so I have nothing to diff against; same fixture gap.

## Question for Sentinel

Asked aloud via say.sh: "Sentinel, before I ship the grid-box scroll fix: is esp-matrix even wired to a widgetMeta call site, or am I fixing a screen nobody can reach?"

— Nova
