# Amplitude Analytics API — capability survey

**Platform key:** `amplitude`
**Base URL:** `https://amplitude.com/api` (EU data residency: `https://analytics.eu.amplitude.com/api`)
**Auth:** HTTP Basic, `Authorization: Basic base64(api_key:secret_key)` — the project's API key and secret key from Amplitude → Settings → Organization settings → Projects → your project → General
**API version:** Unversioned by name; Amplitude ships several parallel API *families* under one docs tree (Dashboard REST, Behavioral Cohorts, Taxonomy, Export, User Profile, SCIM, DSAR, …), each with its own base host and its own rate-limit budget. Orbit's adapter speaks two of them: the **Dashboard REST API** (`/2/*`, `/3/annotation-categories`, etc.) and the **Behavioral Cohorts API** (`/3/cohorts`, `/5/cohorts/*`).
**Verified against live docs:** 2026-08-24.
**Endpoint inventory source:** <https://amplitude.com/docs/apis> (the API family index — the only page in this tree that actually resolves; see §4) and <https://amplitude.com/docs/apis/analytics/dashboard-rest> (the endpoint table, cost model, rate limits).

Amplitude's Dashboard REST budget: **up to 5 concurrent requests**, **up to 1000 cost within a 5-minute window**, **up to 108,000 cost per hour**, all per project. Cost is `(# of days) × (# of conditions) × (cost for the query type)`; Event Segmentation costs the number of events in the query plus 4 per group-by, Funnel Analysis costs `steps × 2` plus 4 per group-by, Retention Analysis is a flat 8, User Sessions is 4, everything else is 1. Exceeding the budget returns **429**, and Amplitude's own docs say the error body "includes information about which limit you exceeded" — but do **not** document response headers such as `X-RateLimit-Limit/Remaining/Cost` for successful (2xx) calls (see §4, UNVERIFIED).

The Behavioral Cohorts API carries its own, separate budget: **60 requests / 10 minutes per app**, **4 parallel requests/minute per app**, and — on top of the per-request limits — a **monthly download quota** (500 cohort-download requests/month on Growth/Enterprise plans, checkable via `GET /3/cohorts/usage`).

---

## 1. Confirmation of the existing 6 real operations

Amplitude's matrix carries 15 operation keys total (the 10 shared `OPERATIONS` plus 5 CDP-shaped ones), but 9 of those are `unsupported` by construction (Amplitude is not a warehouse and not a CDP — see §3). This table covers the 6 rows that actually call the network.

