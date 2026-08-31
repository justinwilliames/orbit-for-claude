> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# Iris — Marketing cross-reference, R2 solo pass (13 Aug 2026)

This is not a new findings list. It's the read the other eight lenses didn't do: all nine R1 files, side by side, asked one question — where does the brand/channel/lifecycle story hold or break, and which of these 29 findings carries a go-to-market consequence bigger than the one its own author gave it. I filed my own four (`changelog-no-account-claim-false`, `github-repo-description-stale-counts`, `compare-page-missing-braze-mcp`, `marketingskills-directory-unsubmitted`) inside R1-iris already; nothing below re-files them, it places them next to the other 25.

The north star stays the brief's: does this make Orbit more useful, or more findable, to a stranger who has never heard of it. Six of the 29 findings move that needle hard. The rest are real but narrower than that, and I say so rather than pad.

---

## 0. Read this one first: nothing below matters if `merge-at-published-version-ships-nothing` isn't fixed

Pulsar filed this as a release-engineering gap. Its actual stakes are entirely mine. Nine commits on `orbit-for-claude` and one on `get-orbit` — including the README fix, the registry rename, the account-claim correction, the GitHub description fix, everything this document is about to argue matters — sit on unmerged branches with no PR open on either repo. Pulsar's own reproduction: a push to `main` at the current version goes green (`build success`, `Refuse to re-release a published version` step fires correctly) and *ships nothing*, because the release guard treats "already published" as a non-error on push, by design, and nobody bumps the version before merging.

The marketing consequence: every fix in this cross-reference — the registry description, the SPF advice, the account-claim propagation — is a fix to a *branch*, not to the product a stranger can currently install. `FINAL-SHIPPING-DECISION.md` made exactly this mistake once already, on 11 Aug ("20 commits and 11 commits sit on `free-orbit-remove-monetisation`... Everything in §2 is currently invisible to everyone on Earth"), and the team is repeating the same operational failure two days later on a different branch. This isn't a new pattern; it's the same one, unowned a second time. I'd rank this the single highest-leverage item in the combined 29 — not because it's the most severe defect, but because it's the one thing that, left broken, makes every other fix in this document theoretical.

---

## 1. The flagship pitch is "we measure, not assert" — and four separate surfaces are quietly asserting

Nebula names this exactly, in the context of her own three findings: *"Orbit's entire pitch is we measure instead of asserting. The front door asserts."* That sentence is bigger than her section — it's the actual marketing claim on the site and in the README, and it's the thing that differentiates Orbit from a prompt pack. Read across all nine files, it breaks in at least four places nobody connected before now:

- **`avoid-heading-as-brand-rule` + `brand-kit-validator-blind-to-typography`** (Nebula) — the brand-kit tooling that's supposed to *govern* a user's creative reports `status: "ok"` / `operational_status: full` over a kit missing its real rule, carrying a markdown heading as a fake one, and missing typography entirely across nine placeholder sections.
- **`pdf-import-ok-on-zero-extraction`** (Sentinel) — the flagship path's own step 2 ("ingest what they already send — an HTML email, a Figma file, a PDF — this IS their design system") returns `status: ok` on a PDF it extracted zero real words from, and hands six empty `rich_text` components downstream as if a human wrote them.
- **`presend-gate-blind-to-style-blocks`** (Sentinel) — `orbit_qa_email`, the tool literally described as *"the default 'is this email ready to send?' check,"* returns `verdict: warn, fails: 0` on an email with 1.09:1 body-copy contrast, because its contrast checker only reads inline `style=`/`bgcolor` attributes — and Orbit's own doctrine (this repo's CLAUDE.md, `should_inline_css:false` on every Braze push) *mandates* the exact `<style>`-block encoding the checker can't see. The tool fails silently on precisely the email format Orbit tells its own users to ship.
- **`orbit-score-preheader-no-widget`** (Atlas) — the tool description promises *"Returns per-client preview strings so you can see exactly what each inbox will show"* and returns a JSON table with no picture at all, one call away from the sibling tool that already solved this.

