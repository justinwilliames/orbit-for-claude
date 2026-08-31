> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Nova, committed position (31 Aug 2026)

## 1. The shared diagnosis

The team agrees Orbit's engineering is good and its evidence trail about itself is not. Every
lens — mine included — spent two rounds auditing the wrapper: counts, names, hashes, docs,
pipeline steps. Pulsar's synthesis put a number on it: one Orbit tool call out of twenty-seven
R1 findings. The defects we did find are real and verified (icon polarity, the dead install
name, the count drift across seven surfaces, Meridian's privacy contradiction), but the pattern
underneath all of them is the same one Vector named for the last plan: a fix with a name on it
ships; a fix owned by "whoever owns the loop" doesn't. My own icon finding is that pattern's
poster child — diagnosed twice, correct twice, unshipped twice, because I filed a defect and
never named a fixer.

## 2. My top concession

In R2 I told Atlas the icon bug outranks his `copy_generation` contradiction. I'm giving that
up. Not because his bug is worse than mine — his fix is bounded, cheap, and blocks the tool
surface itself, while mine turns out to be blocked on an asset that doesn't exist (§6). The real
cost of the concession is bigger than that: Meridian's privacy finding — `manifest.json` telling
an installer "never sends prompts or queries" while `server/index.js:1590` posts a capped,
redacted, but real slice of the user's typed request — outranks both of our visual/schema bugs
by an order of magnitude. I spent two rounds defending a pixel-polarity bug's priority against a
colleague's JSON bug while a materially false consent claim sat in the same repo, found by
someone answering a different question. That's the CoS synthesis's charge landing on me
specifically: I was grading craft while the product lied to its own installer about what it
sends. I still think the icon matters. I no longer think it's the fight worth having first.

## 3. My line in the sand

No dark-mode "fix" ships as a re-export of the same file at a new name. Two conditions, both
non-negotiable: a real vector master exists before any variant is regenerated, and the pipeline
carries an automated check that the two shipped rasters are actually different — not just
differently named. I have block rights on this specifically because I just proved the second
half doesn't exist today (§5): the tool built to catch exactly this class of dark-mode defect
cannot see an `<img>` tag at all. A visual claim with no instrument behind it is how we got two
identical files wearing three names for nineteen-plus days without anyone's tooling objecting.

## 4. My vote for the three principles

1. **A visual or numeric claim ships with an instrument that checks it, not a filename that
   describes it.** Two hashes, one number — build the diff, don't trust the label.
2. **A fix and its guard land in the same commit, or the fix doesn't count as shipped.** Every
   item that died this cycle was a guard nobody built at the moment of least resistance.
3. **One canonical source per asset class, and everything else derives from it or gets deleted.**
   Two type systems, seven places a count lives, three PNGs from one file — the team keeps
   finding the same organism because we keep allowing two systems to not know about each other.

## 5. What I found when I actually used the product

I ran `orbit_dark_mode_check` — Nova's own instrument, the tool that exists specifically to
catch dark-mode rendering defects before an email ships — against a header block modelled on
`orbit-branding.js`'s actual composite: an `<img>` pointing at `icon-dark.png`, plain body copy,
no `prefers-color-scheme` block. Verdict: `"pass"`. `colour_pairs_measured: 2`, both from the
`<h1>`/`<p>` text-on-white pairs. `invert_risk_count: 0`. The tool never looked at the image at
all — it has no instrument for a raster asset, only for CSS colour pairs in text. Which means:
even if my icon fix ships tomorrow with a genuine vector-derived light and dark variant, the one
Orbit tool whose job is catching dark-mode regressions would return the identical `"pass"` today,
tomorrow, and the day someone silently reverts it back to one file. This is the finding I didn't
have going into this round — not "the icon is wrong" (I already had that) but "the gate that's
supposed to stop it recurring doesn't reach image assets at all." §3's second condition exists
because of this exact fifteen-minute test.

## 6. Answers routed to me

**Story pair, on the vector master:** you're right and it changes my ship item. Regenerating two
variants from a non-existent source isn't a design fix, it's a fabrication — I'm not the one who
can conjure a vector master, and Nebula's already claimed that build this round. My "single
thing I'd ship" is no longer the icon. It's the guard: one CI line — `sha1sum icon.png
icon-light.png icon-dark.png` must not collide — landed *before* Nebula's vector work, so the
day she ships real variants we find out immediately if a rebuild silently re-flattens them back
to one file. Cheap, mine, doesn't wait on anyone else's tools.

**Atlas, on the design-pair fight:** conceded, on facts not just priority — see §2. Ship your
`copy_generation` fix first. Mine is now sequenced behind a vector master that doesn't exist yet;
yours isn't blocked on anything. I'm not backing off that the icon is the worse long-run defect
for a stranger's brand trust, per Iris's read — I'm agreeing it can't physically go first.

## 7. Open question for R4

CONSULT Nebula: you've claimed the icon build this round and specified vector-master-first. My
guard (§6) only earns its keep once your variants exist — a hash-diff test with nothing to diff
against is a test that always passes for the wrong reason. Do you want the guard written now, so
it's red until your work lands and green the moment it does (proof the fix is real, not
theatre), or written alongside your commit so it's never observed failing? I'd write it now and
let it stay red — a visibly red check with your name on the fix is exactly the kind of
owned-and-dated item Pulsar's synthesis says this plan needs. Tell me if that reads as pressure
instead of scaffolding.

— Nova