| Op key | Current Orbit record | Verdict | Endpoint (verified) | Doc URL | R/W | Note |
|---|---|---|---|---|---|---|
| `checkAuth` | `native` | **Confirmed, doc URL is DEAD** | `GET /2/users` (params `m=active`, `i=1`, one-day window) | should be <https://amplitude.com/docs/apis/analytics/dashboard-rest> | read | Endpoint and shape are correct — `/api/2/users` is documented as "Active/new user counts" in the Dashboard REST endpoint table, and a single-day active-user count is a cheap (cost 1) authenticated probe. **But the recorded `doc_url`, `https://amplitude.com/docs/apis/analytics`, is a 404** — see §4. |
| `listCohorts` | `native` | **Confirmed, doc URL is DEAD** | `GET /3/cohorts` | should be <https://amplitude.com/docs/apis/analytics/behavioral-cohorts> | read | Confirmed live: returns `id`, `name`, `size`, `archived`, `published`, `lastMod`, `lastComputed`, `owners`, `viewers`, and more, exactly the fields `normaliseCohort()` reads. Same dead-URL defect as `checkAuth`. |
| `getCohort` | `partial` | **Confirmed, doc URL is DEAD** | `GET /3/cohorts` (client-side filter to one id) | should be <https://amplitude.com/docs/apis/analytics/behavioral-cohorts> | read | The reasoning is accurate: Amplitude's only per-cohort route is the 3-step **download** flow (`GET /5/cohorts/request/{id}` → poll `GET /5/cohorts/request-status/{request_id}` → `GET /5/cohorts/request/{request_id}/file`, which redirects to a **1-minute-valid presigned S3 URL** or returns an API link valid 7 days) — a bulk per-user membership export, correctly not built. Selecting metadata from the list call instead of calling that flow is the right ceiling. |
| `getSeries` | `partial` | **Confirmed** | `GET /2/events/segmentation`, `GET /2/users` | should be <https://amplitude.com/docs/apis/analytics/dashboard-rest> | read | Both endpoints and their parameter shapes are correct. One clarity note, not a bug: the `reason` text says "at most a 365-day window" as though Amplitude enforces that cap — the live docs do **not** state a 365-day hard limit on either endpoint; `MAX_WINDOW_DAYS = 365` (`server/data/amplitude-api.js`) is **Orbit's own cost-control ceiling**, not a vendor limit. Worth rephrasing so a reader doesn't infer Amplitude itself refuses a 400-day request — it wouldn't, Orbit would. |
| `getFunnel` | `native` | **Confirmed** | `GET /2/funnels` | <https://amplitude.com/docs/apis/analytics/dashboard-rest> | read | Correct as recorded, correct doc URL already. `steps × 2` cost formula confirmed verbatim against the live cost-model table; `MAX_FUNNEL_STEPS = 10` is Orbit's own ceiling (each extra step doubles cost), not a documented Amplitude cap either — same clarity note as `getSeries`. |
| `getRetention` | `partial` | **Confirmed — the flagged constraint is real** | `GET /2/retention` | <https://amplitude.com/docs/apis/analytics/dashboard-rest> | read | This was the specific claim to verify, and it holds. The live doc's own parameter definitions: **`se`** — *"Required. Full event for the start action. Supports two `event_type` values: `_new` for new users, and `_active` for all users."* **`re`** — *"Required. Full event for the returning action. Supports one `event_type` value: `_all` for all events and `_active` for all active events."* No custom event name is accepted in either slot — confirmed, not refuted. `rm` (retention type: `bracket`/`rolling`/`n-day`, default `n-day`) and `rb` (bracket days, required only when `rm=bracket`) are also correctly modelled as optional/conditional in the adapter. |

**Score: 6 of 6 confirmed accurate at the support level. 0 wrong.** Two rows (`getFunnel`, `getRetention`) already carry correct, specific doc URLs. Four rows (`checkAuth`, `listCohorts`, `getCohort`, `getSeries`) carry a **dead** `doc_url` — worse than Braze's "generic but live" defect, this one 404s. Two rows (`getSeries`, `getFunnel`) have a `reason` that could be misread as a vendor limit when the cap is Orbit's own.

---

## 2. Proposed NEW operations

Op keys chosen to read sensibly across the data-platform family (Amplitude, Databricks, Segment, RudderStack) the way Braze's proposals read across ESPs.

### 2a. Individual-user reads (the largest gap)

| Op key | Label | Amplitude endpoint | Doc URL | R/W | Why it matters for lifecycle |
|---|---|---|---|---|---|
| `getUserProfile` | read one user's real-time profile | `GET /v1/userprofile` on the **separate host** `https://profile-api.amplitude.com` | <https://amplitude.com/docs/apis/analytics/user-profile> | read | The single most valuable read Orbit is not modelling for Amplitude — the direct analogue of Braze's `getContactProfile`. Returns user properties, Amplitude's own **computed** properties, the list of cohort IDs the user currently belongs to, and (where configured) Recommend model output. Documented as **server-side only** and **not available in the EU data-residency region** — both are real constraints an Orbit adapter would need to surface honestly, not silently degrade. Org-wide budget is a shared **600 requests/minute across all endpoints on that host**. |
| `getUserActivity` | read one user's raw event timeline | `GET /2/useractivity` | <https://amplitude.com/docs/apis/analytics/dashboard-rest> | read | The Amplitude analogue of Braze's `getMessageHistory` / `getContactProfile` combined — "what did this person actually do, in order" is the most common individual debugging question in a lifecycle programme ("did they get the email AND did they click through AND did they convert"). Shares the tighter **User Activity & User Search** budget: **up to 10 concurrent requests, up to 360 queries/hour** — materially lower than the standard Dashboard budget, worth surfacing to a caller before they loop this over a cohort. |
| `searchUser` | resolve a user/device identifier to an Amplitude ID | `GET /2/usersearch?user={id}` | <https://amplitude.com/docs/apis/analytics/dashboard-rest> | read | Amplitude's identity model (Amplitude ID vs. device ID vs. user ID, with ID-merging) means "look up this person" is not a single obvious call. This is the resolver step that would sit in front of `getUserActivity`. Same tight rate-limit family as `getUserActivity`. |

