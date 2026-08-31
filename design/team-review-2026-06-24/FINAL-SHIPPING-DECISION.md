# Final Shipping Decision — Dashboard 1722536

**Date:** 2026-06-24
**Target:** PostHog "[CLM] High-Level — Weekly Review" (project 103224, dashboard 1722536)
**Review:** full-team-product-review, 7 personas × 5 rounds. **Result: 7 agree-with-caveat, 0 blocks → SHIPPED.**
**Constraint honoured:** no existing insight was modified or deleted. Three new insights created and added to the board.

---

## The three principles the team shipped against

- **P1 — Open in the present tense.** The board's first content tile answers "is the subscription base healthier or sicker than last week, and do I act today?" Monthly is context beneath, never above.
- **P2 — Honest numbers or no number.** Week-bucketing, churn source, and at-risk logic lifted verbatim from tile 5 (insight 8931000). Partial periods are marked (projected-close line + "this week = last completed week"). Source asymmetry documented in-band.
- **P3 — Earn the pixel, hard stop at three.** Every new tile names the Monday decision it changes. Three new tiles; no more.

---

## What shipped (3 new tiles, top of board)

| Order from top | Tile | short_id | Type | Decision it serves |
|---|---|---|---|---|
| 1 | **[CLM] This Week — Subscription Base Health** (Hero) | `8lWUBLKM` | Table | Is the base healthier/sicker than last week? Act today? |
| 2 | **[CLM] Monthly Churn % — Actualised vs Headline (incl. MTD)** | `ZLydJ8Lt` | Bar + projected-close line | Is monthly churn on track to beat/miss last month? |
| 3 | **[CLM] Weekly Subscription Movement (Volume)** | `kw3o0bu3` | Grouped bar | Is a churn/pause spike a real trend or AU-seasonal? |

All three: `[CLM]` named, `clm` tagged (NOT `data-hq` — Warwick's namespace), board 1722536 only (NOT the HQ board 1459187). Each query carries a drift-anchor block comment citing insight 8931000.

### Data-grounded correctness wins
- **The `pauseType` trap was caught in the data, not the docs.** The documented filter `pauseType != 'cancellation_request'` would have dropped EVERY true pause (their `pauseType` is NULL → `NULL != x` → NULL → excluded). The real, verified true-pause filter is `newState='paused' OR pauseType='finite'`.
- **Reconciliation audit passed (Han/Sloan binding gate):** `churn ∩ pause same week = 0` orgs. No bar double-counts an org against itself. Cross-series overlaps (churn∩resume=10, pause∩resume=7, new∩churn=2) are distinct metrics by design, not double-counts.
- **MTD honesty (NEW-2):** current month shown as partial with a distinct projected-close line (June: 4.3% actual → 5.37% projected, day 24/30). Never reads as a real trough.
- **NEW-2 reconciles to the hand-typed text tile:** May 8.52%/15.93% vs the text tile's ~8.42%/15.82%.

---

## The seven sign-offs (all AGREE, caveats tracked)

1. **Sloan (Eng):** Agree — caveat: overlap audit is a pre-ship gate. ✅ Ran it; churn∩pause = 0.
2. **Yuki (UX):** Agree — caveat: MTD projected series visually distinct, not caption-only. ✅ Rendered as a distinct overlay line (`#7F1D1D`, labelled "projected close").
3. **Marcus (UI):** Agree — caveat: explicit per-series colour set at creation (PostHog auto-colour is permanent under the constraint). ✅ All series colours set at create time.
4. **Aja (Creative):** Agree — caveat: hero must render full-width (w:12). ⏳ **One manual step left** — resize via MCP isn't supported; drag the hero tile to full-width (10 sec).
5. **Devi (Growth):** Agree — caveat: NEW-1 description names AU seasonality as its decision. ✅ Description names winter-trades dip / post-EOFY.
6. **Han (Data):** Agree — caveat: audit runs before pin, else NEW-1 stays hidden. ✅ Audit ran and passed; NEW-1 pinned.
7. **Priya (CoS):** Agree — caveat: text-tile staleness convention is a named loose end. 📋 Documented for Justin (below).

---

## Open loose ends for Justin (non-blocking)

1. **Hero full-width (Aja):** drag the top "This Week — Subscription Base Health" tile to full width. ~10 seconds. Only cosmetic; table is legible at half-width too.
2. **Reading order:** new tiles inserted at TOP (Hero → NEW-2 → NEW-1), pushing the hand-typed narrative text tile down. If you want the narrative first, drag it back above the hero. The team's view (Aja) is that a present-tense verdict opener is *correct* above the narrative.
3. **Text-tile staleness (Priya):** NEW-2 now carries the monthly churn % live, so the figures half of the narrative text tile is redundant — keep the text tile for the *story*, not the numbers, and let it go stale-gracefully.
4. **Defer (out of scope this session):** moving the existing monthly tiles off this board, and annotating tile 5 itself — both require touching existing tiles, which the constraint forbade.

---

## Orchestrator send-off

Seven lenses, five rounds, three tiles. The board now opens in the present tense, every new number reconciles to the source of truth tile 5 already trusted, and the one piece of folklore that would have quietly broken it — the documented `pauseType` filter — was caught by looking at the actual data instead of the docs. Nothing existing was touched. One 10-second drag stands between this and a clean full-width finish.

— Caldwell, orchestrating for Sir
