/**
 * Skill routing — the index a stranger's first question lands on.
 *
 * Every failure here was silent. The build printed "Wrote 79 skill
 * manifest entries" and exited 0 while:
 *
 *   - the frontmatter parser handled the block scalars `>` and `|` but
 *     not `>-`, so eight skills' descriptions parsed to the literal two
 *     characters ">-" and shipped with no keywords and no trigger
 *     phrases at all;
 *   - 38 of 79 skills fell through a `?? "other"` and shipped with an
 *     empty supported_platforms list, which catalog.js reads as
 *     platform-agnostic — so every braze-* skill lost the platform
 *     bonus on a request that said the word Braze;
 *   - `tokenize` dropped every token of two characters, so "QA" — the
 *     word a marketer types for the pre-launch check — never reached
 *     the router from either side.
 *
 * The net effect was orbit_route_task answering the two most obvious
 * Braze questions with the wrong skill, confidently, with no error.
 * These assertions all failed before the fix.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadOrbitLibrary, tokenize } from "../../server/orbit-library.js";
import { routeTask } from "../../server/catalog.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT_DIR, "data", "skills.manifest.json"), "utf8")
);
const library = loadOrbitLibrary(ROOT_DIR);

describe("Skill manifest — no skill ships unclassified or undescribed", () => {
  test("every skill has a real description, never a stray block-scalar marker", () => {
    const broken = manifest
      .filter((s) => s.description.length < 40)
      .map((s) => `${s.name}: ${JSON.stringify(s.description)}`);
    assert.deepEqual(broken, [], "a frontmatter description failed to parse");
  });

  test("no skill is in the `other` catch-all", () => {
    const orphans = manifest.filter((s) => s.category === "other").map((s) => s.name);
    assert.deepEqual(orphans, [], "an unclassified skill shipped — CATEGORY_GROUPS is missing an entry");
  });

  test("every braze-* skill declares Braze support", () => {
    const missing = manifest
      .filter((s) => s.name.startsWith("braze-"))
      .filter((s) => !s.platform_sensitivity.supported_platforms.includes("braze"))
      .map((s) => s.name);
    assert.deepEqual(missing, [], "a Braze skill does not say it is a Braze skill");
  });

  // Generalised from the Braze-only assertion above. Five ESPs shipped
  // adapters in server/esp/ and documentation-expert skills, and every one
  // of those skills carried an empty supported_platforms — so none of them
  // could ever earn the platform bonus, and none surfaced for its own
  // verbatim trigger phrase.
  test("every shipped ESP's documentation expert declares its own platform", () => {
    const wrong = ESP_PLATFORMS.map(({ skill, platform }) => {
      const entry = manifest.find((s) => s.name === skill);
      if (!entry) return `${skill}: missing from the manifest`;
      const declared = entry.platform_sensitivity.supported_platforms;
      return declared.includes(platform) ? null : `${skill}: declares ${JSON.stringify(declared)}`;
    }).filter(Boolean);
    assert.deepEqual(wrong, [], "an ESP skill does not say which ESP it is for");
  });
});

/**
 * The six ESPs with an adapter in server/esp/, each with a request a
 * marketer would actually type. Parameterised deliberately: the Braze
 * fix in 8c7b8ef was tested only for Braze, which is why the same bug
 * survived for the other five.
 */
const ESP_PLATFORMS = [
  {
    platform: "braze",
    skill: "braze-documentation-expert",
    request: "How do I write this Liquid in Braze for a Canvas step?"
  },
  {
    platform: "iterable",
    skill: "iterable-documentation-expert",
    request: "Write this Handlebars expression for an Iterable template"
  },
  {
    platform: "klaviyo",
    skill: "klaviyo-documentation-expert",
    request: "How do I write a Klaviyo template tag for a product block?"
  },
  {
    platform: "mailchimp",
    skill: "mailchimp-documentation-expert",
    request: "Set up a Mailchimp welcome automation for my newsletter"
  },
  {
    platform: "customerio",
    skill: "customerio-documentation-expert",
    request: "Why is my Customer.io segment not populating?"
  },
  {
    platform: "sfmc",
    skill: "sfmc-documentation-expert",
    request: "Build a journey in Salesforce Marketing Cloud"
  }
];