### 2b. Schema / taxonomy reads

| Op key | Label | Amplitude endpoint | Doc URL | R/W | Why |
|---|---|---|---|---|---|
| `listEventSchema` | list the event types the project records, with descriptions | `GET /2/taxonomy/event` | <https://amplitude.com/docs/apis/analytics/taxonomy> | read | Same shape and same value as Braze's `listEventSchema` — without this, every `getFunnel`/`getRetention`/`getSeries` call Orbit builds is guessing at event-name strings the project may not actually have. |
| `getEventProperties` | list an event's documented properties, types and enums | `GET /2/taxonomy/event-property` | <https://amplitude.com/docs/apis/analytics/taxonomy> | read | Returns `event_property`, `event_type`, `description`, `type`, `regex`, `enum_values`, `is_array_type`, `is_required` per Amplitude's own docs — the personalisation/segmentation contract, same role as Braze's `listAttributeSchema`. |
| `listUserProperties` | list user (identify) properties and their types | `GET /2/taxonomy/user-property` | <https://amplitude.com/docs/apis/analytics/taxonomy> | read | Completes the taxonomy trio (event, event-property, user-property); UNVERIFIED whether this exact path exists as written — the Taxonomy API's event and event-property endpoints are directly confirmed, the user-property one was not independently re-fetched (see §4). |

### 2c. Aggregate metrics beyond the current getSeries

| Op key | Label | Amplitude endpoint | Doc URL | R/W | Why |
|---|---|---|---|---|---|
| `getSessionMetrics` | session length distribution / average / sessions-per-user | `GET /2/sessions/length`, `GET /2/sessions/average`, `GET /2/sessions/peruser` | <https://amplitude.com/docs/apis/analytics/dashboard-rest> | read | Confirmed present in the endpoint table; cost 4 per the cost model. Engagement-depth signal `getSeries` cannot answer — "are sessions getting shorter" is a different question from "is DAU flat." |
| `getUserComposition` | breakdown of active/new users by a dimension | `GET /2/composition` | <https://amplitude.com/docs/apis/analytics/dashboard-rest> | read | Confirmed present in the table; not independently re-fetched for parameter shape (UNVERIFIED beyond existence). |
| `getRealtimeActiveUsers` | active-user count for the last 5 minutes | `GET /2/realtime` | <https://amplitude.com/docs/apis/analytics/dashboard-rest> | read | Confirmed present. Useful as a live health check immediately after a send, distinct from the day-granular `getSeries`. |
| `getRevenueLTV` | revenue / LTV series | `GET /2/revenue/ltv` | <https://amplitude.com/docs/apis/analytics/dashboard-rest> | read | Confirmed present. Direct analogue of Braze's `getRevenueMetrics` — the revenue source a lifecycle programme's attributed-revenue claims need. |

### 2d. Governance / consent

| Op key | Label | Amplitude endpoint | Doc URL | R/W | Why |
|---|---|---|---|---|---|
| `getDSARStatus` | check a Data Subject Access Request's status | Data Subject Access Request (DSAR) API — exact path not independently re-fetched | <https://amplitude.com/docs/apis/analytics/ccpa-dsar> | read | UNVERIFIED beyond the page existing (confirmed live via search results). Named because GDPR/CCPA evidence trails are exactly the kind of "boring but load-bearing" read this survey family exists to catalogue — same instinct as Braze's `getSubscriptionState`. |

