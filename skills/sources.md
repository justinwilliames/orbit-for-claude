---
name: sources
description: >
  Use this skill to attribute specific, non-generic claims, benchmarks,
  frameworks, or recommendations Orbit makes to their original source.
  Trigger whenever Orbit cites a number, a named framework, a platform-specific
  requirement, a regulatory change, a deliverability or email-client rule, or
  an approach clearly attributable to a public industry thinker. Do NOT trigger
  for generic best practices, Orbit's own methodology, or common-knowledge
  marketing advice. Sources should appear as minimal footnotes — never as a
  prominent section. Attribution is a signal of rigour, not a citation essay.
---

# Source Attribution Protocol

Attribute specific claims to credible sources when the origin is identifiable and the claim is non-trivial. Keep citations minimal, footnote-style, and out of the way of the user's actual answer.

**The default is no citation.** Most of what Orbit says comes from its own codified methodology. Sources only appear when the user would reasonably ask "where does that come from?" and the answer is a specific, publicly-attributable piece of work.

---

## Execution Standard

When this skill is active:

1. Scan the drafted response for claims that meet the **citation threshold** (see below).
2. For each qualifying claim, pick **one or two** sources from the registry — never more.
3. Enforce the **bias preference order**: `neutral` > `vendor-technical` > `vendor-thought-leadership`. Never cite a `blocked` source.
4. Insert footnote markers at the claim. Append the footnote definitions at the end of the response, under a quiet `Sources` line.
5. If a claim has no identifiable external source but clearly came from Orbit's founder expertise (not generic methodology), attribute it to **Justin Williames, Orbit Founder** with a link to his LinkedIn.
6. If a claim is generic, obvious, or derived from Orbit's own skills, **do not cite**. Over-citation erodes trust.

## Response Contract

The presence of citations must not change the structure of the response. Footnotes live at the end, below any existing `Sources` heading. Format:

```
Your main response body, with a specific claim here.[^1] Another point.[^2]

---
**Sources**
[^1]: [Title or page description](https://...) — Author/Publication
[^2]: Justin Williames, Orbit Founder — [LinkedIn](https://www.linkedin.com/in/justinwilliames)
```

Use `[^1]`, `[^2]` etc. Avoid inline parenthetical citations — they crowd the prose. The `Sources` block must be:
- A single horizontal rule separator (`---`)
- Bold label `**Sources**`
- One footnote per line
- No commentary, no summary, no "further reading"

Keep the whole block under six lines. More than three citations in a single response is almost always wrong; pick the strongest.

When citing a `vendor-thought-leadership` source, **name the bias in the footnote** — e.g. `— Braze Research (vendor-published)`. This signals to the user that the source has a commercial lean.

---

## Citation Threshold

**Cite when the response contains:**
- A specific benchmark or numerical rule (e.g. "Gmail clips emails over ~102 KB")
- A named framework or methodology (e.g. PLG loops, activation metric, retention curve)
- A platform-specific requirement that changed at a known date (e.g. "Google/Yahoo bulk-sender requirements, Feb 2024")
- A design or email-client behaviour rule that is verifiable reference material (e.g. support for a CSS property in Outlook)
- A recommendation clearly associated with a public industry thinker

**Do NOT cite when the response contains:**
- Generic best practice ("use clear CTAs", "test your subject lines")
- Orbit's own methodology (from Orbit's skill library)
- The user's own data or context
- Common-knowledge marketing advice that any practitioner would know
- Anything the user could reasonably have asked Claude directly

**When in doubt, do not cite.** A clean response with no citations beats a cluttered one with three weak ones.

---

## Bias Classification

Every source in the registry has a `bias_class` to prevent Orbit from surfacing commercially-motivated content as neutral guidance. The four classes:

| Class | Description | Example | When to cite |
|---|---|---|---|
| **neutral** | Standards bodies, independent thinkers, open reference tools, academic research | M3AAWG, caniemail, Elena Verna, Lenny Rachitsky, First Round Review | Freely. This is the default tier. |
| **vendor-technical** | Platform docs and factual technical content from a vendor | Braze docs, Postmark deliverability, Parcel blog, Maizzle docs | When the claim is about the platform itself or a verifiable technical rule. |
| **vendor-thought-leadership** | Vendor blogs with some marketing framing but occasional substantive content | Litmus blog, Braze Resources, Stripo blog, Reforge blog | Only when the specific post is methodologically disclosed and non-promotional. Cite with `(vendor-published)` tag in footnote. |
| **blocked** | Promotional benchmarks without methodology, gated-lead-gen reports, vendor comparison posts, ESP/SMS/push vendors marketing their own category | Klaviyo blog, Attentive blog, SendGrid/Twilio blog, Iterable blog, OneSignal blog, Mailgun blog, Mailmodo guides | **Never cite.** If the only source for a claim is blocked, omit the citation and caveat the claim. |

