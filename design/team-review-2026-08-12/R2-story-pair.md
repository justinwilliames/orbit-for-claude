> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# R2 — Story pair: NEBULA × ECHO

Cross-reference of all nine R1 files in this folder (`R1-atlas`, `R1-echo`,
`R1-iris`, `R1-nebula`, `R1-nova`, `R1-pulsar`, `R1-sentinel`,
`R1-sentinel-prior-1236`, `R1-voyager`), read against
`team-review-2026-08-11/FINAL-SHIPPING-DECISION.md` and this folder's
`R4-orchestrator-action-plan.md`.

Everything below is instrumented against the live world — production
`yourorbit.team`, the GitHub API, the MCP registry, and the registry's own JSON
schema — because that is the only method that has caught this bug class all
round, and because one of the two of us got caught by not doing it.

---

## 0. Where the nine of us agree

nebula: Three lenses independently corrected the same premise, which is the
healthiest thing in this folder. Sentinel, Voyager and Pulsar each ran the suite
themselves and got **740, not the 554 in the brief**. Pulsar and Voyager each
independently downloaded the published `.mcpb` anonymously and matched the
registry's `fileSha256` byte-for-byte. Nobody inherited a number. After a round
whose signature bug was *a step reporting SUCCESS while being wrong*, the team
has visibly stopped trusting reports.

echo: And there is a real convergence on **where the remaining harm lives**.
Nebula (R1 §3–4), Iris (§1), Pulsar (§1, §3), Voyager (§3) and I all filed
findings of one shape without coordinating: *a true thing was decided in one
place and never finished propagating to the surfaces that describe the
product*. The README screenshot vs. the snippet it claims to show. The changelog
vs. the same-day account decision. The repo "About" field vs. `sync-counts.mjs`.
The registry description vs. the free relaunch. Five lenses, one disease.

nebula: The one-line diagnosis the folder is converging on, and I will sign it:
**Orbit's guards were scoped by what was easy to rewrite, not by what a stranger
can see.** Pulsar said it best — "a guard that covers the artefacts and not the
surfaces." Sentinel found the same at the parser layer ("the absence of a match
was reported as the absence of a problem"). §2 below is that sentence eating one
of us alive.

---

## 1. Where we FIGHT

### 1a. Nebula cleared `server.json`. Echo says the clearance is wrong, and Voyager's own evidence is the reason — **`registry-sentence-priced-in-keywords-search-ignores`** (NEW)

nebula: I wrote, in R1's *what I deliberately did not file*:

> **The registry storefront.** … the copy in `server.json` — *"Lifecycle
> marketing in Claude: Braze, email QA, deliverability, segmentation. Free, no
> key."* — is the tightest sentence in the estate. Nothing to add.

echo: You were grading it on tightness. Tightness is not the test. Here is the
test, and it is the only one I have: read that sentence to someone who does not
work in CRM and ask them to repeat it back without you feeding them the words.
They say *"a marketing thing for Claude."* That sentence describes twenty
products. It is the single field a human reads in a client's server list, and it
buys nothing with 60 of its 91 characters.

nebula: Buys nothing is a strong claim. Defend it.

echo: Voyager already did, in this same folder, and neither of us joined the two
facts up:

```
$ curl -s '…/v0/servers?search=deliverability'  -> total=6   orbit_entries=0
$ curl -s '…/v0/servers?search=email'           -> total=30  orbit_entries=0
$ curl -s '…/v0/servers?search=marketing'       -> total=30  orbit_entries=0
```

Registry search matches **the name only**. "deliverability" is sitting in
Orbit's registry description and the query for it returns six servers, none of
them Orbit. So `Braze, email QA, deliverability, segmentation` — four keywords,
60 characters — provably does not aid discovery. "Braze" earns its place in the
*name* (`braze-lifecycle-mcp`), which is what search reads. In the description it
is decoration.

nebula: Then the field's only job is to make a human want to install, and we are
spending two thirds of it on SEO that the search engine cannot read. Fine. I
concede, and I will go further: the sentence is not just neutral, it is
*actively off-message*. This round's own state brief says the server
instructions now LEAD with helping a user build their own lifecycle brain and
design system. I checked where that repositioning actually landed:

```
manifest.json      → "Build your own email design system and lifecycle brain
                      from the emails you already send…"          ✓ carries it
README.md §2       → "## Build your own lifecycle brain"          ✓ carries it
server/index.js    → the flagship path, four numbered steps       ✓ carries it
server.json        → no mention                                   ✗
yourorbit.team/    → "lifecycle brain" x0, H1 is the category
                      sentence, H2 is "everything lifecycle
                      marketers open in a new tab — in one place" ✗
```