### 2e. Reporting / narrative

| Op key | Label | Amplitude endpoint | Doc URL | R/W | Why |
|---|---|---|---|---|---|
| `listChartAnnotations` | read chart annotations (e.g. "campaign launched here") marked on Amplitude charts | `GET /3/annotation-categories` and a sibling annotations list — exact list-annotations path not independently re-fetched | <https://amplitude.com/docs/apis/analytics/chart-annotations> | read | Lower priority. UNVERIFIED beyond the annotation-categories path and the page's existence. Would let Orbit line up "we shipped this canvas" against Amplitude's own chart markers when building a lifecycle narrative. |
| `exportRawEvents` | bulk-export raw per-user event rows for a time range | `GET /2/export?start=...&end=...` | <https://amplitude.com/docs/apis/analytics/export> | read (bulk, PII-heavy) | Confirmed present (zipped JSON, one or more files per hour of data, data available ~2 hours after ingestion, 404 if nothing in range). **Flag alongside Braze's `exportAudienceMembers`**: this is a genuine platform capability Orbit has deliberately not built, for the same reason the module docblock gives for not building cohort membership export — it hands back bulk per-user rows for a question a marketer answers with a number. List it as a capability gap, not a recommendation to build it without the same consent/PII gating Braze's equivalent carries. |

