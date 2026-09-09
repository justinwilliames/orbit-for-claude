> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R5 — Nova · sign-off

**1. `.grid-box` clipping — FIXED, not by my diff.**
R1: `clientHeight 45 / scrollHeight 592` (8%). Re-measured [900×520 & 900×760, dark]: **592/592 (100%)** both. `documentElement.scrollHeight`: **1170/1170**, equal. Shipped fix = the 24-site pin deletion, not my diff — conceded in R3 (mine went from 5× better than shipped to a regression once the pin was removed). What I'd have designed? Yes — watched my own diff lose to doing less, twice, on my own numbers.

**2. Fixture gap — PARTIALLY FIXED; carry-forward judgement proved right.**
R1: 1 of 23 measurable; `.rail-list` collapse flagged **[judgement]**, no fixture existed. R5: 5 of 23 populated. Re-measured render-gate: `.rail-list` `185/596` — matches R5-WHAT-CHANGED exactly. Named the defect before proof existed. 18 widgets still unwritten.

**3. Dark-mode link contrast, 3.89:1 — FIXED.**
Re-measured [synthetic `.d-row a` node — no populated row carries `doc_url` this session]: color now `rgb(129,140,248)` = `--brand`, not `--brand-strong`. Against `--card rgb(23,26,36)`: **5.82:1**.

**Residual `.rail` caps:** counted five, not four (client-matrix, diagram-view, design-system, review-gallery, render-gate). Each went `NNvh → fixed px`. render-gate's `.rail max-height` reads **320px at both 520 and 760** — unchanged. Correct, not careless: a vh cap would re-couple document height to viewport and reopen the bug just closed.

Measured directly: esp-matrix, render-gate. Inferred from R5-WHAT-CHANGED: inbox-preview 975, rfm-map 1604, send-calendar 1670.

**Verdict:** I agree with caveat — 18 unwritten fixtures mean "clean elsewhere" stays unverified, same as R1.

**Learned:** a diff can name the right ancestor and still be the wrong fix — mine gave it a floor when it needed a relief valve. Deletion beat addition, proven only by ablating my patch against doing nothing.

— Nova
