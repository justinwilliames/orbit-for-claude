> Personas are fictional cognitive frames — see the pulsar-team SKILL.md §1 disclaimer. Nothing here is a statement by or about a real person.

# R3 — Iris — committed position

## The shared diagnosis

Four rounds of drift, now settled: the empty-state and clipping defect was never "short pane" — it's Orbit pinning `body{height:100vh;overflow:hidden}` in all 23 widget files while discarding `hostContext.containerDimensions` entirely. Sentinel and Voyager proved it by counterfactual, not inspection: strip the pin, `esp-matrix` reports 1170px at every viewport and renders all 8 rows at 100% visible `[instrumented]`. The fix is real. What it hasn't cleared is Sentinel's own remaining gate — a live Codex CU read of `getHostContext()` inside actual Claude Desktop, because the harness has no host to lie to. That's still open going into R4.

## THE VISITOR — named and defended

**(a) A lifecycle marketer evaluating Orbit against tooling they already know.** Not (b). I stopped guessing and read the site's own targeting, which settles it without ambiguity `[instrumented]`:

- `app/page.tsx:196`: "Works with Klaviyo, Iterable, HubSpot, Customer.io, Mailchimp, Salesforce Marketing Cloud, and Braze — **plus** everyone who just wants the tools." The Claude-native user is the "plus," explicitly secondary.
- `components/integration-wall.tsx:52`: "Works with the platforms **you already run**." Presupposes the visitor runs one.
- `app/page.tsx:101` (FAQ schema): "How is Orbit different from a template library?" — a question that only exists for someone who already knows what a template library is.
- `app/layout.tsx:88-104`, the meta description and keyword list: "Braze naming convention," "Liquid templating," "IP warm-up schedule," "deepest on Braze." That's SEO aimed at a practitioner's search vocabulary, not a Claude user's.

Nobody writes "roughly two-thirds works with nothing connected" for a reader who doesn't already know what "connected" costs elsewhere.

## The final roster — and the false consensus, owned

R1 me picked `esp-matrix` (conditional) and `lifecycle-flow` — one-for-three against Echo/Nebula's eventual `render-gate` / `rfm-map` / `inbox-preview`. I got there for the wrong reason: I ranked on "unique data" and "cheap to make presentable," not on what a tooling-literate buyer evaluates on. Echo's card-mechanism finding (R1) killed `lifecycle-flow` outright — title straight to a grey box, fails the stranger test cold regardless of who the stranger is — and I retracted it in R2. By R2 I'd independently landed on the same three Echo/Nebula named, plus `esp-matrix` held as a conditional fourth.

**Naming the visitor changes esp-matrix's status, not the other three.** For a lifecycle marketer doing platform comparison-shopping, "does it work with the ESP I'm actually on" isn't a nice-to-have screenshot — it's the first evaluation question, and the site currently answers it with a flat grey logo wall and nothing else. **Final roster: `render-gate` (FAIL), `rfm-map`, `inbox-preview`, `esp-matrix`.** Four, not three — the count under-shot because nobody had named the audience `esp-matrix` is built for. Same gate as R2, unchanged: it enters only once Sentinel's live-host read confirms the fix and a changelog entry ships in the same release. `cohort-retention` stays off the homepage — Echo/Nebula's list-level story-fork argument holds regardless of audience literacy.

## THE NUMBER — answering Vector by name, again, with the schema checked

`get-orbit/lib/db.ts:363-379` — I read it, not assumed it: `cta_clicks(id, slug, page, user_email, anon_visitor_id, traffic_type, created_at)` plus `location TEXT` added by a later `ALTER TABLE` (`:373`). It holds what I need. One gap worth flagging, not blocking: `location` has no index — `slug`, `created_at`, `traffic_type` do (`:375-377`). Fine at current volume; add one if this ships and the query gets slow.

**Metric:** CTR for `location="proof-strip"` against the existing `location="after_demo"` (`app/page.tsx:347`) and `location="hero"` (`:187`) baselines, denominator from `page_engagement.max_scroll_pct` reaching the section. **Window: 14 days post-ship.** I don't have current traffic volume from this repo alone, so I'm not fabricating a sample-size number — that's a `[judgement]` gap, not a dodge. **Cut condition:** if proof-strip CTR doesn't beat `after_demo` inside the window, the section is cut. Fixtures aren't deleted — they get demoted to a technical-evaluator surface, not thrown away.

## Placement

`get-orbit/app/page.tsx:354` — one line, between the demo section's closing `</section>` (`:353`) and the Integrations section comment (`:355`). Sequence: simulated demo → **real proof-strip, new** → flat-grey `IntegrationWall`. The strip answers "does it actually work with my stack" in evidence right before the logo wall claims it in text.

## Top concession

To Vector: you named the metric gap in R1 and I let it sit through a full round before answering it in R2. "Make Orbit feel finished" was never a defensible fallback — you were right to threaten the four-item cut.

## Line in the sand

`esp-matrix` does not ship — on any roster, for any audience — until Sentinel's live-host verification lands and a changelog entry documents the fix in the same release. Audience-fit doesn't override a correctness gate.

## Vote — three principles for R4

1. One company, one week, one send, one list (Nebula/Echo's fork) — no second invented world.
2. No asset ships without a named `location` value and a comparator baseline already in the codebase.
3. A prose "won't-fix" note is not a decision — `changelog.ts:236` sat unexecuted for eleven releases; every fix from this review gets a gate that can go red, not a comment.

## Question for R4 — asked aloud

`~/code/pulsar/scripts/say.sh "Sentinel — did the Codex CU run against live Claude Desktop confirm containerDimensions actually arrives, and does esp-matrix render at full height in the real host, or are we still shipping a proof-strip asset on a harness-only fix?" --agent iris`

— Iris
