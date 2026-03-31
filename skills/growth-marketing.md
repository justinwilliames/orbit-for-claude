---
name: growth-marketing
description: >
  Use this skill whenever Orbit is asked about paid media, paid search, SEO, AEO, ASO,
  retargeting, audience strategy, or how growth channels connect to lifecycle programs.
  Trigger on "how should we run paid social?", "set up retargeting for at-risk users",
  "our CAC is too high", "how do we rank for X?", "optimise our App Store listing",
  "how do we appear in AI search results?", "build a lookalike audience from our best
  customers", "suppress existing customers from paid", or any question about integrating
  acquisition and retention channels. The central principle of this skill: paid channels
  acquire users; lifecycle keeps them. The most expensive mistake in growth is paying to
  acquire users you then fail to retain — or paying to reach users you already own.
---

# Growth Marketing Protocol

A structured protocol covering paid media, organic search, app store optimisation, and answer engine optimisation — with explicit integration points into lifecycle programs.

**Acquisition and retention are not separate functions. Paid channels surface users; lifecycle programs determine their value. Design both as one system or waste budget on both.**

---

## Execution Standard

When this skill is active, apply this operating sequence before diving into the domain content:

1. Classify the task: strategy, audit, build, review, troubleshooting, or documentation.
2. Confirm the variables that materially change the answer: platform/tool, business model, audience, channel, geography/compliance, and current state.
3. If a critical variable is missing, ask only if the answer would materially change; otherwise proceed with explicit assumptions.
4. Diagnose current reality before prescribing future state whenever existing work, performance, or tooling is involved.
5. Give a recommendation with rationale, risks, and next actions. Do not stop at explanation alone.

## Response Contract

Default response shape for this skill:
- Situation or diagnosis
- Recommended approach or design
- Key risks, dependencies, and assumptions
- Next actions or implementation steps

## Evidence And Currency Rules

- Do not invent platform capabilities, benchmarks, or compliance requirements.
- Mark estimates as estimates.
- If laws, vendor features, deliverability rules, or platform UIs may have changed, flag that they should be verified before execution.
- If the task clearly crosses into another Orbit protocol, name the adjacent protocol and use it deliberately instead of stretching this skill past its boundary.

## Channel Overview

Select channels based on where your audience actually makes decisions — not where competitors are spending.

| Channel | Best for | Lifecycle integration |
|---|---|---|
| Paid Social (Meta, TikTok, LinkedIn) | Top-of-funnel awareness; retargeting warm audiences | Suppress existing customers; retarget lifecycle segments; lookalikes from high-LTV users |
| Paid Search (Google, Microsoft) | High-intent acquisition; competitor conquest | Suppress existing customers; capture brand-searched churned users |
| Programmatic / Display | Retargeting; at-scale awareness | Most valuable as a lifecycle rescue channel for unreachable users |
| SEO | Long-term compounding acquisition; category authority | Informs onboarding content; lifecycle email educational content |
| AEO | Visibility in AI-generated answers (ChatGPT, Perplexity, Google AI Overviews) | Brand authority that reduces CAC over time |
| ASO | App discoverability; conversion on App Store / Google Play listing | First impression before onboarding begins |

---

## Paid Social

### Platform Selection

| Platform | ICP fit | Ad formats that work |
|---|---|---|
| Meta (Facebook / Instagram) | Consumer, SMB, B2C — broad reach; strong retargeting | Single image, carousel, video, lead ads |
| TikTok | Consumer, younger demographic, high creative velocity | Short-form video; native-feel creative only |
| LinkedIn | B2B, professional, higher CAC tolerance | Sponsored content, message ads, lead gen forms |
| YouTube | Consideration-stage; product demos; retargeting | Skippable in-stream, bumper ads |

### Campaign Structure

```
Campaign level:    Objective (Conversions / Traffic / Awareness)
Ad set level:      Audience + budget + placement
Ad level:          Creative + copy + CTA
```

**Audience tiers:**

| Tier | Audience type | Bid approach |
|---|---|---|
| 1 — Retargeting | Website visitors, app users, video viewers, engagement audiences | Higher CPM acceptable — warm signal |
| 2 — Lookalike | 1–3% lookalike of activated customers / high-LTV users | Mid-tier — quality audience, higher CPM than cold |
| 3 — Interest / broad | Interest targeting or broad with creative doing the targeting work | Lower CPM — highest volume, lowest intent |

