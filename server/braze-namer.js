/**
 * Braze Namer — generate consistent naming conventions for Braze assets.
 *
 * Produces deterministic name strings from configurable dimensions
 * and recommends Braze tags based on selections.
 */

import { slugify } from "./utils.js";

// ---------------------------------------------------------------------------
// Default dimension configuration
// ---------------------------------------------------------------------------

const COUNTRY_LABELS = {
  AU: "Australia", NZ: "New Zealand", US: "United States", CA: "Canada",
  GB: "United Kingdom", IE: "Ireland", DE: "Germany", FR: "France",
  IT: "Italy", ES: "Spain", PT: "Portugal", NL: "Netherlands",
  SE: "Sweden", NO: "Norway", DK: "Denmark", FI: "Finland", PL: "Poland",
  JP: "Japan", KR: "South Korea", SG: "Singapore", HK: "Hong Kong",
  IN: "India", BR: "Brazil", MX: "Mexico", AE: "United Arab Emirates",
  ZA: "South Africa", GLOBAL: "Global / All markets"
};

const LANGUAGE_LABELS = {
  en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian",
  pt: "Portuguese", nl: "Dutch", sv: "Swedish", no: "Norwegian", da: "Danish",
  fi: "Finnish", pl: "Polish", ja: "Japanese", ko: "Korean", zh: "Chinese",
  ar: "Arabic", hi: "Hindi"
};

const DEFAULT_DIMENSIONS = [
  { key: "asset_type", label: "Asset Type", type: "select", values: ["Canvas", "Campaign", "Segment", "Template", "Content Block"] },
  { key: "channel", label: "Channel", type: "select", values: ["Email", "Push", "SMS", "In-App", "Banner", "Content Card", "WhatsApp"] },
  { key: "program", label: "Program", type: "select", values: ["Onboarding", "Activation", "Retention", "Dunning", "Win-back", "Feature Adoption", "Upsell", "Re-engagement", "Transactional", "Promotional"] },
  { key: "audience", label: "Audience", type: "select", values: ["All", "Free", "Paid", "Trial", "Churned", "At-Risk", "New", "Dormant", "VIP"] },
  { key: "country", label: "Country", type: "select", values: Object.keys(COUNTRY_LABELS) },
  { key: "language", label: "Language", type: "select", values: Object.keys(LANGUAGE_LABELS) },
  { key: "version", label: "Version", type: "text" },
  { key: "step", label: "Step / Day", type: "text" },
  { key: "variant", label: "Variant", type: "text" },
  { key: "deployment_date", label: "Deployment Date", type: "date" }
];

// ---------------------------------------------------------------------------
// Tag recommendation rules
// ---------------------------------------------------------------------------

const TAG_RULES = {
  asset_type: {
    canvas: { primary: "Canvas", children: ["Multi-Step", "Action-Based", "Scheduled"] },
    campaign: { primary: "Campaign", children: ["Scheduled", "Action-Based", "API-Triggered"] },
    segment: { primary: "Segment", children: ["Dynamic", "Static"] },
    template: { primary: "Template", children: ["Reusable", "Shared"] },
    "content block": { primary: "Content Block", children: ["HTML", "Liquid", "Shared"] }
  },
  channel: {
    email: { primary: "Email", children: ["Marketing", "Transactional", "HTML", "Plain Text"] },
    push: { primary: "Push", children: ["iOS", "Android", "Web", "Silent"] },
    sms: { primary: "SMS", children: ["Marketing", "Transactional", "MMS"] },
    "in-app": { primary: "In-App", children: ["Modal", "Slideup", "Full Screen"] },
    banner: { primary: "Banner", children: ["Persistent", "Dismissible"] },
    "content card": { primary: "Content Card", children: ["Classic", "Captioned", "Banner"] },
    whatsapp: { primary: "WhatsApp", children: ["Marketing", "Transactional", "Utility"] }
  },
  program: {
    onboarding: { primary: "Onboarding", children: ["Welcome", "Setup", "Education", "Activation"] },
    activation: { primary: "Activation", children: ["First Action", "Aha Moment", "Profile Complete"] },
    retention: { primary: "Retention", children: ["Engagement", "Habit Loop", "Value Reminder"] },
    dunning: { primary: "Dunning", children: ["Payment Failed", "Card Expiring", "Grace Period"] },
    "win-back": { primary: "Win-back", children: ["Lapsed", "Offer", "Feedback Request"] },
    "feature adoption": { primary: "Feature Adoption", children: ["Announcement", "Tutorial", "Nudge"] },
    upsell: { primary: "Upsell", children: ["Upgrade", "Cross-Sell", "Add-On"] },
    "re-engagement": { primary: "Re-engagement", children: ["Inactive", "Dormant", "Last Chance"] },
    transactional: { primary: "Transactional", children: ["Receipt", "Confirmation", "Notification"] },
    promotional: { primary: "Promotional", children: ["Sale", "Seasonal", "Launch", "Event"] }
  },
  audience: {
    all: { primary: "All Users", children: [] },
    free: { primary: "Free", children: ["Active Free", "Inactive Free"] },
    paid: { primary: "Paid", children: ["Monthly", "Annual", "Enterprise"] },
    trial: { primary: "Trial", children: ["Early Trial", "Mid Trial", "Expiring"] },
    churned: { primary: "Churned", children: ["Recent Churn", "Long-Term Churn"] },
    "at-risk": { primary: "At-Risk", children: ["Low Engagement", "Declining Usage"] },
    new: { primary: "New", children: ["Day 0", "Week 1", "Month 1"] },
    dormant: { primary: "Dormant", children: ["30-Day Inactive", "60-Day Inactive", "90-Day Inactive"] },
    vip: { primary: "VIP", children: ["High LTV", "Power User", "Advocate"] }
  }
};