**New ops proposed: 12** — 11 read, 1 bulk/PII-flagged read (`exportRawEvents`). None are writes; Amplitude's write surface (HTTP V2/Batch ingestion, cohort upload/membership) is out of scope by the adapter's own stated design (see the module docblock: Orbit reads a lifecycle programme's analytics, it does not author events).

---

## 3. Explicitly UNSUPPORTED — commonly expected, genuinely not available

| Expected capability | Status | Reason | Nearest alternative |
|---|---|---|---|
| **Warehouse-shaped reads (`listCatalogs`, `listTables`, `describeTable`)** | unsupported | Confirmed: Amplitude's Dashboard REST and Behavioral Cohorts APIs have no catalog/schema/table namespace. Amplitude organises data as events, event properties, user properties and cohorts — not tables. | `platform:"databricks"` for the same three operations, genuinely native there. |
| **`runQuery` (read-only SQL)** | unsupported | Amplitude's own SQL-shaped surface is a paid **Data Tables** / warehouse-sync add-on layered on top of a customer's own warehouse, not part of the Dashboard REST API this adapter speaks — this framing was not independently re-verified against a live Amplitude pricing/product page this session (UNVERIFIED framing, though the underlying fact — no SQL endpoint in the Dashboard REST or Behavioral Cohorts API — is directly confirmed by their absence from both endpoint tables fetched). | `operation:"getSeries"` for aggregate counts, or run the equivalent SQL in Databricks against a synced copy of the event data. |
| **CDP-shaped reads (`listSources`, `listDestinations`, `listTrackingPlans`, `listTrackingPlanRules`, `listConnections`)** | unsupported | Confirmed: nothing in the Dashboard REST, Behavioral Cohorts or Taxonomy APIs models a source/destination/tracking-plan graph. Amplitude ingests events via SDKs and the HTTP/Batch APIs; it has no CDP routing layer. | `platform:"segment"` or `platform:"rudderstack"` for CDP plumbing. |
| **Reading raw cohort membership without the async download flow** | partial, not unsupported | `GET /3/cohorts` gives metadata + a size count only; the only per-user membership path is the confirmed 3-step download flow (request → poll → download), which hands back a file of user rows. There is no synchronous "give me the member list" endpoint. | `getCohort` for metadata + count; run the download flow in Amplitude itself, or via a future gated `exportCohortMembers` op, if per-user rows are genuinely required. |
| **A single-call, non-EU-restricted, client-safe user profile lookup** | partial | The User Profile API exists (`getUserProfile` above) but is documented as server-side only and explicitly **not supported in the EU data-processing region** — a real, named constraint, not a missing feature. | For EU-residency projects, `getUserActivity` / `searchUser` against the standard (non-restricted) Dashboard REST host. |

---

## 4. UNVERIFIED, listed plainly

- **`https://amplitude.com/docs/apis/analytics/user-property` (Taxonomy API's user-property endpoint)** — the event and event-property Taxonomy endpoints were independently fetched and confirmed; the user-property sibling was inferred from the family pattern, not independently re-fetched. Do not cite it as confirmed.
- **Chart Annotations API's list-annotations path** (as opposed to the confirmed `/3/annotation-categories` categories endpoint) — page confirmed to exist and to be about annotation management; the exact list-annotations request shape was not independently re-fetched.
- **DSAR API's exact endpoint path and method** — page confirmed to exist (`ccpa-dsar`); request/response shape not independently re-fetched.
- **`GET /2/composition`'s exact parameter and response shape** — endpoint confirmed present in the Dashboard REST endpoint table; not independently re-fetched beyond that.
- **Whether successful (2xx) Dashboard REST responses carry `X-RateLimit-*` headers.** `server/data/amplitude-api.js`'s `readRateLimit()` reads `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-cost` from every response. The live Dashboard REST doc page fetched this session documents the 429 error body carrying "information about which limit you exceeded" but does **not** name specific header keys for either the error or success case. This is not confirmed to be wrong — many APIs document cost/budget headers inconsistently or only in a different doc section not surfaced by this session's fetches — but it was not confirmed correct either. Worth a follow-up fetch of Amplitude's rate-limiting FAQ/help-centre pages specifically, which were not checked this session.
- **The "Data Tables paid add-on" framing for why `runQuery` is unsupported** — the underlying fact (no SQL endpoint in any API family this session fetched) is confirmed; the specific commercial framing ("paid add-on") was carried over from the existing `capabilities.js` reason text and not independently re-verified against a live Amplitude pricing page.
- **`GET /2/taxonomy/event`'s exact response shape** (as opposed to `/event-property`, whose shape was independently confirmed) — existence and general purpose confirmed via search results; not independently re-fetched for field-level detail.

---

## Summary of what should change in `server/data/capabilities.js` for Amplitude

1. **No support-level corrections — all 6 network-calling rows are still accurate.** The `getRetention` literal-token constraint, the specific claim flagged for verification, is confirmed exactly as recorded.
2. **Fix the dead `AMPLITUDE_DOCS` constant.** `https://amplitude.com/docs/apis/analytics` 404s. It feeds `doc_url` on 9 rows: `checkAuth`, `listCohorts`, `getCohort`, `getSeries`, and all 5 `notACdp()` rows (`listSources`, `listDestinations`, `listTrackingPlans`, `listTrackingPlanRules`, `listConnections`). Split it: `checkAuth`/`getSeries` → `https://amplitude.com/docs/apis/analytics/dashboard-rest`; `listCohorts`/`getCohort` → `https://amplitude.com/docs/apis/analytics/behavioral-cohorts`; the 5 CDP-shaped rows → the confirmed-live `https://amplitude.com/docs/apis` index page, since there is no more specific page to point a "this doesn't exist here" row at.
3. **Soften the `getSeries`/`getFunnel` `reason` wording** so `MAX_WINDOW_DAYS`/`MAX_FUNNEL_STEPS` read as Orbit's own cost-control ceiling rather than an implied Amplitude hard limit — the live docs impose no such caps directly; Amplitude's cost budget (1000/5min, 108,000/hour) is what actually constrains, and Orbit's caps are one reasonable way to stay inside it, not a restatement of a vendor rule.
4. **No row currently mislabels an Orbit build gap as a platform limit** — every `unsupported` row checked against live docs this session (warehouse-shaped, CDP-shaped, SQL) is a genuine platform-conceptual absence, not a backlog item.