Always run Tier 1 and Tier 2 before scaling Tier 3. Retargeting and lookalikes validate creative and offer before spending against cold audiences.

### Creative Principles

- **Hook in 3 seconds.** On Meta and TikTok, thumb-stop rate determines distribution. The first frame is the ad.
- **Native beats polished.** Platform-native creative (UGC-style, text overlay, real product) consistently outperforms studio production on social.
- **Match creative to audience temperature.** Cold audiences need problem/solution framing. Warm retargeting audiences can lead with offer or social proof.
- **Refresh creative before fatigue, not after.** Monitor frequency. When frequency >3 and CTR is declining, the creative is tired — rotate before performance falls.
- **One message per ad.** Never ask a cold audience to do two things.

### Suppression (Non-Negotiable)

Upload suppression lists to all paid social platforms before any campaign launches:

- Active paying customers — do not pay to acquire users you already have
- Recent converters (last 30 days) — exclude from conversion campaigns
- Users currently in an active lifecycle flow — coordinate spend, don't double-touch
- Hard-bounced / unsubscribable contacts — exclude to protect audience quality signals

Suppression lists should be updated and re-uploaded weekly for active campaigns.

---

## Paid Search

### Account Structure

```
Campaign:     Match to a theme or intent cluster (not just keywords)
Ad Group:     Tight keyword clusters — one core concept per ad group
Ad:           3–5 responsive search ad headlines; 2 descriptions minimum
Extensions:   Sitelinks, callouts, structured snippets — always configured
```

### Keyword Strategy

| Match type | Use for | Risk |
|---|---|---|
| Exact match | Core converting terms; brand terms | Low volume |
| Phrase match | Variations with intent preserved | Moderate — review search terms weekly |
| Broad match | Only with Smart Bidding and strong conversion data | High — burns budget without conversion history |

**Negative keyword lists are as important as keyword lists.** Build them from day one. Review search term reports weekly for the first month, monthly thereafter.

### Intent Tiers

| Intent level | Query type | Campaign approach |
|---|---|---|
| High — transactional | "[product type] pricing", "best [category] app", "[competitor] alternative" | Conversion campaign; maximise conversion value |
| Medium — consideration | "how to manage [job type]", "tips for [problem]" | Lead gen or content; capture for nurture |
| Low — awareness | "[category] what is", "[problem] explained" | Content / SEO play — not paid unless budget is flush |

### Competitor Bidding

Bidding on competitor brand terms is legitimate. Rules:
- Never use competitor brand names in ad copy (trademark violation)
- Lead with your differentiation, not their name
- Bid only if your conversion rate on competitor terms is viable — low intent converts poorly
- Monitor if competitors are bidding on your brand; respond accordingly

### Quality Score Levers

Quality Score (1–10) directly affects CPCs and ad rank. Improve it by:
- Tightening keyword-to-ad-group relevance
- Ensuring ad copy contains the keyword
- Improving landing page relevance and load speed
- Improving expected CTR through ad copy testing

---

## Programmatic / Display

Display is most valuable as a lifecycle rescue channel — reaching users who have stopped engaging with email and push.

### Retargeting Audiences for Display

| Audience | Source | Message |
|---|---|---|
| At-risk users | CRM export / Customer Match | Re-engagement; low-commitment ask |
| Trial users who haven't converted | CRM export | Trial urgency; feature highlight |
| Churned users (unsubscribed from email) | CRM export | Win-back; cannot reach via email — paid is the only channel |
| Cart / sign-up abandoners | Pixel / tag | Complete your signup; friction removal |
| Feature page visitors (non-customers) | Pixel | Consideration content; social proof |

### Display Creative Rules

- **Retargeting creative must acknowledge the relationship.** Generic brand ads to known users feel tone-deaf. Reference what they've seen or done.
- **Frequency cap strictly.** Display fatigue is real and brand-damaging. Cap at 3–5 impressions per user per day.
- **Match landing page to ad precisely.** A retargeting ad promising a specific offer must land on that offer — not the homepage.

---

## SEO

### Hierarchy of SEO priorities