No individual reviewer filed these as one story because each sits in a different codebase layer (brand tooling, PDF ingest, QA gate, tool description). Together they're the same defect repeated four times against the same public claim, and it's the claim doing the heaviest lifting in Orbit's positioning against every prompt-pack competitor on `/compare`. If a marketer builds their brand kit, imports a PDF, and runs the pre-send gate — the three steps the server instructions literally walk a new user through in order — none of the three tools tell them the truth about what they just did. That's not a bug list; it's the entire onboarding path quietly failing its own headline promise, and it should be triaged as one item, not four unrelated tickets.

---

## 2. The stranger's first, credential-free touch can hand them a real domain outage

`spf-redirect-false-warn-harmful-advice`, `spf-nested-lookup-undercount`, and `dkim-error-swallow-asserts-absence` (Sentinel + Voyager, both instrumented against live domains) all sit in the two or three tools a cold visitor can run with *zero setup* — no key, no account, domain only. That's not incidental to my lens; it's the entire point of removing the paywall. The whole relaunch bet is: lower the barrier to a stranger's first fifteen seconds so they get value before they've committed anything.

What's waiting on the other side of that lowered barrier, per Sentinel's own reproduction against `hubspot.com`'s live DNS: a correct `v=spf1 redirect=` record gets told *"tighten to -all"* — advice that, followed, breaks the redirect and fails every server it was authorising. Per Voyager's: `zendesk.com`'s real RFC 7208 lookup count is 6; Orbit reports 1, and its own remediation copy tells the reader to *"reduce include:/redirect= chains under 10 lookups"* — a number it has never actually counted correctly. Per Voyager's DKIM probe: 28 attempted lookups that all timed out get reported as *"selectors_checked: 28... No DKIM selector was found,"* discarding a selector the user explicitly supplied.

The audience for these three tools is deliverability people and email marketers — a small, technically literate, screenshot-sharing community, and precisely the community whose word of mouth Orbit needs given zero stars and two unique visitors in fourteen days. A confidently wrong SPF verdict handed to that audience isn't a private engineering embarrassment; it's the kind of thing that gets quote-tweeted with "this AI tool told me to break my email auth." That risk is categorically worse than the tool returning nothing, because a stranger trusts a number more than a blank field. I'd escalate these three above where their own authors graded them (two high, one medium) specifically because of who's on the other end of a credential-free tool call — that's the whole design intent of removing the key requirement, and it's currently the riskiest place in the product for exactly that reason.

---

## 3. The brand name currently points at the thing this whole relaunch killed

`deprecated-entry-owns-the-brand-name` (Voyager) and `paid-v0277-still-live-under-orbit-search` (Echo) are two readings of one fact, and stacking them changes the verdict. Voyager: `search=orbit` on the live registry returns nothing but the deprecated, licence-gated `io.github.justinwilliames/orbit-for-claude` entry — the `statusMessage` correctly names the successor, but that field lives in `_meta`, which a client may not render, while the `description` field every client *does* render still sells "60+ skills and 80+ tools," the exact stale-count language this review corrected months ago. Echo, independently and fresher: the actual `.mcpb` asset behind that entry still returns `200`, still demands an activation key against a pricing page that no longer exists, and **72 people have already downloaded it** — more than every free 0.28.x/0.29.x build combined, per Voyager's own release-download table in finding 4.

Read together: this isn't a discoverability gap, it's an anti-discoverability trap. A stranger who does the one thing every piece of Orbit's own copy trains them to do — search "orbit" — gets routed *past* the free product and into a dead paywall, worse than finding nothing at all. And it's not hypothetical traffic; 72 real downloads is the single largest number in this whole review's evidence for "somebody found this." The fix costs two things, both cheap and both named across the two findings: republish the deprecated entry's `description` field (not just `_meta`) with the successor name, and pull the `.mcpb` asset off the old GitHub releases. Neither requires new engineering. This is the highest-consequence-per-hour item on the list after the merge gap in §0.

