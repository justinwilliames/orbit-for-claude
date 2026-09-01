/**
 * Router scoring — the gate on "Orbit can still say I do not know".
 *
 * `orbit_route_task` awarded +8 for the CONFIGURED default platform, from
 * `catalog.js`, against a floor of 6. The bonus came out of a config file,
 * not out of the request, so every skill in that platform's family started
 * every request already over the line. The measurable consequence was not a
 * mis-rank — it was the loss of a verdict:
 *
 *   - "sharpen a hand plane" routed to braze-build-packager and reported
 *     interactionRecommendation.mode = "ready_to_proceed";
 *   - "how do I bake a chocolate cake?" abstained with no config and routed
 *     to braze-documentation-expert with one, which is the same question
 *     getting two different answers depending on a file it never saw;
 *   - `no_strong_match` at catalog.js:235 was unreachable for any user who
 *     had finished setup. Orbit could not say "I don't know" to a customer.
 *
 * Three smaller leaks fed the same failure and are gated here too: a
 * sequence keyword matched by SUBSTRING (so "failing alignment" pulled the
 * AI-personalisation sequence on the letters a-i, worth a flat +9); a
 * phrase-coverage point for a single word appearing anywhere inside a
 * trigger phrase ("been" ⊂ "we've been blacklisted"); and a flat +2 for any
 * shared keyword, where a skill's keyword set is tokenised prose and "any"
 * is in 54 of 83 of them.
 *
 * WHAT THIS SUITE DELIBERATELY IS NOT: a list of off-topic strings with
 * expected scores. Tune a scorer against three fixed sentences and you get
 * a scorer that passes on three fixed sentences. Every assertion below is
 * about the SHAPE of the outcome — abstain or don't, same verdict either
 * way, config may reorder but never qualify — and the single-token corpus
 * is DERIVED from the library at run time, so it re-picks its own inputs as
 * skills are added and cannot be quietly tuned around.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadOrbitLibrary } from "../../server/orbit-library.js";
import { PLATFORM_NAMES, composeSequence, routeTask } from "../../server/catalog.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const library = loadOrbitLibrary(ROOT_DIR);

/**
 * The configurations a real install can be in. `{}` is a fresh clone; the
 * rest are somebody who finished setup. Every property below has to hold
 * across all of them, because "did the user run setup" is not information
 * about what the user just asked for.
 */
const INSTALL_CONFIGS = [
  { label: "unconfigured", defaults: {} },
  ...PLATFORM_NAMES.map((platform) => ({
    label: `default=${platform}`,
    defaults: { defaultPlatform: platform, defaultGeography: "australia" }
  }))
];

/**
 * Requests with no lifecycle-marketing content. Chosen from unrelated
 * trades so that nothing but incidental English overlaps the library:
 * woodworking, bookkeeping, weather, cooking, transport, cartography.
 */
const OFF_TOPIC = [
  "sharpen a hand plane",
  "I need to reconcile accounts payable in Xero for last quarter",
  "The weather in Lisbon has been unusually mild for October",
  "how do I bake a chocolate cake?",
  "What gauge wire should I run to a 240 volt shed subpanel?",
  "My sourdough starter has stopped rising after I moved house",
  "Which ferry crosses to the island before the tide turns?",
  "Translate this Latin inscription on a seventeenth century map"
];

/**
 * On-topic requests, each with the family of skills that would be a
 * defensible answer. The assertion is family membership, not one exact
 * name: several of these have more than one right answer, and pinning the
 * winner would make this suite a scoring table by the back door.
 */
