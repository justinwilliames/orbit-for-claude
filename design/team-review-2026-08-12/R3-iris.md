> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# Iris — Marketing & Discovery, Round 3

## What I looked at

Read `FINAL-SHIPPING-DECISION.md`, my own R1/R2 from this cycle (12 Aug), and the full
already-known list before touching anything. Re-verified: both R1 findings (changelog's
false "no sign-up wall" claim, GitHub repo description stale counts) are still open —
confirmed by direct read of `lib/changelog.ts:69` and `gh repo view` — but both are
already filed, not mine to re-file. R2's flagship-path finding is fixed in spirit (a
`nova-brain-path-visible` branch built the homepage section, FAQ entry, and metadata
rewrite) but that work has never reached `origin/main` — also already-known, not
re-filing, but it matters for what I found next.

get-orbit's git state this round is unusually fragmented: three different refs
(`team-review-round-2` — my checkout, `nova-brain-path-visible`, `origin/main`) each
carry different subsets of this cycle's marketing-site fixes, and `origin/main` is
canonical (2 commits ahead of my checkout, nothing unique to my branch). So I verified
everything below against `origin/main`, not the branch I happened to have checked out —
worth flagging as its own risk: whichever fix ships depends entirely on which branch
someone remembers to merge, and at least one fix (the flagship-path site copy) currently
exists nowhere that reaches production.

Then I went looking specifically at the thing this cycle's central positioning claim
depends on structurally, not just in prose: the `/skills` library page, and whether the
79 real skill files in `orbit-for-claude/skills/` actually have a page each on
`yourorbit.team`.

## Finding — the flagship skill itself has no page on the site, dropped by the very commit that claims to have fixed this

`lib/skills-library.ts` on `origin/main` (the canonical ref, confirmed 2 commits ahead of
my checkout with nothing unique to mine) lists 78 unique skill slugs against 79 real
`.md` files in `orbit-for-claude/skills/`. The one missing slug is `template-brain` —
the single skill the MCP's own `instructions` string leads with as "THE FLAGSHIP PATH,"
the one `README.md`'s `## Build your own lifecycle brain` section describes, the one
`orbit_bootstrap_brain` and `orbit_scaffold_brain_program` exist to serve. It has no
`/skills/template-brain` page, isn't counted in `COUNTS.skills`, doesn't appear in the
`/skills` page's JSON-LD `ItemList`, and can't be found by search on the page built to
list every skill Orbit has.

The reason this is worth a fresh finding rather than a footnote on the already-known
flagship-path gap: this is the exact bug shape the round is hunting for — a step that
reported success while being wrong. Commit `7f8bda8`, titled *"skills: publish the
twelve the MCP ships and the website never mentioned,"* landed on `origin/main` and did
real, verified work — it added 12 real entries, including all four of the missing
platform-documentation skills (Klaviyo, Mailchimp, Customer.io, SFMC) that four of the
site's own dedicated ESP landing pages (`/mcp-for-mailchimp`, `/mcp-for-klaviyo`, etc.)
name by platform while claiming a skill count that, before this commit, didn't actually
cover them. Good fix. But of the thirteen real gaps that existed at that point, it closed
twelve and silently left the thirteenth — `template-brain` — unclosed, while its
secondary/pair skill `brain-graphify-setup` ("Add a knowledge-graph index over a
**template brain**...") made it in fine. The commit title's own claim, "the twelve,"
is literally correct and also exactly why the one skill it didn't cover is easy to miss:
nobody re-checked "twelve" against "all of them."

This isn't a resurrection of an earlier attempt that got lost to a branch merge, either
— I checked. An *earlier* commit (`4133764`, on the orphaned `nova-brain-path-visible`
branch, never merged) did add `template-brain` correctly, with a comment reading *"The
flagship path... this library shipped without it, so a stranger browsing /skills could
not learn it existed."* That branch never reached `origin/main`. The later, actually-
shipped fix (`7f8bda8`) was written independently, covered different ground well, and
reintroduced the exact same gap in the one skill that matters most for this cycle's
repositioning — because it fixed the platform skills nobody had mentioned, not the one
skill somebody already had.

**Why it's the highest-value single gap on the site right now**: every other surface
this round's work touched now tells a stranger "Orbit's best move is building you a
lifecycle brain" — the MCP instructions, the README, (eventually) the homepage. The one
place built specifically to let that stranger read what the skill actually does, step by
step, before installing anything, 404s.

**Fix**: add one entry to `lib/skills-library.ts`, same shape as the `brain-graphify-setup`
entry seven lines below where it should sit (`category: "production"`), sourced from
`orbit-for-claude/skills/template-brain.md` (171 lines, real content — title "Template
Brain," `whenToUse` and `output` fields can be lifted near-verbatim from the frontmatter,
matching how `brain-graphify-setup`'s entry already reads). Two-line diff, and it closes
the count to the true 79 everywhere `COUNTS.skills` is quoted sitewide (FAQ, homepage,
press page, all five `/mcp-for-*` pages) in the same edit.

**Evidence tag**: instrumented.
- `git show origin/main:lib/skills-library.ts | grep -oP '(?<=slug: ")[^"]+' | sort -u | wc -l`
  → 78, against `ls orbit-for-claude/skills/*.md | wc -l` → 79.
- `comm -23` of the two sorted slug lists → single line of output: `template-brain`.
- `git show origin/main:lib/skills-library.ts | grep -in "template.brain"` → zero hits
  outside the `brain-graphify-setup` entry's own lead text, which references it by name
  without it existing as a linkable entry.
- `git log --oneline origin/main -- lib/skills-library.ts` → confirms `7f8bda8` is the
  most recent commit to this file on the canonical ref, and its diff (`git show 7f8bda8
  -- lib/skills-library.ts`) adds 12 entries, none of them `template-brain`.
- `git merge-base --is-ancestor 4133764 origin/main` → `NO` — confirmed the earlier,
  correct fix never reached the canonical branch.
- `git log --oneline team-review-round-2..origin/main` / reverse → 2 / 0, confirming
  `origin/main` is the branch to audit against, not my checkout.

## What I checked and found already fixed, or already known

- `/downloads` — still honest about the account requirement, still names the ungated
  GitHub release and registry alternatives. No change since R1/R2.
- The new `claude-with-orbit-vs-without` guide (on the `nova-brain-path-visible` branch,
  not yet on `origin/main`) — read in full. Its "eight platform skills" claim is accurate
  against the real skills folder, its `SkillCallout` references resolve, and its internal
  link to the Gmail-clipping guide is a real, registered slug. Clean.
- `sync-counts.mjs` / `lib/counts.ts` — still correctly self-referential (`COUNTS.skills`
  always equals `SKILLS.length`, so the number shown never contradicts what's on the
  page) — the bug is the array's completeness, not its arithmetic. Not the same shape as
  the already-known `github-repo-description-stale-counts` finding, which is about a
  number nobody re-generates; this is about an entry nobody added.
- `lib/changelog.ts:69`, `gh repo view` description — both still wrong, both already
  filed (`changelog-no-account-claim-false`, `github-repo-description-stale-counts`).
  Not re-filing.

## Verdict

One finding this round, but a precise one: the site's own "fix the missing skills"
commit fixed twelve of thirteen gaps and left out the one skill the entire cycle's
positioning is built around — not through neglect, but because an earlier, correct fix
for that exact skill lives on a branch that was never merged, and the later fix never
checked its own "twelve" against the real count. Everything else I checked from R1/R2
is either already fixed, already known, or genuinely clean. Not padding the list.
