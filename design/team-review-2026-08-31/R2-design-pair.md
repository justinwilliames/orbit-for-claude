> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R2 — Atlas + Nova, cross-reference (31 Aug 2026)

## 1. Where we agree

**Atlas:** Nova's finding 2 — the icon triple that's one file wearing three names — isn't just build hygiene to me, it's my own scar with the serial numbers filed off. `orbit-branding.js` wires `icon-light.png`/`icon-dark.png` as if they diverge — exactly the shape of a control signalling state through one channel that silently isn't there. A dark-mode header compositing the light-mode mark is a polarity claim with nothing behind it. Nothing to add mechanically — the orchestrator's `shasum` confirms it — but I'll put my weight behind it as more than cosmetic.

**Nova:** And Atlas's finding 1 — `copy_generation` reporting `needs_setup` with an empty `blocking_issues` array and a `guidance` line that contradicts the status next to it — is the same organism as my icon bug, in JSON instead of PNG. Two fields computed from overlapping-but-not-identical conditions, drifting apart because nothing diffs them. I got the exact mechanism, since Atlas's writeup called it "one field over" without naming which one. It isn't Tone Of Voice — that's the field `blocking_issues` actually checks — it's any *other* guideline section. I built a scratch brand kit with Tone Of Voice fully written and two other sections still on the template's TBD text, and ran `checkSetup` straight from the module:

```
$ node -e '...checkSetup({...}).copy_generation...'
{ "status": "needs_setup", "blocking_issues": [],
  "guidance": ["Orbit can write copy with the configured brand guidelines and tone of voice."] }
```

Reproduced clean, outside Atlas's live install. `operational_status` gates on all nine non-exempt `BRAND_GUIDELINE_SECTIONS` (`setup-validator.js:596-601`); `blocking_issues` gates on exactly two of those nine. Any of the other seven left as placeholder text trips the contradiction, not just the field its name suggests.

**Both:** We also agree with Nebula's/Sentinel's/Voyager's/Iris's shared count-drift finding, and we extend it somewhere none of them checked — the widget layer. See §3.

## 2. Where we fight

**Atlas:** The `copy_generation` contradiction is the one to fix first. `orbit_check_setup` is the tool a model calls turn one, in nearly every session — it's the front door, and right now the front door hands out a status and a sentence that argue with each other with no tiebreaker. A model has to guess which half of its own tool's output to trust, cold, before it's built anything.

**Nova:** I'll take the icon bug over it, and I actually disagree here. A capable model reads past a contradictory status field to the guidance sentence next to it — Atlas's own repro shows the guidance line is *correct*. Ugly API, but self-correcting text — one tool call, gone the moment the JSON's fixed. The icon has no guidance sentence to fall back on. It's a binary that silently ships as its own opposite — same hash since at least the 12 Aug review — composited into every dark-mode brand header a *paying customer* sends to *their own list*. That's not the model's first three minutes; it's every one of Orbit's customers' customers, indefinitely, until someone with art tools regenerates two files nobody's assigned to.

**Atlas:** Fair — we're weighing "confuses the agent for one turn" against "silently misrepresents the brand forever." Different strangers hit each one. I still ship mine first because it's cheaper and it's blocking the tool surface itself; Nova's needs a named owner with design tools, which is exactly her point below.

## 3. The finding that needs both our lenses to see

**Atlas + Nova, together:** we asked what the orchestrator asked — what do the 23 widgets look like with nothing configured — and neither of us could answer it alone. Atlas walks the stranger's path; Nova actually renders the artifact rather than trusting that a test called "widgets" checked the pixels. We called `widget.render(null)` for every entry in `ORBIT_WIDGETS` and read the empty-state copy directly. It's good: `esp-matrix` says *"Waiting for the matrix — run `orbit_esp_capabilities`... No credentials needed."* `preheader-clip`, `push-matrix` and `revenue-attribution` all name the exact next tool. We cross-checked every hardcoded `orbit_*` name against `tool-annotations.js` — all twelve resolve live, no phantom references. That cuts against what Nova's stale-screenshot finding might predict; we're reporting it clean, not manufacturing a gap.

The gap is upstream of the copy: `tests/suites/28-widgets.test.mjs:180-186` — the only test that runs all 23 widgets with no data — asserts `html.startsWith("<!DOCTYPE html>")` and `html.includes("window.ORBIT_BOOTSTRAP")`. That's it; it never reads a word of what we just read. The empty-state craft is good *today* and unprotected: rename `orbit_esp_capabilities` in one PR and every diagnostic in this repo stays green while five widgets name a tool that no longer exists. This is the sixth time this round the same organism — a gate that checks structure or its own vocabulary, not the fact underneath — has turned up (Sentinel's count sync, Voyager's `ok`-only telemetry, Nebula's regex-keyed drift gate, Iris's README install line, Vector's warning-not-failure guard). Nobody had checked whether it reached the UI layer. It does.

## 4. Sharpened or retracted

**Nova**, sharpening, not retracting: my R1 finding 3 hedged that a file-date diff "can't tell you the pixels moved enough." Having read the empty-state HTML for all 23 widgets rather than the two static PNGs, I can extend the hedge one step, not close it — the *text* layer is intact, the *rendered pixel* layer is still unverified by anyone, us included. Screenshot debt stands.

**Atlas**, sharpened: my R1 finding said "one field over." It's not one field, it's seven — any of the seven guideline sections `blocking_issues` doesn't check. The fix should be scoped as "derive `status` from the same completeness `operational_status` already computes," not "add the missing check."

**Both, on Nebula's retraction:** her withdrawal of "three typefaces and no typeface" against the export system's Sora/Oxanium/GeistMono stands — internally coherent, and Nova's finding 1 doesn't contradict it. Nova's axis is different: that coherent export stack and the widget shell's Bricolage/Inter/JetBrains stack don't know about each other. Nebula was right about the inside of one room; Nova's finding is the wall between two rooms. Neither cancels the other.

## 5. Answers to routed questions

None. The evidence audit's ledger sends all nine §1c consults to Voyager, Nebula, Iris, Sentinel, or Meridian — nothing lands on Atlas or Nova this round. We used the free hand on the orchestrator's direct brief instead (§§1–3 above).

## 6. Our question

**CONSULT Pulsar:** Vector's F1 found that every item on the 12 Aug plan with a drone's name on it shipped, and every item without one didn't. Nova's icon fix and our widget-empty-state gate are both exactly that shape right now — diagnosed twice, owned by nobody. When R4 writes the action plan, will each of these carry a named owner and a date the way your own `DISPOSITION.md` proposal demands of the pipeline items — or do they sit in the deferred column a second time?

---

*— Atlas & Nova, 31 Aug 2026.*
