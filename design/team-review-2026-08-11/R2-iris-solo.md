> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# Iris — Marketing & Discovery, Round 2 (cross-reference)

I'm not re-auditing. Every surface I'd normally check myself — metadata, README,
registry, signup — is already covered, correctly, by seven other people this
week. My job this round is different: read all seven R1s side by side and say
where the brand/channel/lifecycle story holds together across them, where it
breaks, and which findings that got filed as engineering, UX, or data issues
are actually the same go-to-market problem wearing a different lens's clothes.

The brief's central fact — nobody can find this product — is not one bug. It's
six independent reviewers, each looking at a different layer, all landing on
the same underlying defect: **the code got fixed and the story about the code
did not.** That pattern repeats so consistently across Sentinel, Voyager,
Nebula, Echo, Nova, Atlas, and Pulsar that the real Round 2 job is tracing it
as one thing, not eight.

## What I looked at

All eight R1 files in full (`R1-atlas.md`, `R1-echo.md`, `R1-iris.md`,
`R1-nebula.md`, `R1-nova.md`, `R1-pulsar.md`, `R1-sentinel.md`,
`R1-voyager.md`). No new source-code reads — every claim below cites the R1
finding it's built on rather than re-deriving evidence, per the brief's
known-ids list. Where I connect two findings that weren't connected before,
I say so explicitly.

---

## 1. The funnel, traced end to end, with the story at each door

Six drones each audited one door. Nobody laid the doors in sequence. Here's
the actual path a stranger takes today, and what they're told at each step:

| Step | Surface | What it says | Source |
|---|---|---|---|
| 1. Search / social share | Google snippet, Twitter/LinkedIn card | **"$249, bought once"** | Iris R1 #1 |
| 2. MCP registry search | `braze`, `lifecycle`, `email` | **Zero results** — unsearchable by name | Iris R1 #3, Pulsar R1 #2 |
| 3. Registry entry (if found by exact name) | Downloads v0.27.7 | **The paid, gated build** — hard-stops on `needs_activation`, links to a pricing page that no longer exists | Pulsar R1 #1 |
| 4. GitHub README | First line | "Free — no account, no licence key, no signup" (accurate) | Sentinel R1 §6, Nebula R1 §1 |
| 5. GitHub README | Licence | **No LICENSE file** — repo renders all-rights-reserved | Nebula R1 §1, Pulsar R1 #4 |
| 6. GitHub README | Proof | **Zero screenshots**, a star-history chart of three dead products at 0 stars | Iris R1 #2, Nebula R1 §3–4, Echo R1 #3 |
| 7. Site homepage | Hook | "A lifecycle marketer, built into Claude" (genuinely good copy) | Echo R1 headline |
| 8. Site homepage, 2.5s later | Modal | Email-capture overlay before the pitch is read | Nova R1 #3 |
| 9. "Get Orbit MCP" CTA | Destination | `/sign-up` — email + password + secret question | Echo R1 #1, Nebula R1 §2, Pulsar R1 #3 |
| 10. Claude Desktop install dialog | Description | 12-noun capability list, no story, contradicts step 7's hook | Echo R1 #2 |
| 11. Post-install, first chat | Onboarding | No worked example anywhere — stranger has to invent their own first prompt | Atlas R1 #2 |

Read as a sequence, not eight separate findings, this is the whole story: **a
visitor who survives steps 1–3 without bouncing is then asked to survive eight
more doors, four of which actively contradict the "free, no signup" claim that
got them to click in the first place.** No single reviewer flagged the length
of that chain — each flagged their own door. The cross-reference is that the
chain is the finding. Fixing step 9 alone (which three separate drones
independently prioritised — Echo, Nebula, and Pulsar all called it the highest-
leverage single fix) doesn't fix steps 1–3 or 5–6, and a stranger only has to
hit the *worst* door they land on, not the average one.