const REGION_MAP = {
  AU: { region: "APAC", market: "ANZ" }, NZ: { region: "APAC", market: "ANZ" },
  JP: { region: "APAC", market: "North Asia" }, KR: { region: "APAC", market: "North Asia" },
  HK: { region: "APAC", market: "Greater China" }, SG: { region: "APAC", market: "SEA" },
  IN: { region: "APAC", market: "South Asia" }, US: { region: "Americas", market: "North America" },
  CA: { region: "Americas", market: "North America" }, MX: { region: "Americas", market: "LatAm" },
  BR: { region: "Americas", market: "LatAm" }, GB: { region: "EMEA", market: "UK & Ireland" },
  IE: { region: "EMEA", market: "UK & Ireland" }, DE: { region: "EMEA", market: "DACH" },
  FR: { region: "EMEA", market: "Western Europe" }, IT: { region: "EMEA", market: "Southern Europe" },
  ES: { region: "EMEA", market: "Southern Europe" }, PT: { region: "EMEA", market: "Southern Europe" },
  NL: { region: "EMEA", market: "Western Europe" }, SE: { region: "EMEA", market: "Nordics" },
  NO: { region: "EMEA", market: "Nordics" }, DK: { region: "EMEA", market: "Nordics" },
  FI: { region: "EMEA", market: "Nordics" }, PL: { region: "EMEA", market: "CEE" },
  AE: { region: "EMEA", market: "GCC" }, ZA: { region: "EMEA", market: "Africa" },
  GLOBAL: { region: "Global", market: "All Markets" }
};

const COMBO_TAGS = [
  { match: { channel: "email", program: "transactional" }, tags: { primary: "Compliance", children: ["CAN-SPAM", "Unsubscribe Exempt"] } },
  { match: { program: "dunning", channel: "email" }, tags: { primary: "Revenue Recovery", children: ["Payment Retry", "Update Payment Method"] } },
  { match: { program: "onboarding", audience: "new" }, tags: { primary: "First Impressions", children: ["Day 0 Welcome", "Quick Win"] } },
  { match: { program: "win-back", audience: "churned" }, tags: { primary: "Re-Acquisition", children: ["Win-Back Offer", "Feedback Survey"] } }
];

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

export function generateBrazeName({ selections = {}, customDimensions }) {
  const dimensions = customDimensions ?? DEFAULT_DIMENSIONS;

  const name = dimensions
    .map((d) => {
      const raw = selections[d.key]?.trim();
      if (!raw) return "";
      if (d.type === "date") return raw;
      return raw.replace(/\s+/g, "-").toLowerCase();
    })
    .filter(Boolean)
    .join("_");

  const tags = getRecommendedTags(selections);

  return {
    status: "ok",
    name: name || null,
    dimensions: dimensions.map((d) => ({
      key: d.key,
      label: d.label,
      type: d.type,
      selected: selections[d.key] ?? null,
      available_values: d.values ?? null
    })),
    recommended_tags: tags,
    message: name
      ? `Generated name: ${name}`
      : "No dimensions selected. Provide values for at least one dimension."
  };
}

export function listBrazeNamerDimensions() {
  return {
    status: "ok",
    dimensions: DEFAULT_DIMENSIONS.map((d) => ({
      key: d.key,
      label: d.label,
      type: d.type,
      values: d.values ?? null
    })),
    message: `${DEFAULT_DIMENSIONS.length} dimensions available. Pass selections as { "asset_type": "Canvas", "channel": "Email", ... } to orbit_braze_namer.`
  };
}

function getRecommendedTags(selections) {
  const groups = [];
  const seen = new Set();

  for (const [dimKey, value] of Object.entries(selections)) {
    if (!value) continue;
    const dimRules = TAG_RULES[dimKey];
    if (!dimRules) continue;
    const rule = dimRules[value.toLowerCase()];
    if (rule && !seen.has(rule.primary)) {
      seen.add(rule.primary);
      groups.push({ primary: rule.primary, children: rule.children });
    }
  }

  const countryCode = selections.country?.toUpperCase();
  if (countryCode && REGION_MAP[countryCode]) {
    const r = REGION_MAP[countryCode];
    const primary = `${r.region} Region`;
    if (!seen.has(primary)) {
      seen.add(primary);
      groups.push({ primary, children: [r.market, countryCode].filter(Boolean) });
    }
  }

  const lang = selections.language?.toLowerCase();
  const LANG_NAMES = { en: "English", es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese", nl: "Dutch", sv: "Swedish", no: "Norwegian", da: "Danish", fi: "Finnish", pl: "Polish", ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic", hi: "Hindi" };
  if (lang && LANG_NAMES[lang]) {
    const primary = "Localisation";
    if (!seen.has(primary)) {
      seen.add(primary);
      groups.push({ primary, children: [LANG_NAMES[lang], lang.toUpperCase()] });
    }
  }

  for (const combo of COMBO_TAGS) {
    const matches = Object.entries(combo.match).every(
      ([k, v]) => selections[k]?.toLowerCase() === v
    );
    if (matches && !seen.has(combo.tags.primary)) {
      seen.add(combo.tags.primary);
      groups.push(combo.tags);
    }
  }

  return groups;
}