describe("orbit_route_task can see every ESP Orbit ships an adapter for", () => {
  for (const { platform, skill, request } of ESP_PLATFORMS) {
    test(`"${request}" is detected as ${platform} and routes to ${skill}`, () => {
      const result = routeTask(library, request, 5, {});
      assert.equal(
        result.detectedSignals.platform,
        platform,
        `detected ${result.detectedSignals.platform} instead`
      );
      assert.equal(result.detectedSignals.platform_source, "request");
      const ranked = (result.rankedMatches ?? []).map((m) => `${m.score} ${m.skill}`);
      assert.equal(
        result.primarySkill,
        skill,
        `routed to ${result.primarySkill} instead.\n  ${ranked.join("\n  ")}`
      );
    });
  }

  test("a named platform beats the configured default, and the substitution is visible", () => {
    const result = routeTask(
      library,
      "I use Klaviyo for my Shopify store. Help me build an abandoned cart flow.",
      5,
      { defaultPlatform: "braze" }
    );
    assert.equal(result.detectedSignals.platform, "klaviyo");
    assert.deepEqual(result.detectedSignals.platform_conflict, {
      requested: "klaviyo",
      configured_default: "braze"
    });
    assert.ok(
      result.assumptionsToState.some((a) => a.includes("klaviyo") && a.includes("braze")),
      `no assumption named the conflict: ${JSON.stringify(result.assumptionsToState)}`
    );
    assert.ok(
      result.rankedMatches.every((m) => !m.reasons.some((r) => r.includes("braze platform context")))
    );
  });

  test("interactionRecommendation carries one shape on every branch", () => {
    // The no-match branch returned the bare string "ask_user"; both in-repo
    // consumers read `.mode`, so the one branch where asking is mandatory
    // was the one branch where the field read as undefined.
    const noMatch = routeTask(library, "zzzz qqqq wwww", 5, {});
    assert.equal(noMatch.primarySkill, null);
    assert.equal(typeof noMatch.interactionRecommendation, "object");
    assert.equal(noMatch.interactionRecommendation.mode, "ask_user_first");
    const matched = routeTask(library, "QA my Braze canvas before launch", 5, {});
    assert.equal(typeof matched.interactionRecommendation.mode, "string");
  });
});

describe("Tokeniser — the two-letter words this domain runs on", () => {
  test("QA and IP survive the length filter; noise does not", () => {
    assert.ok(tokenize("QA my Braze canvas").includes("qa"));
    assert.ok(tokenize("warm up a new sending IP").includes("ip"));
    // The floor is still there for everything not on the allowlist.
    assert.ok(!tokenize("go to it").includes("go"));
  });
});

describe("orbit_route_task answers the obvious Braze questions with the obvious skill", () => {
  const routes = [
    ["QA my Braze canvas before launch", "braze-canvas-qa"],
    ["Analyse the segments in my Braze workspace", "braze-segment-analysis"],
    // Guardrail in the other direction: the packager must keep winning
    // its own request, or the fix above has just moved the error.
    ["package this for Braze", "braze-build-packager"],
    // braze-operator arrived in 0.41.0 against a live 71-tool probe. It has to
    // win its own doors without stealing its neighbours': the router owns
    // surface questions, campaign-operations owns launch, and the word
    // "operator" must not drag every Braze request into an autonomous
    // browser job.
    ["use Braze Operator to build the canvas", "braze-operator"],
    ["cancel the operator job", "braze-operator"],
    ["launch this Braze campaign via API", "braze-campaign-operations"],
    ["which Braze tool should I use", "braze-mcp-operations"],
  ];

  for (const [request, expected] of routes) {
    test(`"${request}" routes to ${expected}`, () => {
      const result = routeTask(library, request, 5, {});
      const ranked = (result.rankedMatches ?? []).map((m) => `${m.score} ${m.skill}`);
      assert.equal(
        result.primarySkill,
        expected,
        `routed to ${result.primarySkill} instead.\n  ${ranked.join("\n  ")}`
      );
    });
  }

  test("the pre-launch check is an audit, not a build", () => {
    // "launch" alone put this in the build bucket, which handed +4 to
    // every skill with "build" in its name.
    assert.equal(routeTask(library, "QA my Braze canvas before launch", 1, {}).taskType, "audit");
  });
});

/**
 * The doors' own words must reach the deed.
 *
 * Wave 2 pointed four surfaces at the render gate and the lifecycle
 * brain — README:3, orbit.md:43, the manifest description, the
 * getting-started page — and shipped four sentences the router resolved
 * elsewhere: "check this email before I send it" ranked
 * `pre-launch-review` (14) over `email-render-qa` (9), and "build me a
 * lifecycle brain" ranked `copy-framework` (6) with `template-brain`
 * nowhere in the top three. The copy was right and unwitnessed.
 *
 * These are the door sentences, verbatim, asserted at rank 1. A copy
 * edit that reorders a promise without re-running the router now fails
 * here rather than in a stranger's first chat.
 */
describe("The door sentences route to the deed they promise", () => {
  const doors = [
    // README:3 / orbit.md:43 / manifest.description — the brain half.
    ["build me a lifecycle brain", "template-brain"],
    ["turn the emails I already send into a design system", "template-brain"],
    // README:3 / orbit.md:43 / manifest.description — the render-gate half.
    ["check this email before I send it", "email-render-qa"],
    ["check my email in a real browser before I send", "email-render-qa"],
    // get-orbit app/getting-started/page.tsx prompt #1, verbatim. A
    // labelled prompt that misroutes costs more than no prompt at all.
    [
      "Build a two-line test email with a slightly-too-faint brand colour on white, " +
        "then run it through the render gate and show me what it flags.",
      "email-render-qa"
    ]
  ];

  for (const [request, expected] of doors) {
    test(`"${request.slice(0, 60)}" routes to ${expected}`, () => {
      const result = routeTask(library, request, 5, {});
      const ranked = (result.rankedMatches ?? []).map((m) => `${m.score} ${m.skill}`);
      assert.equal(
        result.primarySkill,
        expected,
        `routed to ${result.primarySkill} instead.\n  ${ranked.join("\n  ")}`
      );
    });
  }
});