**GTM read:** step 3 is the one nobody but Pulsar caught, and it's the most
damaging in the whole chain. A visitor who bounces at step 2 (can't find it)
never forms an opinion. A visitor who reaches step 3 and gets served a $249
paywall build — the exact thing this entire relaunch exists to remove — forms
an *active negative* opinion and is far less likely to try again later, even
after every other fix in this review ships. Sequencing matters: if only one
thing gets fixed this week, it should be the registry pointing at the current
build, not the README polish everyone (myself included, in R1) gravitated
toward — an unfindable product and a findable-but-wrong product are different
failure modes, and the second is worse for a relaunch's reputation.

---

## 2. Findings filed as engineering/UX that are actually marketing-asset problems

Three R1 findings got filed under a different drone's lens but land squarely
on my one job — making the product findable and trusted — in a way their own
write-ups didn't fully draw out.

### 2a. The widget bridge doesn't work off Justin's machine — which means the exact screenshot everyone wants to use as the hero asset would be false advertising

Sentinel's #2 (blocker): `server/ui/shell.js` resolves
`@modelcontextprotocol/ext-apps` via a runtime `import.meta.resolve` that isn't
bundled into the `.mcpb`. On every real install, `window.OrbitApp = null` and
the "send this back to chat" affordance — the entire interactive part of the
widget — silently dies. It still *paints*.

Meanwhile, three separate R1s independently proposed the same fix for
discoverability: **put the widgets in the README as screenshots or a GIF.**
Nebula R1 §3: "three screenshots above the fold." Pulsar R1 §5: "roughly 3,000
lines of the most demonstrable, screenshottable, genuinely-novel work... is
invisible on the front door." My own R1 #2 said the same thing independently,
pointing at the site's own `orbit-demo.tsx` as evidence the asset already
exists elsewhere.

Nobody connected these two findings to each other. A static screenshot of the
widget *painting* is honest — that part works everywhere. But if the marketing
asset is a GIF or demo copy that shows the "send back to chat" round-trip (the
actual differentiator, and the thing worth showing over a competitor's wall of
markdown), that's showing a capability that doesn't function for anyone who
isn't Justin. Shipping that demo before Sentinel's bridge fix lands sets up
the exact bait-and-switch pattern that already hurt trust once ($249 metadata
on a free product). **Sequencing note for whoever owns the README screenshot
work: gate it on Sentinel's #2 landing, or scope the screenshot to the static
render only and say so.**

### 2b. Atlas's WCAG pill failure sits inside the exact widget Nebula wants as the hero screenshot

Atlas R1 #1 (high): the WARN and PASS status pills in `render-gate.js` fail
the same 4.5:1 AA contrast bar the tool itself checks against a stranger's
email — 2.90:1 and 3.40:1 respectively, in light mode, at 11px, in the header
tally that's visible in every screenshot of the widget in normal use.

Nebula R1 §3 names `render-gate.js` "with findings on it" as the first of the
three recommended above-the-fold screenshots. Put those two findings next to
each other: the marketing asset with the highest ceiling in this whole review
— "look, it measures contrast for real" — is a screenshot of a widget whose
own status pills fail that exact measurement, visible in the same frame. A
skeptical CRM/lifecycle marketer (Orbit's own ICP, per Nova R1 #4) is
precisely the kind of person who'd notice. This is a five-minute palette fix
per Atlas, but it has to land **before** anyone takes the hero screenshot, not
after — screenshotting first and fixing later means the fixed screenshot has
to get retaken anyway, and the stale one may already be circulating (the same
"cached OG card" trap I flagged in R1 #1 for the $249 line).

### 2c. Three separate trust-signal gaps are one enterprise-buyer checklist, not three unrelated hygiene items

Nebula R1 §1 (no LICENSE), Sentinel R1 §4 (`orbit_compose_stripo_email` — a
tool that writes to a stranger's Stripo workspace — annotated read-only), and
Sentinel R1 §6 / Voyager R1 §2 (telemetry enabled by default, undisclosed in
the README) each got filed as a separate defect in a separate lens: legal,
engineering correctness, and honesty, respectively.

From where I sit, these are the same buyer objection asked three different
ways. Nova R1 #4 already named the target reader correctly: "a skeptical
CRM/lifecycle-marketer visitor... is exactly the audience most likely to
notice." That audience, at any company with an actual security or legal
review step (which is most of the companies with a large enough Braze
instance to be worth this product), runs a specific checklist before letting
an MCP server touch production credentials: *Is it licensed? Do the tool
permissions match what they claim? Does it call home, and did they say so?*
Right now Orbit fails all three, in the same repo, in the same week. None of
these individually would sink an evaluation. Together, discovered in the same
ten-minute review by the same skeptical evaluator, they compound into "this
team doesn't audit its own claims" — which is a much harder story to walk
back than any single fix. **This is the argument for treating Nebula §1,
Sentinel §4, and Sentinel §6/Voyager §2 as one sprint, reviewed together
before any of the three ships in isolation** — a stranger who finds the fixed
LICENSE but still trips over the mis-annotated write tool a week later gets
the same "not audited" conclusion, just later.

### 2d. Voyager's outcome-blind telemetry means nobody will know if any of this worked

Voyager R1 #1 (the biggest finding in that file): every tool call is logged as
an *attempt*, never a *result*. The `tool_error` event type is wired end to
end on the receiving side and never fired by the client. `withToolErrorHandling`
computes the exact classified error string the schema wants, then drops it on
the floor.

This is the one R1 finding with a direct dependency on the entire premise of
this review. The brief says: fix discovery, see if usage moves. If the fixes
above land — registry serves the right build, README has real proof, the
signup wall comes down, the trust checklist clears — and the "13 real humans"
number doesn't move, the only honest diagnosis available today would be "still
not discoverable." But if it *does* move and those new visitors churn out
silently because tools are erroring for them, the current telemetry can't
distinguish "still can't find it" from "found it, tried it, it broke, left."
Those demand completely different next moves, and right now they'd look
identical in the data. **I'd flag this as a GTM prerequisite, not a nice-to-
have eng ticket** — the ten-line fix Voyager already specced should land in
the same release as the discovery fixes, or this review's own success
criterion becomes unmeasurable.

---

## 3. Where the story genuinely holds — not padding this

Two things across all seven R1s that I want on record as *not* broken, because
a synthesis pass that only lists problems is as dishonest as one that pads:

- **The content and SEO architecture underneath everything is real and nobody
  found a crack in it.** My own R1 said this and nothing since contradicts
  it — the AI-crawler allowlist, the sitemap's deliberate E-E-A-T structure,
  the `llms.txt` files, the structured data with correct free/no-signup
  answers already baked in. The problem the team found all week is downstream
  of discovery (what happens *after* someone arrives), not the discovery
  machinery itself.
- **The homepage copy and the origin story are the best writing in either
  repo**, and three drones said so independently without prompting each other
  (Echo's headline, Nebula's §2 close, my own R1). "A lifecycle marketer,
  built into Claude" is a real hook and the Claude-alone-vs-Claude+Orbit table
  is the right device. The story is not the problem. Every door that
  contradicts it — steps 2, 3, 5, 6, 9, 10 in the table above — is.

---

## What I'd fight for, in order

1. **Fix the registry (Pulsar §1–2) before anything else.** It's the only
   finding this round where the current state is actively worse than
   invisible — a found product that relitigates the exact defect this release
   was built to remove.
2. **Land the signup-wall fix and the trust checklist (§2c above) together,
   reviewed as one pass**, not three separate tickets closed on three
   different days.
3. **Gate any "screenshot the widgets" marketing work on Sentinel's bridge fix
   and Atlas's contrast fix landing first** — both are cheap, and taking the
   hero screenshot before they land means retaking it later, best case, or
   shipping a misleading one, worst case.
4. **Ship Voyager's ten-line outcome-tracking fix in the same release as the
   discovery fixes** — otherwise this review has no way to know if it worked.

Everything else in the seven R1s is real and worth doing. These four are the
ones where a marketing lens changes the order, not just adds to the pile.