1. **Technical foundation** — if search engines can't crawl and index your site correctly, nothing else matters
2. **Core Web Vitals** — page speed, interactivity, visual stability; now a ranking signal
3. **On-page** — title tags, H1s, meta descriptions, internal linking, content depth
4. **Content** — topical authority built through consistent, useful content on category-relevant topics
5. **Backlinks** — earned through content quality, PR, and partnerships; not bought

### Technical SEO Checklist

- [ ] XML sitemap submitted to Google Search Console and Bing Webmaster Tools
- [ ] Robots.txt correctly configured — not blocking key pages
- [ ] No duplicate content (canonical tags where needed)
- [ ] HTTPS across all pages
- [ ] Core Web Vitals passing (measure in Google PageSpeed Insights and Search Console)
- [ ] Structured data (schema markup) on key page types: product, FAQ, review, article
- [ ] Mobile-first — Google indexes mobile version; test on mobile first

### Keyword and Content Strategy

Work backwards from your ICP's job-to-be-done:

1. What problems does your user have before they know your product exists?
2. What do they search for when they start looking for a solution?
3. What do they search for when they're evaluating options?
4. What do they search for after becoming a customer? (Lifecycle content opportunity)

Build content that answers each stage. The SEO funnel maps directly to the lifecycle funnel:

| Search intent stage | Content type | Lifecycle parallel |
|---|---|---|
| Problem aware | "How to [solve problem]" articles | Pre-acquisition / social listening inputs |
| Solution aware | "[Product category] comparison", "best [tool] for [use case]" | Consideration / bottom of funnel |
| Product aware | "[Your brand] review", "[Your brand] pricing" | Conversion / bottom of funnel |
| Customer | Help docs, how-to guides, feature announcements | Onboarding and engagement content |

### Lifecycle SEO Inputs

SEO keyword data reveals the language your audience uses — which is exactly what social listening is trying to find. Mine Search Console for:
- Queries with high impressions, low CTR — users are seeing you but not clicking; copy problem
- Queries you rank for that surprise you — audience insight
- Queries competitors rank for that you don't — content gap and lifecycle messaging opportunity

---

## AEO — Answer Engine Optimisation

AEO is SEO for AI-generated responses: Google AI Overviews, ChatGPT search, Perplexity, Claude, Gemini. As users shift queries to AI interfaces, appearing as the cited source or referenced brand matters.

### How AI Answers Are Constructed

AI answer engines pull from:
- High-authority, well-structured web content (articles, help docs, comparison pages)
- Structured data / schema markup
- Brand mentions across credible sources (reviews, directories, press)
- Direct integrations (e.g., ChatGPT plugins, Bing-indexed content)

### AEO Optimisation Tactics

**Structure content for direct answers:**
- Use question-format H2/H3 headers: "What is [concept]?", "How does [feature] work?"
- Answer the question in the first sentence after the header — do not bury the answer
- Follow with supporting detail
- Use numbered lists and tables — AI systems parse and cite these reliably

**Target featured snippet formats:**
- Definition boxes: "What is X?" → one-sentence answer + 2–3 sentences of context
- Step-by-step: numbered process answers
- Comparison tables: "X vs Y" structured as a table with clear criteria

**Schema markup for AEO:**
```json
{
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "How do I [common task]?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "[Direct, complete answer in 2–4 sentences]"
    }
  }]
}
```

**Build brand citations:**
- Ensure your brand appears in G2, Capterra, Trustpilot, and category-relevant directories — AI systems read these
- Get covered in industry publications — citations from authoritative sources improve AI reference likelihood
- Maintain a Wikipedia-style "About" page or structured brand description page — AI systems use these for brand context

**Monitor AI visibility:**
- Search your category keywords in ChatGPT, Perplexity, and Google with AI Overviews enabled
- Note: are you mentioned? Are competitors cited instead? What content are they citing?
- Track this monthly — AI search visibility is a new metric category

### AEO and Lifecycle

AEO content (FAQ pages, help docs, how-to guides) serves double duty:
- Pre-acquisition: surfaces your brand in AI-generated answers to category questions
- Post-acquisition: the same content reduces onboarding friction and support volume

Write lifecycle help content to AEO standards. Users searching "how do I [task] in [your product]" should find your content — not a competitor's.

---

## ASO — App Store Optimisation

