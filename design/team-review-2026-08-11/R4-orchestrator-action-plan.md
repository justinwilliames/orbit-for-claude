> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing
> here is a statement by or about a real person.

# R4 — Pulsar, Chief of Staff: the action plan

Read: all thirteen R1/R2 files (2,866 lines) and the four prior audits. Eight
drones, two rounds, 35 filed findings, six retractions — four of them of the
drone's own R1 fix, which is the only reason I trust the rest.

This is what we do, in what order, and what we are refusing to do.

---

## What the team agreed on

**1. Nothing ships today, and nobody had noticed.** `npm audit --omit=dev
--audit-level=high` exits 1. It is step 2 of the release workflow and step 1 of
the local build script. Every plan in this review — publish, republish,
screenshot, submit — sits behind a red pipeline that has been red for an unknown
number of days because no scheduled job ever looks at it. Sentinel found it,
then retracted his own fix and found the smaller true one: two of six advisories
are a stale lockfile, four are undici with no override at all.

**2. The one channel built for strangers is serving a file nobody can verify, of
the build this whole relaunch exists to delete.** The registry's `isLatest` is
0.27.7 — the paid build, by its own commit message — and its `fileSha256` does
not match the asset it points at. The 0.27.6 entry matches exactly, which is
what makes this a defect and not a coincidence: a human typed a hash from a
build that was not the build being shipped, and nothing checked. 63 of the 75
all-time downloads sit on that one asset. "~62 crawlers" and "a checksum that
has never matched" may well be the same observation from two directions.