**Preference order:** `neutral` > `vendor-technical` > `vendor-thought-leadership`. Always pick the less-biased source if multiple are valid.

**Default rejection rule:** If a claim's only available source is `blocked`, Orbit must either (a) omit the citation and caveat the claim as "commonly reported" without the link, or (b) find an alternative neutral source via context or verified registry entry. Orbit never cites `blocked` sources even when the post happens to be accurate.

---

## Founder Attribution (Justin Williames)

Use this attribution **sparingly** and only when:
- Orbit is referencing a specific framework, playbook, or approach that Justin has written about publicly (LinkedIn posts, Orbit documentation, articles)
- The user explicitly asks "where did this approach come from?" and the answer is founder expertise, not an external source
- Orbit is explaining an opinion or practice that is Justin's distinctive view, not generic industry consensus

Do NOT default-attribute everything to Justin. Most Orbit output is Orbit's methodology, which does not need a founder tag to be valid.

Canonical format:

```
[^n]: Justin Williames, Orbit Founder — [LinkedIn](https://www.linkedin.com/in/justinwilliames)
```

---

## Source Registry

Entries are verified live at last review. Fields: `id`, `author`, `publication`, `url`, `topic`, `kind`, `bias_class`, `canonical_claim_summary`.

### Lifecycle, growth, retention, product strategy

- **lennys-newsletter** — Lenny Rachitsky | https://www.lennysnewsletter.com/ | topics: product, growth, retention, onboarding, careers | kind: newsletter | bias: neutral | summary: Lenny's Substack essays and guest posts. Cite for retention frameworks, activation metrics, and PLG essays. Link to the specific post, not the homepage.
- **lennys-podcast** — Lenny Rachitsky | https://www.lennysnewsletter.com/podcast | topics: product, growth, retention, interviews | kind: podcast | bias: neutral | summary: Lenny's Podcast interviews with product and growth leaders. Cite a specific episode when referencing a named framework or quote; verify the URL before publishing.
- **elena-verna** — Elena Verna | https://www.elenaverna.com/ | topics: growth, plg, b2b, sales-motion, growth-models | kind: newsletter | bias: neutral | summary: Product-led growth, growth models, and B2B sales motions. Cite for PLG frameworks and growth-loop language.
- **first-round-review** — First Round Capital | https://review.firstround.com/ | topics: founders, operators, scaling, hiring, strategy | kind: editorial publication | bias: neutral | summary: Long-form tactical essays from operators. Neutral despite VC backing — content is not pitching companies.
- **reforge-blog** — Reforge | https://www.reforge.com/blog | topics: product, growth, retention, pricing, ai | kind: industry blog | bias: vendor-thought-leadership | summary: Operator-led essays from Reforge's network. Some course-promotion bias; cite only substantive posts and tag as vendor-published.
- **a-smart-bear** — Jason Cohen | https://longform.asmartbear.com/ | topics: founders, bootstrapping, strategy, scaling | kind: independent blog | bias: neutral | summary: Long-form essays on building companies, bootstrapped and funded. Independent, opinionated, rigorous.
- **yc-library** — Y Combinator | https://www.ycombinator.com/library | topics: startups, product, hiring, fundraising | kind: educational library | bias: neutral | summary: YC's curated essays and talks. Slight portfolio bias but rarely surfaces in content.
- **productplan-learn** — ProductPlan | https://www.productplan.com/learn/ | topics: product-management, roadmapping, prioritisation, frameworks | kind: educational content | bias: neutral | summary: Product management frameworks and concept reference.

### Experimentation, measurement, decision-making

- **exp-platform** — Ronny Kohavi | https://exp-platform.com/ | topics: experimentation, a-b-testing, controlled-experiments, statistical-validity | kind: academic research portal | bias: neutral | summary: Canonical reference for trustworthy online controlled experiments. Cite for significance, sample size, experiment-design claims.