ASO is the conversion rate optimisation layer for app discovery. It determines whether users who search the App Store find you — and whether they download when they do.

### App Store Ranking Factors

| Factor | iOS App Store | Google Play |
|---|---|---|
| Keyword relevance | Title, subtitle, keyword field (hidden, 100 chars) | Title, short description, long description |
| Conversion signals | Download volume, ratings, reviews, engagement | Same + uninstall rate |
| Ratings and reviews | Volume and recency matter; average rating threshold | Same |
| Update frequency | Regular updates signal active maintenance | Same |
| Visual assets | Screenshots, preview video (first impression) | Same |

### Keyword Optimisation

- **Title:** most weighted field — include primary keyword; keep brand name short to allow keyword room
- **Subtitle (iOS) / Short description (Android):** second most weighted — secondary keyword + value proposition
- **Keyword field (iOS only):** 100 characters; comma-separated; no spaces after commas; no repeating words from title/subtitle
- **Long description (Android):** fully indexed by Google Play; treat as SEO copy with natural keyword inclusion

Research keywords using App Store-specific tools. Search volume and difficulty metrics differ from web SEO. Prioritise keywords with relevant volume and achievable difficulty.

### Conversion Rate Optimisation (Store Listing)

The listing's job is to convert a search into a download. Every element is conversion copy:

**Screenshots (highest impact element):**
- First screenshot must communicate the core value proposition in 3 seconds
- Use captions — most users don't read descriptions
- Show the product in use, not abstract brand imagery
- Test screenshot order — first two are shown in search results on iOS

**Preview video:**
- Autoplay muted on iOS — first 3 seconds must work without sound
- Show the product doing the thing users searched for
- Keep under 30 seconds; most users don't watch to the end

**Ratings and reviews:**
- Prompt for ratings at moments of delight, not at random — use in-app prompts triggered by completion of the aha moment or a positive interaction
- Respond to negative reviews — it signals active maintenance to prospective users
- Never incentivise fake reviews (App Store violation; destroys trust)

### ASO and Lifecycle

The App Store listing is the first impression before onboarding begins. Misalignment between listing promises and product reality is the #1 cause of early churn in mobile apps:
- If the listing promises "invoicing in 60 seconds" and setup takes 10 minutes, expect high day-1 drop-off
- Align listing copy with onboarding messaging — the language used in screenshots should echo in onboarding emails
- Monitor App Store reviews for onboarding friction signals — users who couldn't get started will say so in 1-star reviews

---

## Lifecycle Integration — The Connective Tissue

This is where growth marketing and lifecycle become one system.

### Audience Flows: CRM → Paid Channels

Export these segments from your CRM to paid platforms (via Customer Match / Custom Audiences):

| CRM segment | Paid channel use | Why |
|---|---|---|
| Active paying customers | Suppression on all acquisition campaigns | Don't pay to acquire users you have |
| High-LTV / activated users | Lookalike seed audience | Find more users who look like your best customers |
| At-risk users (engagement declining) | Retargeting — re-engagement creative | Email alone may not reach them; paid adds a second channel |
| Trial users — not yet converted | Retargeting — conversion focus; urgency | Reinforce the email trial sequence with paid touchpoints |
| Churned users — email unsubscribed | Win-back via paid only | You can't email them; paid is the only CRM-owned reach |
| Churned users — email subscribed | Paid supports win-back sequence | Coordinate timing with win-back email sequence |
| New signups (last 7 days) | Exclusion from acquisition; eligible for onboarding retargeting | Reinforce onboarding with paid if not activating |

### Sequence Coordination: Paid + Email

Paid retargeting and lifecycle email should not operate independently. Design them as a coordinated sequence:

**Trial conversion example:**
```
Day 0:    Signup → Email: Welcome (lifecycle)
Day 1–3:  No activation → Paid retargeting: feature highlight ad (paid)
Day 3:    Email: Activation nudge (lifecycle)
Day 5:    No conversion → Paid: social proof / case study ad (paid)
Day 6:    Email: Trial urgency (lifecycle)
Day 7:    Trial end → Email: Conversion offer (lifecycle) + Paid: last-chance retargeting (paid)
Day 8+:   No conversion → Remove from trial retargeting; enter win-back paid audience
```

