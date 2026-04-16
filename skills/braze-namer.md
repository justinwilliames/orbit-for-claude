---
name: braze-namer
description: >
  Use this skill when the user needs to generate a consistent naming convention for a
  Braze asset — Canvas, campaign, segment, template, Content Block, or any other object.
  Trigger on "name this Canvas", "what should I call this campaign?", "generate a Braze
  naming convention", "naming standard for our Braze assets", or any request to produce
  deterministic, structured asset names for Braze.
---

# Braze Namer

Generate consistent, structured naming conventions for any Braze asset. Produces deterministic name strings from a set of configurable dimensions.

---

## Execution Standard

1. Ask which dimensions the user wants in their name string. Default: asset type, channel, program, audience, country, language, version, step, variant, deployment date.
2. Collect values for each dimension — either from the user or inferred from the program context.
3. Build the name string using underscore separators, lowercase values, hyphens for spaces within values, dates as YYYY-MM-DD.
4. Recommend Braze tags based on the selections (asset type, channel, program, audience, region, language, and cross-dimensional combos).

## Name Format

```
{asset_type}_{channel}_{program}_{audience}_{country}_{language}_{version}_{step}_{variant}_{date}
```

Only populated dimensions appear. Empty dimensions are omitted.

**Examples:**
- `canvas_email_onboarding_trial_au_en_v1_day-1`
- `campaign_push_win-back_churned_global_en`
- `segment_retention_paid_us`
- `template_email_dunning_all_gb_en_v2`

## Default Dimensions

| Key | Label | Type | Default Values |
|---|---|---|---|
| asset_type | Asset Type | select | Canvas, Campaign, Segment, Template, Content Block |
| channel | Channel | select | Email, Push, SMS, In-App, Banner, Content Card, WhatsApp |
| program | Program | select | Onboarding, Activation, Retention, Dunning, Win-back, Feature Adoption, Upsell, Re-engagement, Transactional, Promotional |
| audience | Audience | select | All, Free, Paid, Trial, Churned, At-Risk, New, Dormant, VIP |
| country | Country | select | AU, NZ, US, CA, GB, IE, DE, FR, IT, ES, PT, NL, SE, NO, DK, FI, PL, JP, KR, SG, HK, IN, BR, MX, AE, ZA, GLOBAL |
| language | Language | select | en, es, fr, de, it, pt, nl, sv, no, da, fi, pl, ja, ko, zh, ar, hi |
| version | Version | text | — |
| step | Step / Day | text | — |
| variant | Variant | text | — |
| deployment_date | Deployment Date | date | — |

## Tag Recommendations

Based on selections, recommend appropriate Braze tags:

### Per-dimension tags
- **Asset type** → Canvas: Multi-Step, Action-Based, Scheduled
- **Channel** → Email: Marketing, Transactional, HTML, Plain Text
- **Program** → Onboarding: Welcome, Setup, Education, Activation
- **Audience** → Trial: Early Trial, Mid Trial, Expiring

### Region tags (from country)
- AU/NZ → APAC Region, ANZ
- US/CA → Americas Region, North America
- GB/IE → EMEA Region, UK & Ireland

### Cross-dimensional combo tags
- Email + Transactional → Compliance: CAN-SPAM, Unsubscribe Exempt
- Dunning + Email → Revenue Recovery: Payment Retry, Update Payment Method
- Onboarding + New → First Impressions: Day 0 Welcome, Quick Win
- Win-back + Churned → Re-Acquisition: Win-Back Offer, Feedback Survey

## When to Use

- Before creating any new Braze asset
- When establishing or documenting team naming conventions
- During Braze instance audits to standardise existing naming
- When building message plans that need consistent asset naming across a program

## Web Version

This tool is also available as a free web app at [yourorbit.team/brazenamer](https://yourorbit.team/brazenamer).