const ON_TOPIC = [
  {
    request: "Rebuild our Braze win-back campaign for lapsed subscribers",
    family: ["lifecycle-design", "winback-playbook", "journey-mapping", "program-brief"]
  },
  {
    request: "I just installed this, I want to build a welcome email",
    family: [
      "smart-header-builder",
      "email-production-system",
      "onboarding-design",
      "copy-framework",
      "stripo-email-builder",
      "lifecycle-design"
    ]
  },
  {
    request: "QA my Braze canvas before launch",
    family: ["braze-canvas-qa", "pre-launch-review", "email-render-qa"]
  },
  {
    request: "Our emails are going to spam and sender reputation is dropping",
    family: [
      "deliverability-management",
      "reputation-recovery",
      "braze-deliverability",
      "gmail-bulk-sender-compliance"
    ]
  },
  {
    request: "Orbit finds render bugs before you send and turns your emails into a design system",
    family: [
      "template-brain",
      "email-design-ingestion",
      "design-to-email-componentization",
      "email-production-system"
    ]
  },
  {
    request: "Write a program brief for a Braze onboarding flow for new trial users.",
    family: ["program-brief", "onboarding-design", "lifecycle-design"]
  },
  {
    request: "How should we structure our contact properties and event taxonomy?",
    family: ["crm-data-model", "segmentation-strategy"]
  },
  {
    request: "Design a renewal and expansion motion for our account managers",
    family: ["b2b-lifecycle", "lifecycle-design", "retention-economics", "journey-mapping"]
  }
];

const describeRoute = (result) =>
  `${result.primarySkill} :: ` +
  (result.rankedMatches ?? []).map((m) => `${m.score} ${m.skill}`).join(" | ");

describe("Router — abstention is reachable, and reachable from every install", () => {
  for (const request of OFF_TOPIC) {
    for (const { label, defaults } of INSTALL_CONFIGS) {
      test(`[${label}] "${request.slice(0, 46)}" → no_strong_match`, () => {
        const result = routeTask(library, request, 5, defaults);
        assert.equal(
          result.no_strong_match,
          true,
          `Orbit claimed a match for an off-topic request: ${describeRoute(result)}`
        );
        assert.equal(result.primarySkill, null);
        assert.equal(result.interactionRecommendation.mode, "ask_user_first");
      });
    }
  }
});

/**
 * The property the +8 platform bonus violated, stated directly: the verdict
 * is a function of the request. This is the assertion that fails loudest if
 * any config-derived quantity ever gets added to merit again — it needs no
 * threshold, no expected score, and no opinion about which skill is right.
 */
describe("Router — the abstain/answer verdict depends on the request, never the config", () => {
  for (const request of [...OFF_TOPIC, ...ON_TOPIC.map((entry) => entry.request)]) {
    test(`"${request.slice(0, 52)}" gets one verdict across every install`, () => {
      const verdicts = INSTALL_CONFIGS.map(({ label, defaults }) => ({
        label,
        abstained: routeTask(library, request, 5, defaults).no_strong_match === true
      }));
      const distinct = [...new Set(verdicts.map((v) => v.abstained))];
      assert.equal(
        distinct.length,
        1,
        "configuration changed whether Orbit knows the answer: " +
          JSON.stringify(verdicts)
      );
    });
  }
});

/**
 * The mechanism, not just the symptom. Config may REORDER candidates that
 * already earned a place; it may never CREATE one. Compared with the limit
 * lifted well past the library size so the five-item slice cannot disguise
 * an introduced candidate as a dropped one.
 */
describe("Router — configuration reorders candidates, it never introduces one", () => {
  for (const request of [...OFF_TOPIC, ...ON_TOPIC.map((entry) => entry.request)]) {
    test(`"${request.slice(0, 52)}" gains no candidate from config`, () => {
      const wide = library.skills.length + 10;
      const baseline = new Set(
        (routeTask(library, request, wide, {}).rankedMatches ?? []).map((m) => m.skill)
      );

      for (const { label, defaults } of INSTALL_CONFIGS.slice(1)) {
        const configured = (routeTask(library, request, wide, defaults).rankedMatches ?? []).map(
          (m) => m.skill
        );
        const introduced = configured.filter((name) => !baseline.has(name));
        assert.deepEqual(
          introduced,
          [],
          `[${label}] config alone qualified ${introduced.join(", ")} for "${request}"`
        );
      }
    });
  }
});

describe("Router — on-topic requests still reach the right family", () => {
  for (const { request, family } of ON_TOPIC) {
    for (const { label, defaults } of [INSTALL_CONFIGS[0], INSTALL_CONFIGS[1]]) {
      test(`[${label}] "${request.slice(0, 44)}" → ${family[0]} family`, () => {
        const result = routeTask(library, request, 5, defaults);
        assert.ok(
          family.includes(result.primarySkill),
          `expected one of ${family.join(", ")}; got ${describeRoute(result)}`
        );
      });
    }
  }
});

