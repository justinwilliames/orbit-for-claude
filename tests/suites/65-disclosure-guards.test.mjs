/**
 * Disclosure guards — the shipped claim has to match the shipped behaviour.
 *
 * Written after the 31 Aug 2026 team review, which found the product making
 * two affirmative statements its code contradicted. These are the guards for
 * that class of defect, and they are deliberately separate rows of work from
 * the fixes they protect: on the prior cycle's plan every guard that rode
 * along with a fix shipped its demoable half and lost the other.
 *
 * Guard 1 — no telemetry call site may pass free-form user text.
 *   `manifest.json` tells an installer: "Never sends prompts, queries, tool
 *   arguments". `server/index.js` used to call trackFriction with
 *   `detail: request` — the user's typed input to orbit_route_task. The
 *   redactor strips identifiers, not content, so a question about the user's
 *   own campaign travelled intact. This asserts no call site reintroduces it.
 *
 * Guard 2 — orbit_gdpr_consent_audit cannot issue a false consent pass.
 *   `kind` was typed z.string(), so passing "signup" — the word the tool's
 *   own description uses — was silently accepted while the two rules gated on
 *   kind === "signup_page" never ran. A form with no marketing checkbox came
 *   back with passes and no finding. A wrong count embarrasses us; a false
 *   consent pass is what a customer relies on.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("Guard 1 — no telemetry call site carries free user text", () => {
  test("no trackFriction call site passes a `detail` argument", () => {
    const files = fs
      .readdirSync(path.join(ROOT, "server"))
      .filter((f) => f.endsWith(".js"))
      .map((f) => path.join(ROOT, "server", f));

    const offenders = [];
    for (const file of files) {
      // telemetry.js owns the declaration and the internal errorClass caller;
      // it is allowed to name the parameter. Everyone else is a call site.
      if (path.basename(file) === "telemetry.js") continue;
      const src = fs.readFileSync(file, "utf8");
      const re = /trackFriction\s*\(\s*\{[^}]*\bdetail\s*:/g;
      let m;
      while ((m = re.exec(src)) !== null) {
        const line = src.slice(0, m.index).split("\n").length;
        offenders.push(`${path.relative(ROOT, file)}:${line}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `A telemetry call site is passing free-form user text as \`detail\`. manifest.json promises the ` +
        `installer that Orbit never sends prompts, queries or tool arguments. Either remove the argument ` +
        `or change the disclosure — they cannot both stand. Offenders: ${offenders.join(", ")}`
    );
  });

  test("the manifest still makes the promise this guard protects", () => {
    // If someone deletes the claim instead of the behaviour, this test should
    // start failing rather than silently guarding nothing.
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
    const blob = JSON.stringify(manifest);
    assert.match(
      blob,
      /Never sends prompts, queries, tool arguments/,
      "manifest.json no longer makes the no-queries promise. If that was deliberate, this guard needs rewriting, not deleting."
    );
  });

  test("the shipped bundle carries the telemetry disclosure", () => {
    const copyPaths = fs.readFileSync(path.join(ROOT, "scripts/build-extension.js"), "utf8");
    assert.match(
      copyPaths,
      /"PRIVACY\.md"/,
      "PRIVACY.md is not in build-extension.js COPY_PATHS. The root PRIVACY.md is the only document " +
        "disclosing the telemetry POST, the clientId and the opt-out. A notice that does not ship has not been given."
    );
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
    assert.ok(
      Array.isArray(manifest.privacy_policies) && manifest.privacy_policies.length > 0,
      "manifest.privacy_policies is empty. The installer has no in-product route to the policy."
    );
  });
});

describe("Guard 2 — the consent auditor cannot issue a false pass", () => {
  test("a signup page with NO marketing checkbox never returns a consent pass", async () => {
    const { auditGdprConsent } = await import("../../server/lifecycle-helpers.js");

    const noCheckbox = `
      <form action="/subscribe">
        <label>Email</label><input type="email" name="email" />
        <button type="submit">Sign up</button>
        <p>We'll email you. <a href="/privacy">Privacy policy</a>. Unsubscribe any time.</p>
        <p>Orbit Pty Ltd, 1 Example St, Brisbane QLD 4000</p>
      </form>`;

    const result = auditGdprConsent({ html: noCheckbox, kind: "signup_page" });
    const passRules = (result.passes ?? []).map((p) => p.rule);

    assert.ok(
      !passRules.includes("consent_checkbox"),
      `auditGdprConsent passed \`consent_checkbox\` on a form that has no checkbox at all. Passes: ${passRules.join(", ")}`
    );
  });

  test("an unknown `kind` is rejected, not silently accepted", async () => {
    // The defect: kind was z.string(), so "signup" (the word the tool's own
    // description uses) was accepted and the two rules gated on the exact
    // string "signup_page" silently never ran. The schema now enumerates.
    const src = fs.readFileSync(path.join(ROOT, "server/index.js"), "utf8");
    const block = src.slice(src.indexOf("orbit_gdpr_consent_audit"));
    const kindDecl = block.slice(0, block.indexOf("async ({"));

    assert.match(
      kindDecl,
      /kind:\s*z\s*[\s\S]{0,200}?\.enum\(/,
      "orbit_gdpr_consent_audit's `kind` is not a z.enum(). As a free string, a near-miss value is " +
        "accepted and silently disables consent_checkbox and double_opt_in, which is how a form with " +
        "no marketing checkbox returned two passes."
    );
    assert.match(kindDecl, /"signup_page"/, "the enum must still admit signup_page");
    assert.match(kindDecl, /"email_footer"/, "the enum must still admit email_footer");
    assert.match(kindDecl, /"preference_centre"/, "the enum must still admit preference_centre");
  });
});

describe("Guard 3 — a check that holds an opinion must state its reason", () => {
  test("copy_generation never reports blocked with an empty blocking_issues", async () => {
    const os = await import("node:os");
    const { checkSetup, validateBrandKit } = await import("../../server/setup-validator.js");
    const { BRAND_GUIDELINE_SECTIONS } = await import("../../server/brand-kit.js");

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-guard-"));
    const kit = path.join(root, "brand-kit");
    const lib = path.join(root, "library");
    fs.mkdirSync(path.join(kit, "logos"), { recursive: true });
    fs.mkdirSync(path.join(kit, "examples"), { recursive: true });
    fs.mkdirSync(lib, { recursive: true });
    const config = { rootDir: root, brandKitDir: kit, libraryDir: lib, outputsDir: path.join(root, "outputs") };

    // `validateBrandKit` reports operational_status "full" only when nothing is
    // in `missing` AND brand-guidelines.md exists AND no guideline section is
    // still placeholder text. These two helpers build a kit that clears
    // `missing` (brand_name, a real primary logo file, two real example asset
    // files, colors, fonts) and guidelines whose sections we control, so the
    // fixture can sit either side of "full" deliberately. "Open Questions /
    // TBD" is exempt from the placeholder scan, so it is left blank in both.
    const writeCompleteProfile = () => {
      fs.writeFileSync(path.join(kit, "logos", "logo.png"), "logo");
      fs.writeFileSync(path.join(kit, "examples", "one.png"), "one");
      fs.writeFileSync(path.join(kit, "examples", "two.png"), "two");
      fs.writeFileSync(
        path.join(kit, "brand-profile.json"),
        JSON.stringify({
          brand_name: "Guardrail Co",
          primary_logo: "logos/logo.png",
          colors: { primary: "#101820" },
          example_assets: ["examples/one.png", "examples/two.png"],
          fonts: ["Inter"]
        })
      );
    };
    // Built from BRAND_GUIDELINE_SECTIONS rather than a literal so the fixture
    // cannot silently drift out of "full" when a section is added or renamed.
    const writeGuidelines = (body) =>
      fs.writeFileSync(
        path.join(kit, "brand-guidelines.md"),
        `# Guardrail Co\n\n${BRAND_GUIDELINE_SECTIONS.map(
          (title) => `## ${title}\n${title === "Open Questions / TBD" ? "" : body(title)}\n`
        ).join("\n")}`
      );

    const states = [
      // No profile, no guidelines: several blockers, plainly blocked.
      ["empty kit", () => {}, { expect_blocked: true }],
      // Guidelines and tone present, profile still missing.
      [
        "guidelines and tone present but no brand profile",
        () => writeGuidelines(() => "Real content."),
        { expect_blocked: true }
      ],
      // THE ORIGINAL DEFECT STATE. guidelines_path truthy, tone_of_voice
      // defined, operational_status !== "full" (one section still placeholder).
      // Both of the array's original conditions are satisfied here, so the
      // pre-fix array came back EMPTY while status said "needs_setup".
      [
        "complete profile, tone defined, one guideline section still placeholder",
        () => {
          writeCompleteProfile();
          writeGuidelines((title) => (title === "Approved References" ? "TBD - not supplied yet." : "Real content."));
        },
        { expect_blocked: true, expect_operational_status: "profile_only" }
      ],
      // The state Guard 3 could never previously reach: a genuinely clean kit,
      // where blocking_issues is empty. Without this the invariant below is
      // unfalsifiable — its left conjunct is never true.
      [
        "fully operational kit",
        () => writeGuidelines(() => "Real content."),
        { expect_clear: true, expect_operational_status: "full" }
      ]
    ];

    let reachedEmptyBlockingIssues = false;

    for (const [label, mutate, expectation] of states) {
      mutate();
      const brandKit = validateBrandKit({ config, rootDir: root, brandKitDir: kit });
      const readiness = checkSetup({
        config,
        rootDir: root,
        brandKitDir: kit,
        requestedFeatures: ["copy_generation"]
      }).feature_readiness.copy_generation;

      if (readiness.blocking_issues.length === 0) reachedEmptyBlockingIssues = true;

      // The fixture has to actually land where it claims, or the assertions
      // below are testing a state nobody designed.
      if (expectation.expect_operational_status) {
        assert.equal(
          brandKit.operational_status,
          expectation.expect_operational_status,
          `Fixture drift: "${label}" was built to produce operational_status ` +
            `"${expectation.expect_operational_status}" but validateBrandKit returned ` +
            `"${brandKit.operational_status}" (missing: ${JSON.stringify(brandKit.missing)}). Fix the ` +
            `fixture — the guard below is only meaningful on the state it was written for.`
        );
      }

      // THE INVARIANT. Status and blocking_issues derive from one source, so
      // they cannot disagree. A model reads this on turn one of nearly every
      // session; being told it is blocked with nothing to fix is worse than no
      // check at all, because the check is trusted.
      assert.ok(
        !(readiness.status === "needs_setup" && readiness.blocking_issues.length === 0),
        `copy_generation reported "${readiness.status}" with an empty blocking_issues array (${label}). ` +
          `Status must derive from the array so the two cannot disagree — a model reads this on turn one ` +
          `of nearly every session and is told it is blocked with nothing to fix.`
      );

      // The other half of the same contract: a stated reason must produce a
      // blocked status, and a blocked status must carry at least one reason.
      if (expectation.expect_blocked) {
        assert.equal(
          readiness.status,
          "needs_setup",
          `copy_generation reported "${readiness.status}" for a kit that is not ready (${label}). ` +
            `Blockers: ${JSON.stringify(readiness.blocking_issues)}`
        );
        assert.ok(
          readiness.blocking_issues.length > 0,
          `copy_generation blocked "${label}" without naming a reason. On the original defect this exact ` +
            `state — guidelines present, tone defined, kit not fully operational — returned an empty array.`
        );
      }
      if (expectation.expect_clear) {
        assert.equal(
          readiness.blocking_issues.length,
          0,
          `A fully operational brand kit still carries blockers (${label}): ` +
            `${JSON.stringify(readiness.blocking_issues)}`
        );
        assert.notEqual(
          readiness.status,
          "needs_setup",
          `copy_generation reported "needs_setup" on a fully operational brand kit (${label}) with an ` +
            `empty blocking_issues array. This is the exact contradiction Guard 3 exists to catch.`
        );
      }
    }

    fs.rmSync(root, { recursive: true, force: true });

    // ANTI-VACUITY. The invariant above is `!(needs_setup && empty)`. If no
    // fixture ever produces an empty blocking_issues array, its left conjunct
    // is unreachable and the assertion passes no matter what the code does —
    // which is exactly what this guard did when it shipped: the derivation
    // could be replaced with a hardcoded value and the suite stayed green.
    // A guard nobody has watched fail is a badge, not a check.
    assert.ok(
      reachedEmptyBlockingIssues,
      "No Guard 3 fixture reached blocking_issues.length === 0, so the invariant above never had a case " +
        "to judge and this test proves nothing. Restore a fixture state that produces a fully operational " +
        "brand kit before trusting this suite."
    );
  });
});

describe("Guard 4 — no shipped surface advertises a capability the code lacks", () => {
  // Nebula's R5b caveat. `orbit_score_subject_line` advertised "content-emptiness"
  // detection; the implementation was 21 literal regexes at server/calculators.js:54,
  // and it scored the README's best line and two deliberately generic lines
  // identically at 96/sharp. The claim was removed from server/index.js in 0.33.0 —
  // and survived in manifest.json, because the fix checked one surface and the
  // product ships two. tests/suites/26-manifest-drift.test.mjs compares tool names,
  // versions and the product blurb, but never per-tool description text, so nothing
  // caught it. This is that check.
  //
  // Add a term here when a tool description makes a claim the code does not yet
  // honour, and delete it when the capability actually lands.
  const UNBACKED_CLAIMS = [
    {
      term: "content-emptiness",
      why:
        "orbit_score_subject_line has no content-emptiness check — server/calculators.js runs literal " +
        "regexes. server/slop-detector.js is the real instrument and is pointed at Orbit's own output, " +
        "not the user's. Tracked as issue #17; until it is wired, no surface may claim it."
    }
  ];

  const SURFACES = ["manifest.json", "server/index.js", "README.md"];

  for (const { term, why } of UNBACKED_CLAIMS) {
    test(`no shipped surface claims "${term}"`, () => {
      const offenders = SURFACES.filter((rel) => {
        const p = path.join(ROOT, rel);
        return fs.existsSync(p) && fs.readFileSync(p, "utf8").includes(term);
      });

      assert.deepEqual(
        offenders,
        [],
        `"${term}" is advertised in: ${offenders.join(", ")}. ${why}`
      );
    });
  }
});