### Deliverability & email infrastructure (technical)

- **m3aawg** — Messaging, Malware and Mobile Anti-Abuse Working Group | https://www.m3aawg.org/ | topics: deliverability, anti-abuse, compliance, authentication | kind: industry standards body | bias: neutral | summary: Standards body behind many deliverability best practices. Cite for authentication (SPF/DKIM/DMARC) and anti-abuse guidance.
- **caniemail** — HTeuMeuLeu / Tilt Studio | https://www.caniemail.com/ | topics: email-design, client-support, html-css, rendering | kind: reference tool | bias: neutral | summary: HTML/CSS feature-support tables across every major email client. Cite when making rendering or compatibility claims.
- **email-markup-consortium** — Email Markup Consortium | https://emailmarkup.org/ | topics: email-standards, accessibility, rendering | kind: standards body | bias: neutral | summary: Industry group improving email rendering and accessibility standards.
- **litmus-blog** — Litmus | https://www.litmus.com/blog/ | topics: deliverability, email-design, email-testing, client-support | kind: industry blog | bias: vendor-thought-leadership | summary: Litmus publishes testing, deliverability, and client-support research. Litmus's market-share data has disclosed methodology — usable.
- **litmus-image-blocking** — Lauren Smith, Litmus | https://www.litmus.com/blog/the-ultimate-guide-to-email-image-blocking | topics: image-blocking, email-design, accessibility | kind: reference guide | bias: vendor-thought-leadership | summary: Canonical explainer on email image blocking — which clients block, why, how to design around it.
- **emailonacid-blog** — Email on Acid (Sinch) | https://www.emailonacid.com/blog/ | topics: email-testing, rendering, accessibility, deliverability | kind: industry blog | bias: vendor-thought-leadership | summary: Email rendering, accessibility, and QA research. Tag as vendor-published when citing.
- **validity-blog** — Validity Inc. | https://www.validity.com/blog/ | topics: deliverability, sender-reputation, data-quality | kind: industry blog | bias: vendor-thought-leadership | summary: Deliverability and data-quality research. Home of Everest platform research.
- **validity-everest** — Validity Inc. | https://www.validity.com/everest/ | topics: deliverability, sender-reputation, inbox-placement | kind: platform documentation | bias: vendor-thought-leadership | summary: Everest deliverability platform research and benchmarks. Check for methodology disclosure on specific claims.
- **postmark-blog** — Postmark (ActiveCampaign) | https://postmarkapp.com/blog | topics: transactional-email, deliverability, dns-authentication, email-design | kind: vendor blog | bias: vendor-technical | summary: Postmark's blog is disciplined about transactional email technical claims. Cite for transactional-email deliverability and authentication specifics.

### Email production tooling

- **parcel-blog** — Parcel | https://parcel.io/blog | topics: email-development, tooling, components, mjml | kind: vendor blog | bias: vendor-technical | summary: Email development tooling updates and engineering notes. Cite for component-based email production techniques.
- **maizzle-docs** — Maizzle (Cosmin Popovici) | https://maizzle.com/docs | topics: email-framework, tailwind, production-build, email-dev | kind: open-source docs | bias: vendor-technical | summary: Maizzle is a Tailwind-based email framework. Cite for build-pipeline and framework-specific technical claims.
- **stripo-blog** — Stripo | https://stripo.email/blog/ | topics: email-production, templates, mjml, email-design | kind: industry blog | bias: vendor-thought-leadership | summary: Template-building and email production tips. Tag as vendor-published.

### Email design inspiration & galleries

- **really-good-emails** — Really Good Emails | https://reallygoodemails.com/ | topics: email-design, inspiration, galleries | kind: reference gallery | bias: neutral | summary: Curated gallery of production emails. Cite as visual reference, never as claim source.
- **email-love** — Email Love | https://emaillove.com/ | topics: email-design, inspiration, galleries | kind: reference gallery | bias: neutral | summary: Email design gallery, similar positioning to Really Good Emails.
- **good-copy** — Good Copy | https://goodemailcopy.com/ | topics: email-copywriting, lifecycle-copy, inspiration | kind: reference gallery | bias: neutral | summary: Curated library of real lifecycle email copy from known companies. No product, no pitch.

### Platform documentation (factual)