/**
 * A single shared word is not a match — proved against words the LIBRARY
 * says are common, recomputed on every run.
 *
 * The Xero accounts-payable request routed to b2b-lifecycle on the one
 * shared keyword "any", which is in the keyword set of 54 of 83 skills. The
 * general defect is that a term carried by most of the corpus carries no
 * information about which skill is right. Deriving the corpus from document
 * frequency rather than writing the words down means this test picks up new
 * common words as skills are added, and cannot be satisfied by special-
 * casing the handful someone happened to notice.
 *
 * Platform names are excluded: "braze" is common across the library because
 * a lot of skills genuinely are about Braze, and naming a platform is real
 * information — just not a task.
 */
describe("Router — no single widely-shared word routes a request", () => {
  const documentFrequency = new Map();
  for (const skill of library.skills) {
    for (const keyword of skill.keywords) {
      documentFrequency.set(keyword, (documentFrequency.get(keyword) ?? 0) + 1);
    }
  }

  const commonWords = [...documentFrequency.entries()]
    .filter(([keyword]) => !PLATFORM_NAMES.includes(keyword))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 25)
    .map(([keyword, count]) => ({ keyword, count }));

  test("the derived corpus is actually populated", () => {
    assert.ok(
      commonWords.length === 25 && commonWords[0].count > library.skills.length / 4,
      `document-frequency corpus looks wrong: ${JSON.stringify(commonWords.slice(0, 3))}`
    );
  });

  for (const { keyword, count } of commonWords) {
    test(`"${keyword}" alone (in ${count}/${library.skills.length} skills) never proceeds`, () => {
      const verdicts = [];
      for (const { label, defaults } of INSTALL_CONFIGS) {
        const result = routeTask(library, `${keyword}`, 5, defaults);
        // Orbit may surface a candidate off one word — several of these are
        // genuine domain nouns — but it must never call that enough context
        // to act on. `ready_to_proceed` off a single shared token is the
        // shape of the original defect: "sharpen a hand plane" came back
        // ready_to_proceed against braze-build-packager.
        assert.notEqual(
          result.interactionRecommendation.mode,
          "ready_to_proceed",
          `[${label}] one word was treated as sufficient context: ${describeRoute(result)}`
        );
        verdicts.push(result.no_strong_match === true);
      }
      assert.equal(
        new Set(verdicts).size,
        1,
        `config changed the verdict for the single word "${keyword}"`
      );
    });
  }
});

/**
 * Sequence keywords are matched on word boundaries, not substrings.
 *
 * `findBestSequenceMatch` used `String.includes`, so the two-letter
 * sequence keyword "ai" matched inside "failing" and "alignment" and handed
 * a flat +9 — three points above the floor — to four skills for an SPF
 * question. Stated as a property over the sequence table so it holds for
 * every keyword in it, present and future.
 */
describe("Router — a substring is not a mention", () => {
  /**
   * Driven through `composeSequence` with no primary skill, so it tests the
   * sequence matcher itself. Asserting on `routeTask().suggestedSequence`
   * looked equivalent and was not: once the request abstains there is no
   * sequence to return, so the assertion passed without the matcher ever
   * being exercised. Every carrier below contains the letters of a sequence
   * keyword inside an unrelated word — "ai" inside "failing", "alignment",
   * "mainsail", "chair"; "account" inside "accounts payable".
   */
  const carriers = [
    "Our SPF record has two includes too many and DMARC is failing alignment on the subdomain",
    "The mainsail is chafing against the shrouds",
    "I need to reconcile accounts payable in Xero for last quarter",
    "The chair rail needs sanding before the second coat"
  ];

  for (const request of carriers) {
    test(`"${request.slice(0, 46)}" pulls no named sequence`, () => {
      assert.equal(
        composeSequence(request, null),
        null,
        `a sequence was matched on a substring: ${composeSequence(request, null)?.id}`
      );
    });
  }
});