The new story reached every surface a user meets **after** deciding to install,
and none of the two that decide whether they install. That is the disease from
§0, in the exact place this round spent its distribution budget.

echo: And the schema cap is the reason to fix it now rather than argue about it.
I pulled the constraint rather than guessing:

```
$ node -p "require('./server.json').description.length"        → 91
$ curl -s https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json
  description: { maxLength: 100, minLength: 1 }
```

Nine characters of headroom, so this is not "add the flagship line to what is
there" — it is a swap, which is why it needs a decision rather than a patch.
Candidates that fit, measured:

```
 90  Turn the emails you already send into a design system, then gate every send. Free, no key.
 90  Build a design system from the emails you already send, and gate every send. Free, no key.
 94  Turns the emails you send into your design system, then gates every send. Braze. Free, no key.
```

nebula: Take the third. It keeps "Braze" as a *human* signal for the marketer
scanning the list — who does not know the registry searches on name — while
spending the rest of the budget on the one claim no competitor can copy. And it
costs nothing to ship: Pulsar's R1 §2 already establishes that this branch
**must** bump the version before merge or it releases nothing. `server.json` is
one of the three files that bump. This rides along in a commit that has to
happen anyway.

echo: Filed. Medium — it does not break anything, it just wastes the only
sentence Orbit gets.

### 1b. Echo says delete the asset. Voyager says that asset is the only install evidence in the estate — **`deleting-v0277-destroys-the-only-install-signal`** (NEW)

echo: My own R1 finding, and I am arguing against my own fix. I recommended:

> delete the `.mcpb` assets from the v0.27.6 and v0.27.7 GitHub releases
> (`gh release delete-asset …`). … The release entries can stay for history;
> only the installable file needs to go.

Voyager, in a file written the same hour, called that same asset:

> the most-downloaded artifact Orbit has ever shipped … `download_count` is a
> **gauge**, not a series. GitHub exposes the current cumulative value and
> nothing else. Delete or re-cut a release and the history is gone.

nebula: Two drones, same object, opposite verbs, and neither noticed. So which
of you is wrong?

echo: Neither, and that is the point — the fix is right and the *ordering* is
missing, which is exactly the kind of thing that gets lost when eight lenses
file in parallel. I re-read the gauge this session:

```
$ gh api repos/justinwilliames/orbit-for-claude/releases --paginate \
    -q '.[] | "\(.tag_name)\t" + ([.assets[]|"\(.name)=\(.download_count)")]|join(" "))'
v0.29.1  …mcpb=5     v0.28.3  …mcpb=7
v0.29.0  …mcpb=13    v0.28.1  …mcpb=1
v0.28.5  …mcpb=10    v0.28.0  …mcpb=2
v0.28.4  …mcpb=5     v0.27.8  …mcpb=0
                     v0.27.7  …mcpb=73   ← was 72 when I filed R1, hours ago
                     v0.27.6  …mcpb=10
```

**73, not 72.** It moved during this review. Somebody found the paid,
licence-gated build in the last few hours and installed it. That is a live
harm confirmed twice, and it strengthens my original finding rather than
weakening it.

nebula: It also makes your fix more urgent and more destructive at the same
time. `gh release delete-asset` is irreversible, and it takes with it:

- the 83 combined downloads across v0.27.6/v0.27.7 — the largest single number
  anyone in two review rounds has produced in answer to *"has a stranger ever
  touched this"*;
- the before/after baseline for the rename, which is the **only** way to answer
  whether the registry fix — this round's headline achievement — worked;
- the registry's deprecated-entry package URL, which points directly at that
  asset. I confirmed it resolves today:
  `…/releases/download/v0.27.7/orbit-lifecycle-marketing-system-for-claude.mcpb`.
  After the delete, that entry advertises a 404 instead of a licence prompt.

echo: A 404 is still better than a licence prompt for a product that takes no
money — I am not retracting the fix. I am adding the two lines that must precede
it. **Snapshot first, then delete**, in one sitting:

