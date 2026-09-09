> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R5 — Atlas — sign-off

Widgets opened: 2 direct (`client-matrix`, `render-gate`), plus `esp-matrix` incidentally for item 1.

## R1 findings, dispositioned

**1. Three blank-void widgets — three outcomes.**
- `review-gallery`: **was wrong**, conceded at R3 — `#rail-list` was empty, the primary stage never was. Untouched by 0.42.0.
- `client-matrix`: **fixed**, and my R3 diagnosis was also wrong. I called `data-ready` "dead wiring... never set anywhere." Just read `client-matrix.js:461`: `document.body.dataset.ready = "1"` sits at the end of `render()` — always set, on data arriving. The real gap was pre-data: `.stagewrap` stays `display:none` until then, no fallback in the primary column. Now filled by `#stage-empty`, live in `main`: innerText **182 → 286**.
- `render-gate`: **fixed**, and I read this one right first time — `#stage` had no fallback, full stop. Now it does: **205 → 318**, in `#stage` itself.

Same bug shape both times, different root cause each. Right they weren't one fix; wrong about one of the two causes.

**2. Colour-as-only-channel**: clean at R1, untouched. Dark-mode link contrast (3.89→5.82:1) is a separate new win.

**3. `esp-matrix` clip**: fixed. `.grid-box` scrollHeight 1170 at 900×520, matching the reported 100% population.

## The ~50% threshold

Still means something, but shifted. Pre-fix it measured an artificial 100vh clip. Post-fix, `esp-matrix` at 520px still shows ~44% (1170 scrollH) — a real-content read now, not engineering residue. Survives, demoted correctly to polish judgment.

## Verdict

**I agree with caveat**: no one's observed this in real Claude Desktop, and `render-gate`'s `.rail-list` flex collapse is still open — flagged, not blocking.

Learned: reading a variable's name in a comment isn't reading whether it's set.

— Atlas