**Frequency governance across channels:**
- A user receiving daily emails should not also receive 5 display impressions per day — coordinate frequency caps
- If a user converts via paid, immediately suppress from conversion retargeting and add to customer suppression list
- Paid and email teams must share suppression list updates — at minimum weekly; ideally real-time via CDP or webhook

### Audience Flows: Paid → CRM

The data from paid acquisition should inform lifecycle from the first touchpoint:

- **UTM parameters → CRM field:** capture source, medium, and campaign at signup; use to personalise onboarding by acquisition channel
- **Ad creative → onboarding alignment:** if a user converted from an ad promising "invoice management", their onboarding sequence should lead with invoice features — not the full generic flow
- **Paid cohort analysis:** compare activation rate, LTV, and churn rate by acquisition channel in the CRM — inform budget allocation with lifecycle outcomes, not just CAC

### Retargeting Audiences: Build from Lifecycle Data

Your most valuable retargeting audiences are built from CRM data, not pixel data:

| Audience | Built from | Better than pixel because |
|---|---|---|
| High-LTV lookalike | CRM export of top 20% customers by LTV | Pixel captures all visitors; CRM identifies the ones worth cloning |
| Churned high-LTV | CRM export of churned users with LTV >threshold | Pixel doesn't know who churned; CRM does |
| Activated but not upgraded | CRM: activated users on free/starter plan | Pixel can't distinguish plan type |
| Category-fit prospects | CRM: contacts with ICP properties (trade type, business size) who haven't converted | Pixel is blind to CRM-known properties |

---

## Budget Allocation Framework

Start concentrated, expand when data supports it. Distributing budget too thinly across channels produces nothing learnable.

### Stage-based allocation

| Business stage | Priority allocation | Rationale |
|---|---|---|
| Pre-PMF | SEO content only; minimal paid | Don't scale acquisition until retention is proven |
| Early growth | Paid search (high-intent) 60%; retargeting 20%; social 20% | Capture existing demand before creating it |
| Scaling | Paid search 40%; paid social 30%; retargeting 20%; SEO/ASO 10% | Expand as unit economics confirm |
| Mature | Diversified; AEO investment increasing | Brand authority compounds; paid efficiency decreases over time |

### CAC by channel — decision rules

Refer to `attribution-audit` skill for full CAC methodology. Applied here:

- **Below blended CAC:** increase budget; this channel is efficient
- **At blended CAC:** hold; monitor for saturation
- **Above blended CAC:** interrogate before cutting — check attribution quality, payback period, and LTV of users acquired via this channel (high-CAC channels sometimes produce higher-LTV users)
- **iOS mobile — caveat:** paid social CAC for mobile app installs is structurally unreliable post-iOS 14.5. Model conversions ≠ measured conversions. Size decisions accordingly.

---

## Measurement

Growth marketing is connected to lifecycle measurement via the `lifecycle-reporting` and `attribution-audit` skills. Growth-specific metrics:

| Metric | Definition | Threshold |
|---|---|---|
| CAC by channel | Spend / customers acquired per channel | Compare to LTV; payback <12 months for SMB SaaS |
| ROAS | Revenue attributed / ad spend | Context-dependent; >3x is a common baseline |
| CTR | Clicks / impressions | Search: >3% good; Display: >0.3% good; varies by format |
| Conversion rate (landing page) | Conversions / sessions | >3% for paid traffic is a reasonable floor |
| App Store CVR | Downloads / product page views | iOS average ~30%; optimise for above category average |
| Activation rate by channel | % of users acquired per channel who activate | The critical lifecycle metric for paid — don't measure CAC in isolation |
| Blended CAC | Total acquisition spend / total new customers | Benchmark against LTV; use for portfolio decisions |

**The metric that matters most:** activation rate by acquisition channel. A channel with high CAC but high activation rate and high LTV is a better channel than one with low CAC and low activation. Connect paid performance to lifecycle outcomes in every reporting cycle.

---

## Quality Standard

Growth marketing is working when: paid channels are delivering users who activate and retain at acceptable rates, suppression lists are preventing wasted spend on existing customers, retargeting audiences are pulling from CRM lifecycle segments (not just pixel), AEO content is surfacing the brand in AI-generated answers for category queries, and the App Store listing is converting at or above category average. Any channel measured solely on CAC without downstream lifecycle data is not being measured correctly.