1. Append `{date, tag, asset, download_count}` for every release asset to a
   committed JSON file — this is Voyager's own §4 fix (`release-download-count-
   unsnapshotted`), which is currently sitting in "queue for the week" behind a
   Monday cron while the delete is sitting in "shippable now, needs Justin".
   The queue order is backwards and nothing in either file says so.
2. Then `gh release delete-asset` on both tags.
3. And note in the release body *why* the asset is gone, so the 404 has a story.

nebula: Which is the sharpening. The finding is not "delete it" or "keep it" —
it is that **two correct fixes in this folder are scheduled in the order that
destroys one of them**, and the only artefact recording that dependency is this
paragraph. Medium, but irreversible, which is why it is not low.

---

## 2. The retraction — Echo's, and it is the round's own bug class committed by a reviewer

### **RETRACTED**: "the ten-surface overclaim is fixed — closed"

echo: My R1 file, this folder, opens with a section headed *"Fully fixed since
my R4 — confirmed, not re-filing"*, and the first item reads:

> The "one email to download" / "an email address, nothing else" overclaim I
> flagged across ten surfaces in R4 is gone. `git log` shows `b53f4c1` … fixed
> all ten … It also added `tests/tripwires/signup-cost-claim.test.mjs` — I ran
> it directly … and all four assertions pass. … **Good, careful work — closed.**

That is wrong, and it is wrong in the exact shape this round was sent to hunt.

```
$ cd /Users/justin/code/get-orbit
$ git branch -r --contains b53f4c1
(empty — the commit is on no remote branch at all)

$ gh pr list
(empty)

$ for u in / /downloads /faq /courses; do
    printf '%s -> x%s\n' "$u" "$(curl -s https://yourorbit.team$u | grep -oi 'one email to download' | wc -l)"
  done
/           -> x8
/downloads  -> x8
/faq        -> x4
/courses    -> x4

$ curl -s https://yourorbit.team/llms.txt | grep -io 'only thing it asks for[^.]*\.'
only thing it asks for and they should not be surprised by it.
```

Eight instances on the homepage, right now. And `llms.txt` — the file written to
instruct other AI assistants — is still asking every model on the internet to
vouch for a claim the sign-up route contradicts.

nebula: Pulsar filed exactly this as `false-account-claim-live-sitewide` and got
it right, so the *claim* is not new and we are not re-filing it. What is new is
**how the false closure was manufactured**, because it was not carelessness — it
was a passing test.

echo: Correct, and I want it on the record against my own name. I did not guess.
I ran a real regression guard and it went green. The guard is
`tests/tripwires/signup-cost-claim.test.mjs`, and it reads the working tree:

```js
for (const dir of ["app", "lib", "components"]) {
  files.push(...(await collectSourceFiles(join(REPO_ROOT, dir))));
}
```

`REPO_ROOT`. Not a URL. A tripwire that greps a checkout is **structurally
incapable** of distinguishing "fixed" from "fixed on a branch nobody pushed",
and it produced a confident "closed" from a lens whose entire job is the first
ninety seconds of a stranger's life. A step that reported SUCCESS while being
wrong. Same bug, new victim, and the victim is the review process.

### And the same guard has two more blindspots that matter — **`tripwire-blindspots-hide-the-live-cost-claim`** (NEW, sharpens Iris §1)

nebula: This is where it stops being a mea culpa and becomes a finding, because
Iris's R1 §1 and Echo's dead guard are the same object and neither file knows it.

Iris found a live false claim about the account, in `lib/changelog.ts`, rendered
on `/whats-new` and syndicated to the Atom feed:

> "No account. Downloads no longer sit behind a sign-up wall."

I then read the guard that exists to prevent precisely that claim. Two
independent reasons it cannot see it:

**One — the file is on the guard's exclusion list, by name.**

```js
/** Directories whose prose is about email marketing, not about Orbit's price. */
const CONTENT_PATHS = ["lib/guides/", "lib/courses/", "lib/changelog.ts", …];
…
if (CONTENT_PATHS.some((p) => rel.includes(p))) continue;
```

`lib/changelog.ts` is skipped wholesale, under a comment asserting its prose is
"not about Orbit's price." The one file in the exclusion list that is *entirely
about what Orbit changed and what it costs*.

**Two — the wording is a sixth phrasing the pattern list does not know.** The
guard carries five regexes (`one email to download`, `an email address, nothing
else`, …). *"Downloads no longer sit behind a sign-up wall"* matches none of
them. So even with the exclusion removed, it still passes.

echo: And here is the part that made me put this above everything else in the
folder. The tripwire's own header comment, written by whoever built it:

> "A commit fixed that on four surfaces by searching for that exact string; the
> identical promise was shipping under the phrasing 'one email to download' on
> ten more … Same claim, second wording, so the grep that fixed it could not see
> it. This tripwire knows both phrasings, **so a third wording is the only way to
> reopen it.**"

A third wording is exactly what shipped. In the same repo. In the one file the
tripwire was told to skip. The guard predicted its own failure mode in a code
comment and was then built blind to it.

nebula: Which makes the fix a package, not a line, and it is small:

1. Remove `lib/changelog.ts` from `CONTENT_PATHS`. It is the changelog; pricing
   claims are its native content, not an exception to it.
2. Replace the phrase-list with a **semantic** assertion for that file: any
   changelog line matching `/no account|sign-up wall|no sign.?up|without an
   account/i` must not be present unless `app/api/account/create/route.ts` has
   stopped enforcing its fields — the guard already reads that route in its
   second test, so the premise is one import away.
3. Add the assertion the guard structurally cannot make today: **one production
   check.** A post-deploy step that curls the live `<meta name="description">`
   and the live `llms.txt` and fails on the same patterns. Ten lines. It is the
   only thing in either repo that would have stopped a reviewer marking a
   live-harm item "closed" this morning.

High. Not because `/whats-new` has traffic — it almost certainly does not — but
because item 3 is the generalisable guard for the entire class this round has
been chasing, and because a wrong "closed" is more expensive than an open
finding.

---

## 3. The finding that needs BOTH lenses — **`changelog-correction-cannot-reach-the-feed`** (NEW)

nebula: Neither of us would have got this alone, and it invalidates a fix
proposed in this folder.

Iris's fix for the false changelog line is: *"edit the `items[1]` string in the
`0-28-0-free` entry. Five-minute fix."* Reasonable. It does not work, and it
fails silently — which is the third time that sentence appears in this document.

echo: My half first, because mine is the mechanical one. I read the feed route:

```js
// app/whats-new.xml/route.ts
const updated = CHANGELOG[0]?.isoDate ?? …;
…
<updated>${e.isoDate}T00:00:00Z</updated>
<published>${e.isoDate}T00:00:00Z</published>
```

And the type it reads from:

```ts
export type ChangelogEntry = {
  slug: string; date: string; isoDate: string;
  title: string; summary: string; items: string[];
};
```

There is no `updatedDate`. `<updated>` and `<published>` are **the same
hardcoded string**, and that string is the publication date. Atom `<updated>` is
specified as the last *significant modification* — it is the field readers use
to decide whether to re-surface an entry they already have.

So Iris's edit produces: content changes; `<updated>` stays `2026-08-12`;
feed-level `<updated>` stays pinned to `CHANGELOG[0].isoDate` and only moves when
a **new** entry is added at the top. Every subscriber who already pulled the feed
keeps the false sentence forever. The correction has no delivery mechanism. And
you cannot simply bump `isoDate`, because that would also rewrite `<published>`
and move the entry's date on the archive page — the schema forces the lie.

Live, right now:

```
$ curl -s https://yourorbit.team/whats-new.xml | grep -c 'sign-up wall'   → 1
$ …  <id>https://yourorbit.team/whats-new/0-28-0-free</id>
     <updated>2026-08-12T00:00:00Z</updated>