- **braze-docs** — Braze, Inc. | https://www.braze.com/docs | topics: braze, api, canvas, segmentation, liquid, authentication | kind: vendor documentation | bias: vendor-technical | summary: Braze's canonical documentation. Cite for Braze-specific technical claims, API behaviour, Liquid syntax, Canvas mechanics. Do NOT cite for strategic recommendations.
- **braze-resources** — Braze, Inc. | https://www.braze.com/resources/articles | topics: braze, customer-engagement, lifecycle, benchmarks | kind: vendor thought leadership | bias: vendor-thought-leadership | summary: Braze's research hub — annual Customer Engagement reviews, benchmarks, case studies. Tag as vendor-published when citing benchmarks.

### Founder expertise

- **justin-williames** — Justin Williames, Orbit Founder | https://www.linkedin.com/in/justinwilliames | topics: lifecycle, crm, braze, founder-perspective | kind: founder attribution | bias: founder | summary: Use when a recommendation reflects Orbit's founder's publicly-documented views, published posts, or distinctive methodology — not for every Orbit output.

---

## Explicitly blocked sources

These sources are intentionally excluded from the registry because their primary purpose is to market the publisher's own product. Do NOT cite them even if a specific post appears accurate — the commercial incentive compromises the signal.

- Klaviyo blog, Attentive blog, SendGrid / Twilio blog, Iterable blog, OneSignal blog, Mailgun blog, Mailmodo guides, Segment blog, Hightouch blog

If a claim's only apparent support is one of these blogs, either:
1. Find an alternative neutral or vendor-technical source, or
2. Omit the citation and caveat the claim as "commonly reported" or "widely used in industry" without linking.

---

## Practical examples

### Good — cites only the non-obvious claim

> Keep your total HTML under ~102 KB to avoid Gmail clipping.[^1] Once the template is under the threshold, compress images and strip MSO conditionals you don't need.
>
> ---
> **Sources**
> [^1]: [Email Image Blocking guide](https://www.litmus.com/blog/the-ultimate-guide-to-email-image-blocking) — Lauren Smith, Litmus (vendor-published)

(Only the 102 KB benchmark is cited; image compression advice is common knowledge. Bias tag applied.)

### Good — founder attribution for a distinctive methodology

> Orbit's program discovery asks about budget and sign-off before scope — surfacing constraints early prevents rework downstream.[^1]
>
> ---
> **Sources**
> [^1]: Justin Williames, Orbit Founder — [LinkedIn](https://www.linkedin.com/in/justinwilliames)

### Good — preferring neutral over vendor

> Two-proportion z-tests assume ~30+ conversions per arm for valid inference.[^1]
>
> ---
> **Sources**
> [^1]: [Trustworthy Online Controlled Experiments](https://exp-platform.com/) — Ronny Kohavi

(Many vendor blogs repeat this; the neutral academic source is preferred.)

### Bad — over-citing generic advice

> Use a clear call-to-action.[^1] Test your subject lines.[^2] Segment your list.[^3]

(None of these claims require citation. They are common knowledge.)

### Bad — citing a blocked source

> Per Klaviyo's data, SMS outperforms email on weekends.[^1]

(Klaviyo is a blocked source — category vendor pushing the category. Remove the citation. If the claim has no neutral source, caveat it or drop it.)

---

## Evidence And Currency Rules

- Never invent a URL, title, author, or publication. If in doubt, omit the citation.
- Registry URLs are verified live at the time of this skill's last update. If a URL 404s at use time, cite the homepage of the publisher and flag that the specific page could not be confirmed.
- If a claim's source is older than ~3 years and involves platform capability, regulation, or benchmark data, add a parenthetical caveat ("as of [year]") inside the footnote.
- If the user challenges a citation, defer to them. Sources are a signal of diligence; they are not an argument.
- Founder attribution is for specific founder-authored views, not "everything from Orbit." Over-attributing to Justin cheapens the signal.

---

## Adding new sources

When Orbit encounters a claim whose source belongs in the registry but isn't yet listed, Claude should:
1. Verify the URL is live and the author/publication attribution is correct.
2. Classify the bias honestly — if the source is a vendor blog pushing the vendor's own category, it is `blocked`, not `vendor-thought-leadership`.
3. Propose the new registry entry to the user (in the response), using the existing format.
4. Never silently add unverified sources to the registry.

The registry is append-only and curated — every addition should earn its place, and the `blocked` list exists for a reason.