---

## 3b. The one number that would tell us if any of this worked isn't being kept

`release-download-count-unsnapshotted` (Voyager) belongs next to §3, not filed separately in my head: `download_count` on a GitHub release is a gauge, not a series — delete or re-cut a release and the history is gone, and there's no way today to ask "how many installs in the week after the registry rename." Voyager's own pull is the only quantitative stranger-touched-this number in either review round (41 downloads across the free builds in two days, against the brief's "2 unique repo visitors in 14 days" — the two instruments disagree, and that disagreement is itself worth someone's attention). Every fix in this document is aimed at a number nobody is currently snapshotting. The fix Voyager names — append `{date, tag, download_count}` to a committed JSON file on the existing Monday audit job — is thirty minutes and turns every future "did the registry fix work" question from a guess into a subtraction. Cheap, and it's the only way anyone will know if items §2–§6 actually moved anything.

## 4. The same defect shape, twice in two days: a true decision made once, never finished propagating

My own R1 finding (`changelog-no-account-claim-false`) and Pulsar's (`false-account-claim-live-sitewide`) are the same bug, found independently, in different places, on the same day. Mine: the changelog's own headline entry ("no account... downloads no longer sit behind a sign-up wall") went false the same calendar day it published, because the account gate came back for the site download hours later. Pulsar's: eight instances of "one email to download" plus the sitewide meta description still promising exactly that, live on `main`, while `main`'s own sign-up route enforces five required fields including a password and a security question — a fix (`b53f4c1`) already exists and is correct, it just isn't merged (see §0 again).

I flagged in my own R1 verdict that this is the second time in as many review cycles I've found this exact shape (R3, 12 Aug: the changelog missed the *previous* relaunch too). Two independent lenses catching the same shape on the same day, on top of a third occurrence four days earlier, is a process signal, not a coincidence. Orbit doesn't have one place that says "this is what the commercial terms are right now" — every business-model change requires someone to grep the whole site by hand, and it's been missed at least three times running. The individual fixes are each cheap; the pattern won't stop recurring until there's a single source of truth (even a one-line constant imported everywhere the claim appears) or a tripwire test in the shape Echo already confirmed works for the "one email" overclaim (`tests/tripwires/signup-cost-claim.test.mjs`). Worth minuting as a standing recommendation, not just two more one-line patches.

---

## 5. The front door of the front door — cheapest fix in the whole document

`github-repo-description-stale-counts` (mine) and `github-repo-description-never-synced` (Pulsar) are one bug seen from two angles: the GitHub repo's "About" field — the tagline under the repo name, in GitHub's own search index, in any share card GitHub generates when nothing else overrides it — still reads "60+ battle-tested skills and 80+ tools," against a real 79/126, and still leads with "Lifecycle-marketing OS," the positioning this relaunch dropped. `scripts/sync-counts.mjs` fixed this everywhere it could reach — README, manifest.json, server.json, server/index.js — because those are files in the repo. The GitHub API field isn't a file, so the sync script structurally cannot see it, and nobody added a sixth target.

Pulsar's framing is the more durable one: the bug isn't the drift, it's that the guard's scope was defined by what was easy to rewrite rather than by what a stranger actually reads. My framing adds the number: this field understates the tool count by 44% and the skill count by 24%, for a product whose only functioning distribution lever right now is people landing on this exact page. `gh repo edit --description` is a thirty-second fix. I'd put it at the top of anyone's actual TODO list this session — smallest effort, largest stranger-facing surface, of anything in this review.

---

## 6. The page every "Get Orbit" click lands on has two separate leaks in the same spot

