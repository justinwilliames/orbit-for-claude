> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

## Verdict

The flagship visual deliverable is dead on arrival: `orbit_lifecycle_diagram`'s render action crashes on every call, on the live installed build. Everything downstream of that — brand badges, theme, typography rhythm — is moot until it produces a file.

## Top 3 findings

**1. [instrumented] `orbit_lifecycle_diagram` render action hard-crashes — zero diagrams render, on the version users actually have.** I ran `orbit_check_version`: installed `0.39.1`, "up to date" against the published latest. I then called `orbit_lifecycle_diagram` action `build` on a plain welcome-flow request, then action `render` on the resulting spec with `formats: ["svg"]` (later `["svg","png"]`) and a pre-created `output_dir`. Both calls returned the same error verbatim:

```
"message": "The \"data\" argument must be of type string or an instance of Buffer, TypedArray, or DataView. Received undefined"
```

I retried with a hand-trimmed minimal spec (3 nodes, 2 edges, no null-heavy metadata) in case the auto-built spec's bloat was the trigger — identical crash, identical message. This isn't a spec-shape edge case; the render path itself is broken for every format I tried. The `_quality` block riding along on the error response scores `orbit_attribution.summary` at 100/"sharp" and reports "All scored content passes the pre-publish slop gate" — a real instance of the harvest's "vacuous pass on a check that should say not-measured" pattern, now on the diagram renderer specifically: the gate confidently graded the one string field that existed while the actual deliverable produced nothing. `server/lifecycle-diagrams.js` is the file that should own this path; I didn't find the crash site in the time I had (that's a code trace, not a design one) — routed to Sentinel below.

**2. [instrumented] The 08-31 "icon triple" blocking premise is now only ⅓ true, and nobody updated the queue to say so.** `md5 icon.png icon-light.png icon-dark.png`: `icon.png` and `icon-light.png` are still byte-identical (`8bbfa740...`, both mtime Jun 30) — but `icon-dark.png` is now a *different* file (`b3cec1dd...`, mtime Sep 1), and it's correct: compositing it onto a dark and a light background confirms a black opaque tile with a white glyph, i.e. light ink, matching the convention the 0.37.0 commit describes. The 08-31 R5 sign-off recorded "all three still identical" on 08-31; that's no longer accurate as of today — one variant got hand-regenerated (outside any pipeline, since `find . -iname "*.svg"` still returns nothing — the SVG master is still missing, so the blocker itself is real). The remaining defect is narrower than the queue item states: `icon-light.png` is dead weight duplicating `icon.png`, and per `manifest.json` (`"icon": "icon.png"` — the only icon key in the file) and `orbit-branding.js`'s `BRANDING_ASSETS`, `icon-light.png` is only ever read as the "light" export badge, a role `icon.png` already fills identically. I'd retire the file rather than keep queuing a three-way regeneration that's already ⅔ done.

**3. [instrumented] Both hero screenshots in the public README are opaque white-background PNGs — a stark white box on GitHub's dark theme.** `PIL.Image.open` on `docs/images/render-gate.png` and `docs/images/review-gallery.png`: both `mode=RGB` (no alpha channel), corner pixels `(255,255,255)` and `(246,247,250)` — flat white canvases, not framed or matted. These are the first two images a stranger sees scrolling the public repo README. On GitHub's dark theme (the default for a large share of visitors), each renders as a full-bleed white rectangle interrupting an otherwise dark page — the same failure class as the 0.37.0 logo bug, on a different surface nobody checked because the fix scope was "the logo," not "every screenshot."

## What I'd ship

Regenerate `render-gate.png` and `review-gallery.png` with a neutral dark-compatible matte (or crop tighter and let the existing site chrome's own light card read as intentional, not a raw screenshot) — 2-3 hours, fully reversible (it's an image swap, `git revert` undoes it cleanly), owner: me. I'd bundle deleting `icon-light.png` and repointing its one call site (`BRANDING_ASSETS.light.source`) at `icon.png` into the same pass — same reversibility, same owner, and it closes ⅓ of a queue item that's been open since 08-31 without waiting on the still-missing SVG master.

## What I'd defer

The render-crash root cause. I can prove it's broken and reproducible; I can't trace it into `lifecycle-diagrams.js` without becoming a debugger rather than a designer, and that's not where my time is best spent this round.

## Question for another drone

Asked aloud via `say.sh` to Sentinel: "Sentinel — orbit_lifecycle_diagram's render action throws 'data argument must be of type string or Buffer, received undefined' on every spec I tried, svg and png both, on installed 0.39.1. Is that a known regression tied to a recent commit, or does the installed build not match what's in the repo?"

## CHALLENGE

None — I don't have lens-specific evidence on the iteration-count question.

— Nova