**3. The most demonstrable thing in the release works on exactly one computer.**
`server/ui/` — 3,028 lines, the clearest answer to "why this one and not the
other lifecycle MCP" — resolves its host bridge at runtime out of the dev
repo's `node_modules`. On every real install `window.OrbitApp` is null, silently
by design, and the loudest button in the flagship widget (`--primary`, "Send to
Claude") is a bare `if (!app) return;`. Three drones independently wanted this
screenshotted at the top of the README. Atlas and Nova stopped them: a
screenshot of a capability the install cannot honour spends credibility rather
than failing to earn it.

**4. The paywall came down and the email wall did not.** `/api/mcpb-download`
says in its own header that no session is ever required. The only page linking
it is behind the account. Every CTA on the site — hero, footer, nav, 404,
`/skills`, `/apps`, the chat widget — resolves to `/sign-up`, whose banner still
reads "Sign in first. Downloads go through your portal", and the homepage's
JSON-LD tells Google that step 1 is creating an account. Four drones found this
independently from four different lenses. Meanwhile every search snippet and
every social share card still says **"$249, bought once."**

**5. We produced 35 hypotheses about strangers and zero observations of one.**
Greps over the 1,318-line R1 corpus: `interview`/`user research`/`watched
someone` — 0 hits. `launch post`/`Show HN`/`Reddit`/`community`/`outreach` — 0.
Every prescription is *pull* (be findable when someone arrives); not one is
*push* (tell somebody). And nobody queried the four and a half months of
per-install telemetry already sitting indexed in `mcp_telemetry`, which answers
"is this a discovery problem or a first-session problem?" in one `GROUP BY`.

---

## Shippable now

Ordered by what unblocks what. Do not reorder — items 1–3 gate item 4, and 4–7
gate the publish. Hours are honest single-operator estimates.

| # | Ships | Owner | Effort | Reversible? |
|---|---|---|---|---|
| 1 | **Green the pipeline.** `npm update brace-expansion fast-uri` + commit the lockfile (clears 2 of 6); add `"undici": "^7.29.0"` to `overrides` to hoist all three copies (clears 4 of 6). Add a weekly scheduled workflow that runs the audit alone. | Sentinel | 0.5h | Fully — lockfile revert |
| 2 | **Put the widget bridge in the bundle.** Add `@modelcontextprotocol/ext-apps` to `EXTERNAL_PACKAGES` in `scripts/build-extension.js`; add a build assertion next to the existing `bundledEntry` check; add `assert.equal(bridgeAvailable(), true)` to suite 28 — the export whose own docstring says "For tests" and which no test calls. | Sentinel | 1.5h | Fully |
| 3 | **Make the degraded path visible and the dead button honest.** In `WIDGET_PRELUDE`: read `window.ORBIT_BRIDGE_ERROR` (written by `shell.js:144`, read by nobody) and render a one-line footer notice; on `orbit:bridge-ready` with no `app`, move `--primary` from `#send` to `#copy`, disable `#send` with a hint, and give `sendReport()` review-gallery's honest flash. All five widgets inherit it. | Nova + Atlas | 1h | Fully |
| 4 | **Fix the tokens, not the widget.** Darken `--active-strong`/`--ok-strong` until the WARN (2.90:1) and PASS (3.40:1) pills clear 4.5:1 at 11px in light mode; mirror into `get-orbit/app/globals.css` where the same two hexes fail on the Liquid Builder's primary content label; add a contrast test over both palettes. The render gate currently fails the exact bar it cites. | Atlas | 1h | Fully |
| 5 | **LICENSE.** MIT at repo root, `"license": "MIT"` in `package.json` and `manifest.json`, one line in the README. Zero forks on an unlicensed repo is not a mystery, it is the correct behaviour of every engineer who checked. | Justin | 10 min | Fully |
| 6 | **Kill the $249.** `app/layout.tsx:60-77` (title/description/OG/Twitter — inherited verbatim by the homepage, which exports no metadata of its own), `app/about/justin/page.tsx:403`, `app/glossary/page.tsx:121`. Then force a re-scrape on the Twitter Card Validator and LinkedIn Post Inspector — those caches do not expire on their own. | Iris | 20 min | Fully |
| 7 | **One README pass, one pen.** Lead with the site's own sentence — *"A lifecycle marketer, built into Claude"* — the only line in either repo that passes the friend-repeatable test and currently the surface a stranger reaches last. Then: real counts (77 skills / 121 tools, generated from the manifest at build time, not typed); three widget screenshots (now truthful, after 2–4); one copy-pasteable zero-credential first prompt; a "What Orbit sends home" paragraph naming the endpoint, the four event types, the fields, and `ORBIT_TELEMETRY=0`; **delete** the star-history block — a live public chart of zero stars across three products this release deleted. Propagate the same first sentence into `manifest.json.description`, `server.json`, the GitHub repo description and the MCP instruction string. | Nebula holds the pen; Echo/Atlas/Iris/Voyager supply lines | 3h | Fully |
| 8 | **Take the turnstile down.** `/download` becomes a real page whose primary button is `/api/mcpb-download` with no session. Repoint the hero, footer, nav, 404, `ANONYMOUS_HREF`, `resolve-cta-state.ts`, `app/downloads/page.tsx` (delete its "never a direct .mcpb link" comment) and the HowTo JSON-LD. Account creation becomes an optional post-download offer sold on saved history and course certs. | Justin (see Decisions) | 2h | Fully — it is routing |
| 9 | **Emit outcomes.** `trackToolError({slug, errorClass})` in `server/telemetry.js`, called from the catch in `withToolErrorHandling` (~`index.js:6092`) with the code it already computes and throws at stderr — it already matches the server's validation regex character for character. Move `trackToolCall` after the handler so it records a result, not an intent. Fix the docstring that says it already does. One test. | Voyager | 1h | Fully |
| 10 | **Sign the work that travels.** One 11px "Made with Orbit → yourorbit.team" footer row in the standalone artifact path only (`!orbitEmbedded`, the check exists at `shell.js:204`), and default `artifact_path` to the workspace Orbit already creates instead of requiring the model to invent one. The only object Orbit produces that reaches a human without Orbit installed currently carries the brand in a `<title>` tag and nowhere else. | Nebula | 1h | Fully |
| 11 | **Republish the registry, from CI, at 0.28.0.** Version-bump so the free cohort is distinguishable by version string (today both the pre-launch paid cohort and every new install report 0.27.7, and `version` is the only cohort key in the schema). Have the release job `sha256sum` the asset **it just uploaded** and write `server.json` from that, then publish. Extend the parity guard to three files and assert `server.json` in suite 26. Do this **after** 1–8. | Sentinel + Justin | 2h | The publish is not — a registry name is a stable identifier |
| 12 | **Run the two queries.** `SELECT client_id, COUNT(DISTINCT DATE(created_at)) …` and `SELECT COUNT(DISTINCT slug) FROM mcp_telemetry WHERE type='tool_call'`. Ten minutes, existing data, no code. Answers whether this review is aimed at the right end of the funnel, and whether 121 tools is an asset or a symptom. | Justin | 10 min | N/A — read-only |

Total: roughly **13 hours**, one operator, plus one decision (item 8) and one
irreversible act (item 11's namespace).

---

## Queue for the week

- **Annotations, as one chain to the Connectors Directory** — not two findings in
  two files with nobody holding it. `manifest.json` carries annotations on **0 of
  121** tools (what a reviewer and the install dialog read); the running server
  carries them on all 121, of which **57 are fabricated read-only** by
  fall-through — including `orbit_compose_stripo_email`, which POSTs an email
  into the user's Stripo workspace. Fix: emit annotations into the manifest at
  build time; add the `live \ classified` assertion to suite 27 (it will fail on
  57 immediately, which is the point); move `orbit_compose_stripo_email` to
  REMOTE_WRITE, `orbit_brand_header` to LOCAL_WRITE + openWorld, and give
  `orbit_continue_job` the worst case of what it can redispatch. Then submit.
  This is the only channel that reaches a lifecycle marketer at the moment they
  want this. Owner: Sentinel → Iris. ~4h.
- **Move `enable_telemetry` from field 24 to field 4** and name the endpoint in
  its description. Today the only in-product disclosure of a default-on
  call-home sits behind twenty credential fields for seven products the user
  almost certainly does not all use. Two edits, no code. Owner: Atlas.
- **Kill the manufactured social proof.** `/api/downloads` is a bodyless,
  unauthenticated, unrate-limited POST; `useTrackDownload` is dead code with no
  call sites; the counter is live on the hero right now at 66, rendering "You're
  in good company — 66 marketers have installed Orbit" for a product this brief
  puts at ~13 humans, and it crosses into "Trusted by" at 50. Close or rate-limit
  the route, delete the dead hook, and either remove the counter or drive it from
  `COUNT(DISTINCT client_id)`. **Do not put the telemetry number on the homepage**
  — see Decisions. Owner: Voyager + Nova.
- **review-gallery parity.** Paste `diagram-view.js:96-99` verbatim so the rail
  stacks instead of vanishing under 860px (taking navigation, progress and the
  only readout of the reviewer's own work with it), and put the verdict in the
  button's accessible name rather than an empty 8px span. Both fixes are sitting
  two files away, unreused. Owner: Nova. ~1h.
- **One act of telling somebody.** Iris comes back with one channel, one asset,
  one date. Not a channel matrix. The operator ran CRM at Linktree and Depop and
  has a practitioner audience; neither fact appears anywhere in 2,866 lines of
  this review.

---

## Defer, with the reason

| Item | Why it waits |
|---|---|
| `Orbit Intelligence` signature mandate in `orbit.md` (lines 118-129, 534) | Nebula filed it in R1 as a README gap, then retracted and inverted it: the term is *mandated* on every diagnosis, recommendation and synthesis in the user's own workspace. It is a real tax on first-session trust, but it is a voice edit with no measurable audience until items 1–11 create one. Do it in the same pass as the copy work, not before. |
| Widget palette identity (stock Tailwind indigo/amber/emerald) | Nebula's professional pet hate, honestly declared twice. Nobody has ever declined to star a repo over indigo-500. The tokens file gets opened anyway for item 4; if the identity question rides along free, take it — otherwise hold. |
| `pre_render.verdict: "pass"` rename to `size_verdict` | Correct and small. It only misleads a model on the artifact path, and item 3 puts a visible notice on that path anyway. Bundle into the next widget touch. |
| Nine failure-mode assertions across five of thirty suites | Sentinel measured his own standing complaint and refused to file it. It does not move a stranger to install, star or write about Orbit. Recorded as the *reason* the annotation and manifest defects went unnoticed, not as a board item. |
| `getClientId()` write-failure inflating distinct-install counts | Unbounded blast radius at negligible probability, and it only becomes urgent if that count is ever promoted to a public number — which we have now decided it should not be. Revisit if that reverses. |
| Email-capture modal firing at 2.5s on the homepage | Real, and it taxes the only thing a cold visitor has. But it is downstream of item 8: if the CTA no longer routes to a signup form, the modal is the *second* email ask a stranger meets, not the first. Fix after the door, when we can see what it costs. |
| MCP SDK v2 / spec 2026-07-28 migration | A two-week-old beta with an unconfirmed host rollout. The prior ecosystem audit already says don't rush it. Re-check in 4–6 weeks. |
| The 13-tool Stripo surface, and pruning 121 tools generally | Genuinely arguable — but item 12's second query decides it in ten minutes. If 15 tools carry all the real usage, the README writes itself from the 15 and this becomes a ship item. Guessing first would be the expensive order. |
| Dead `activation.js` comments in `config.js:39` and `mailchimp-api.js:31` | Two lines. Delete them the next time either file is open. Filing them as work is the padding the brief told us not to do. |

---

## Decision needed

Five genuine forks. Each is binary; none is mine to close.

| Decision | Take A | Take B | My call |
|---|---|---|---|
| **Registry namespace**, before the republish | Keep `io.github.justinwilliames/orbit-for-claude`. Preserves version history and whatever the existing entry accrued; costs nothing today. | Publish under the DNS-verified `yourorbit.team` with searchable tokens (e.g. `team.yourorbit/email-marketing-braze`). Registry search matches the **name**, not the description: `braze` returns **zero servers registry-wide** — Orbit is very probably the only Braze MCP in existence and cannot be found by the word. Changing it later splits version history. | **B.** The existing name has accrued 63 downloads of an unverifiable file. There is nothing to preserve. This must be settled before item 11 or the automation locks the unsearchable name in. |
| **The email wall** (item 8) | Keep `/sign-up` as the door. Attributable signups, a list you own, course/cert funnel intact. | Direct `/api/mcpb-download`, account moved to a post-download offer. A stranger tries the thing in 90 seconds. | **B**, and the code comment proves the gate is deliberate, so this needs a name against it rather than a patch. The counter-argument is real: a list of 66 is worth more than 66 anonymous downloads *if* the emails convert. They have not, in 4.5 months. |
| **Telemetry** | Keep default-on, disclose loudly in README + PRIVACY.md + field 4 of the settings panel. | Flip to default-off with an ask on first run. | **A.** The payload is genuinely minimal and server-enforced; the defect is placement, not behaviour. But disclosure is non-negotiable and it is a *prerequisite*, not a parallel task — a stranger who greps `fetch(` and finds an undisclosed vendor endpoint concludes "what else didn't they mention", which is a very expensive way to lose the one reader in a hundred who was going to write about it. |
| **The homepage number** | Swap the download counter to `COUNT(DISTINCT client_id)` — crawler-proof by construction. | Show no number; keep distinct-installs internal in `getAdminSummary` where it already lives. | **B.** Sentinel and Voyager fought this out and Voyager withdrew his own placement. Publishing the telemetry count makes your public proof a function of how many people exercised the opt-out you just documented. Show a stranger provenance, not traction. |
| **Order: fix the funnel, or measure it first** | Ship items 1–11 now; the two queries are nice-to-have. | Run item 12 first; it decides whether the problem is discovery or the first session, and therefore whether half this list is aimed at the right end. | **Both, in the same afternoon.** The queries cost ten minutes and cannot delay anything. But items 1–6 are true under either hypothesis — a red pipeline, an unverifiable registry asset, a missing licence and a $249 search snippet are wrong whichever answer comes back. Do not hold them for the query. |

---

## What we did NOT find

Honest gaps, so R5 doesn't file them as wins.

- **We never observed a stranger.** Zero interviews, zero usability sessions,
  zero recorded first runs, across 2,866 lines. Every one of the 35 findings is a
  hypothesis about why someone bounced. The shared assumption underneath all
  eight lenses — that Orbit has a distribution problem and not a demand problem —
  is load-bearing for this entire plan, was never tested, and is cheap to test.
- **We never queried the data we already have.** Four and a half months of
  per-install `session_start` events, indexed on `client_id`, sitting in
  Postgres. Whether a single install ever ran a second session has been one
  `GROUP BY` away for months and nobody turned round and asked. Item 12 is the
  correction, and it is embarrassing that it is a to-do rather than a finding.
- **We proposed no demand generation whatsoever.** Every fix on this board is
  passive: be findable, be honest, be installable *when someone arrives*. Two
  unique repo visitors in fourteen days. Better plumbing on approximately zero
  flow is still approximately zero. Orbit has never had a launch — it went
  public 4.5 months ago, priced, quietly, and today's relaunch consists of
  deleting a paywall and fixing metadata.
- **We are keeping score on a board the customer doesn't play on.** Stars, forks,
  repo visitors — developer currency. Orbit's stated user is a lifecycle marketer
  who will very probably never star a repo in their life. Orbit could succeed
  completely and still show 0 forks. Roughly half this list is *credibility
  hygiene* aimed at a judge who is not the buyer. Worth doing — the developer
  read is what produces write-ups — but it should be labelled honestly and we
  need a metric that can distinguish success from failure. Weekly returning
  installs, from item 12.
- **We never verified that any host actually renders the widgets.** The prior
  ecosystem audit is explicit that MCP Apps only graduated into the spec's
  Extensions framework on 28 Jul 2026 and that Claude Desktop's support for the
  new revision is "rolling out soon" — unconfirmed. We proved the bridge is
  absent from the bundle; we did not prove that fixing it makes anything appear
  on a stranger's screen. Item 2 should be verified against a real install, not
  a green test.
- **Nobody asked whether 121 tools and 77 skills is an asset or a symptom.** Zero
  corpus hits for `too many tools`, `tool count`, `context window`, `prune`.
  Three drones treat the count as *understated* and want it advertised louder.
  Not one asked what a 121-tool surface does to a model's tool selection, or to a
  stranger's ability to answer "what is this for?" in ten seconds.
- **We did not look at a single competitor.** No comparison of what a lifecycle
  marketer evaluates Orbit *against*, in the registry or out of it. The one
  adjacent measurement we have — `braze` returns zero servers — suggests there
  may be no competitor at all, which if true is a much bigger story than
  anything on this board and nobody chased it.
- **Thirty-five findings, and only two of the prescriptions were deletions.**
  Everything else adds a file, a paragraph, a field or a test. For a product
  whose problem is that a stranger cannot tell what it is in ten seconds, a
  review that is 33-to-2 additive should make us suspicious of ourselves.

— Pulsar