Three findings converge on one page: `downloads-page-still-orphaned-from-getting-started` (Echo, four cycles running: `/downloads` step 4 never links to `/getting-started`, even though every other surface in the site does), and buried inside `e2e-red-hides-a-real-routing-regression` (Pulsar) is a second, genuinely new instance of the same gap — the site's own chat answer router now sends the query *"getting started guide"* to `/downloads` instead of `/getting-started`, a real regression that the always-red Playwright suite caught and nobody read, because the suite has been red since before this relaunch and the team (correctly, per R4) stopped opening the log.

Put those two together and `/downloads` — the single highest-traffic page in the funnel by construction, since it's the destination of every CTA on the site — has now lost its own onward path to the getting-started guide twice: once in its own static copy, once in the dynamic chat router that's supposed to compensate for exactly that kind of gap. A visitor who converts on `/downloads` and then asks the site's own assistant "what's next" gets handed back to the page they're already on. Echo graded her instance medium because a confused user can still find nav; that's fair for the static-copy version, but the chat-router instance is worse — a repeat "what next" query from someone who already tried the obvious next step reads as the product not knowing its own site. Worth fixing both in the same pass Pulsar's already recommending for the dead Playwright test (`homepage-modal-still-fires-at-2500ms-no-home-exclusion` is the third funnel leak on this list, but it's a different page — the homepage's 2.5s full-screen capture gate over cold organic traffic with no home-page exclusion, unchanged since last round).

---

## 7. What I'm not elevating

`biome-wasm-dead-weight-in-bundle` (Voyager/Sentinel, ~8MB of a dead-code formatter) is real and cheap but moves neither the "findable" nor "useful" needle — nobody has failed to install Orbit over file size, both authors say so themselves. `bootstrap-required-flag-unreachable` (Pulsar) and `review-gallery-dot-no-visible-tooltip` (Nova) are internal/accessibility hygiene with no stranger-facing consequence beyond what their own authors already scoped as low. `review-outputs-gitignored-and-overwritten` (Pulsar's housekeeping note) is a real process gap — this review folder has already lost one full cycle of R1 findings to an overwrite, which is a bad way to run institutional memory on a product whose whole story keeps needing "what did we already decide" — but it costs the review team, not a stranger, so it stays a footnote here rather than a headline.

`site-skill-count-13-low-on-mcp-claims` (Pulsar) gets one line because it's the rare finding that costs the opposite direction of everything else on this list: the site is *underselling* itself by 13 skills against the MCP's own manifest. Cheap to fix alongside the GitHub-description fix in §5, low urgency, worth bundling rather than a separate pass.

---

## Verdict — ranked by stranger impact, not by severity label

1. **Fix the merge gap first** (§0). Every other item on this list is a fix to a branch until this is closed.
2. **Republish the deprecated registry entry's `description` and pull the `.mcpb` off the old GitHub releases** (§3) — the brand name currently actively harms, not just fails to help.
3. **`gh repo edit --description`** (§5) — thirty seconds, worst effort-to-reach ratio of anything found this round.
4. **Treat the four "we measure, not assert" surfaces as one ticket** (§1) — the flagship path's own three steps each quietly fail the claim the whole product is positioned on.
5. **The SPF/DKIM trio** (§2) — re-grade by audience, not just by code path; these are the only tools a skeptical, vocal, technically fluent stranger can run with nothing to lose.
6. Everything in §4 and §6 is real, cheap, and worth doing in the same pass as whatever engineering is already touching those files — but none of it is a blocker the way 1–5 are.

Nothing here is padding. Twenty-five of the other lenses' 29 findings are accounted for above by theme; the four not mentioned (`review-gallery-fixture-mislabelled`, `readme-proof-image-is-not-the-snippet`, `inbox-preview-kept-text-hover-only`, `review-gallery-dot-no-visible-tooltip`) are genuinely single-lens UX/creative-QA items with no separate GTM angle beyond what Nebula, Atlas and Nova already gave them — I checked each for a marketing consequence and didn't find one worth manufacturing.
