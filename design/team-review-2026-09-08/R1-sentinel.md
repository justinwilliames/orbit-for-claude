> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R1 — Sentinel (engineering / QA)

## Verdict

**There are no orphans — all 23 widgets are reachable, the SEVERE esp-matrix defect is fully live in front of users, and the suite that passes 144/144 contains not one line of layout measurement.**

---

## Finding 1 — `[instrumented]` The orphan hypothesis is dead. EVIDENCE.md §4 is wrong, and it is wrong because it searched one file.

§4 suspected `esp-matrix`, `flow-audit` and `ab-readout` were unattached. All three are attached.

- `ab-readout` — `server/index.js:6455`, `_meta: widgetMeta(AB_READOUT_URI)`. §4 says "no call site found"; the required grep prints it as the last of 21 lines.
- `esp-matrix` — **`server/esp/tools.js:446`**, inside the `orbit_esp_capabilities` definition.
- `flow-audit` — **`server/esp/tools.js:681`**, inside `orbit_klaviyo_flow_audit`.

The arithmetic that fooled the pack: 21 `widgetMeta()` sites in `index.js` across **21** distinct URIs (not 20 — `grep -o "widgetMeta([A-Z_]*)" server/index.js | sort -u | wc -l` → `21`), plus 2 in `server/esp/tools.js` = 23, against 23 `ORBIT_WIDGETS` entries. Exact.

Grep is not a verdict, so I asked the running server. I booted the real MCP client via the existing harness and inverted the binding direction:

```
live tools: 135 | tools declaring a widget: 23 | distinct uris claimed: 23 | widgets registered: 23
REACHABLE  ui://orbit/esp-matrix.html            <- orbit_esp_capabilities
REACHABLE  ui://orbit/flow-audit.html            <- orbit_klaviyo_flow_audit
REACHABLE  ui://orbit/revenue-attribution.html   <- orbit_audit_attributed_revenue
REACHABLE  ui://orbit/preheader-clip.html        <- orbit_score_preheader
... 23/23, orphans: []
```

Probe saved beside this file as `sentinel-reverse-binding-probe.test.mjs` — lift it, don't rewrite it. Repo source untouched (`git status --porcelain` shows only `design/`).

**Consequence: the priority does not collapse. It holds.** `orbit_esp_capabilities` is a zero-credential, zero-network tool — the cheapest thing in Orbit to call and therefore among the likeliest to be called. Its widget renders column headers and zero data rows.

## Finding 2 — `[instrumented]` The gate that should have caught this is **absent**, and the gate that exists cannot catch an orphan by construction.

Both suites pass, and neither measures anything:

```
28-widgets.test.mjs   → # tests 144  # pass 144  # fail 0
29-widget-contrast    → # tests  12  # pass  12  # fail 0
```

```
grep -niE "puppeteer|playwright|clientHeight|scrollHeight|getBoundingClientRect|jsdom|viewport|offsetHeight" \
  tests/suites/28-widgets.test.mjs tests/suites/29-widget-contrast.test.mjs
→ (no matches)
```

156 assertions about arithmetic, string handling and contrast maths. Zero about whether the box is tall enough to show them. `.grid-box` at `clientHeight: 0` is not a regression the suite let through — it is outside the suite's universe.

Worse, the knowledge already exists and was never made executable. The detection signature sits at `scripts/render-widgets.mjs:47`, in a **comment**:

> `sh > 150 && h < 150 && sh > h * 3` … "A first pass at this used h < 70 and cheerfully reported zero defects while the 71px case sat in front of it"

That paragraph is a better gate than anything in `tests/`, and `grep -rn "render-widgets" package.json .github/ tests/` returns nothing — the renderer is invoked by no npm script and no CI workflow. Prose in a manual-only script is documentation of a defect, not defence against it.

And the binding gate is hand-maintained. `TOOL_WIDGETS` (`28-widgets.test.mjs:62`) is a literal map of **20** entries against 23 registered widgets; `flow-audit`, `revenue-attribution` and `preheader-clip` are absent from it. Both its assertions run tool→URI. A widget nobody adds to the map is invisible in both directions — which is precisely why this question needed a person and a Round 1 to answer. `ORBIT_WIDGETS` is imported at line 34 and never used for binding.

## Finding 3 — `[instrumented]` The model sees everything; only the human is blinded. That changes what the fix is for.

I called the tool through the harness:

```
text bytes: 39810 | structuredContent.platforms: 6 | rows in first platform: 8
```

The full 39.8KB payload reaches the conversation whether or not the grid draws a single row. So this is a pure human-display defect — no model-context loss, no wrong answers downstream. It is the marketing surface and the human reader that break, which is exactly the axis this review cares about. (Separately: 39.8KB of JSON per call is a context cost worth someone's attention — not mine this round.)

`[judgement]` Blast radius: I counted `flex:1` + `min-height:0` in all 23 widget sources. Every one carries it. Six carry the denser 4× form — `client-matrix`, `design-system`, `diagram-view`, `esp-matrix`, `render-gate`, `review-gallery` — and three of those six are the three known failures. That is a shared shell idiom, not three bugs, and any fix must be made once in the shell.

---

## The one thing I would ship

**Make the comment executable.** One new suite that renders each populated widget at the host pane's real height and fails on `sh > 150 && h < 150 && sh > h*3`, plus a reverse-binding assertion derived from `ORBIT_WIDGETS` rather than a hand-typed map. Today it would go red on three widgets — that is the point. A gate that has never been red has never been tested.

## What I defer — not my call

The structural fix itself (body-scroll vs. the reverted `min-height:260px`) is Nova's, and it needs host-pane verification via Codex Computer Control before anyone calls it fixed. Which widgets earn a place on yourorbit.team is Iris and Nebula's. The 22 missing dummy fixtures are the gating dependency for both and for any honest QA — flagging, not claiming.

## Question — asked aloud, to Nova

> **Nova — before you design the body-scroll fix: is 900×520 the real Claude Desktop pane, or an assumption we inherited? Every ratio in this pack is calibrated to it, and if the actual pane is shorter then `clientHeight: 0` is the layout behaving correctly under a constraint nobody measured — which is a different bug with a different fix.**

Will this still be debuggable in six months? Only if the signature stops being a comment.

— Sentinel