```

nebula: And my half, which is the reason I would fight for a different fix than
the mechanically-correct one. Orbit's entire differentiator — the sentence under
every screenshot, the thing the render gate exists to embody — is **we measure
instead of asserting**. A product with that as its identity does not quietly
edit its own published record. Iris's fix, executed literally, means the archive
page silently tells a different story tomorrow than it told yesterday, with no
mark that anything changed. That is a brand act, and it is the wrong one. It is
also, precisely, the same instinct that produced the README's proof image
mismatch I filed in R1 §3: tidy the surface, hope nobody checks.

The signature move available here is the opposite, and it is better copy:

- add `updatedDate?: string` to `ChangelogEntry`, emit it as `<updated>` when
  present, leave `<published>` on `isoDate` — subscribers get re-notified,
  Atom stays conformant;
- correct the sentence **and leave a visible line in the entry**:
  *"Correction, 13 August: the extension needs no account, but the download on
  this site does — a free one. The GitHub release and the MCP registry ask for
  nothing."*

echo: Which also does the retention job, because a correction that re-notifies
is a re-engagement touch, and a visible correction is the most credible thing a
changelog can contain. A subscriber who sees Orbit publicly correct itself
within a day trusts the next entry more than one who sees nothing.

nebula: Neither lens gets there alone. Mine says "do not rewrite history" and
stops — it would have shipped a visible correction line into a feed that never
re-delivers it, which is a moral gesture nobody receives. Echo's says "the feed
will not re-notify" and stops — it would have bumped a date field and quietly
swapped the text, which is the rewrite. Together it is one small type change and
one sentence, and it is right on both axes. Medium: the blast radius is small
today, but this is the mechanism every future correction will run through, and it
is broken before its first use.

---

## 4. Sharpenings and dispositions on other lanes' R1 findings

| R1 finding | Our disposition |
|---|---|
| Iris §1 `changelog-no-account-claim-false` | **Confirmed live**, fix **insufficient** — see §3. Needs the type change and a visible correction line, not a string swap. |
| Echo §1 `paid-v0277-still-live-under-orbit-search` | **Confirmed, and worse** — the counter moved 72→73 during this review. Fix stands; ordering added (§1b). |
| Voyager §4 `release-download-count-unsnapshotted` | **Promote out of "queue for the week."** It is a hard prerequisite of a "shippable now" item, not a nice-to-have. |
| Nebula §1 `avoid-heading-as-brand-rule` | Stands, unchanged. Echo adds nothing; it is a parser bug with a creative blast radius. |
| Nebula §2 `brand-kit-validator-blind-to-typography` | Stands. echo: worth naming that this is also the flagship path's step 2 — a stranger following the README's headline section gets `operational_status: full` over a brand with no typeface, on the exact path the repositioning now leads with. |
| Nebula §3 `readme-proof-image-is-not-the-snippet` | Stands, and we still prefer the honest fix (name the richer sample) over the tidy one (re-shoot thinner). Same instinct as §3 above. |
| Atlas §1 `inbox-preview-kept-text-hover-only` | Stands. echo: this is the sharpest *usefulness* finding in the folder — a marketer cannot paste the answer anywhere, which kills the only sharing loop a widget has. |
| Nova §1 `homepage-modal-still-fires-at-2500ms` | Stands, and it is now the loudest thing between a stranger and the H1. Note it is unreachable while `b53f4c1` is unpushed anyway — everything on that branch is theatre until §2's push happens. |
| Pulsar §1 `github-repo-description-stale-counts` | Stands. nebula: it also still leads with "Lifecycle-marketing OS," the positioning this relaunch dropped, and omits *free*. Same defect as §1a — fix both fields in one sitting with the same sentence. |
| Sentinel §1 `pdf-import-ok-on-zero-extraction` | Stands. nebula: this is the flagship path's step 2 failing on the file format a *designer* is most likely to hand over. Between this and the typography-blind validator, two of the four flagship steps report `ok` over nothing. |
| Iris §4 `marketingskills-directory-unsubmitted` | echo: **downgrade to low.** Four cycles of re-filing a submission form nobody has filled in is not a finding any more; it is a task. It belongs on a list, not in a review. |

---

## 5. What we checked and deliberately did NOT file

- **The README's flagship section.** `## Build your own lifecycle brain` is
  section 2, right after "Try it in ninety seconds," with the four tools named
  and a real 14-file output listed. nebula: this is the best structural writing
  in the estate and it is the only place the new story is told properly. Nothing
  to add — the finding in §1a is that it stopped there.
- **`manifest.json`'s description.** Carries the flagship line, no signature, no
  stale counts. Echo's R1 confirmed it fixed; re-confirmed by direct read.
- **The Atom feed's general shape.** Correct namespace, self link, per-entry
  `<id>` on the canonical URL, `stale-while-revalidate` caching. The only defect
  is the `<updated>` conflation in §3.
- **`/whats-new`'s scope rule.** The 30-line comment at the head of
  `lib/changelog.ts` governing what does and does not belong in a release note
  is genuinely good editorial policy, better than most products have. It is also
  what got `lib/changelog.ts` mistaken for "content" on the tripwire's exclusion
  list — a good document with one bad consequence, worth fixing on the guard
  side, not the policy side.
- **The homepage H2s.** nebula: "Everything lifecycle marketers open in a new
  tab — in one place" is a *utility-belt* pitch and the flagship is a
  *system-builder* pitch, and I wanted to file that. I did not, because
  `b53f4c1` is unpushed and the homepage is about to change anyway; filing
  against a surface that is mid-move is noise. Re-check after the push.
- **Our own R4 items from the 11 Aug run** (social preview, three typefaces,
  single-polarity mark, no brand kit of Orbit's own). All still open, all still
  on the record, none re-filed as new. Pending, not forgotten.

---

## Verdict

nebula: Four new items, one retraction, and the retraction is the one worth the
money. The estate's guards are good and every one of them is pointed at the
working tree. That is why a passing tripwire produced a false "closed" this
morning, and why a five-minute changelog edit would have shipped a correction
nobody receives.

echo: Ship §2's production check and §1b's snapshot-before-delete this week —
both are ten-line jobs guarding irreversible things. §1a and §3 ride along with
the version bump and the changelog edit that already have to happen. None of it
is new engineering; all of it is the difference between a fix and a shipped fix.

*— Nebula × Echo, 13 Aug 2026*
