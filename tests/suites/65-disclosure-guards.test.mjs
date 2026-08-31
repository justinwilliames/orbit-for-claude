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
    const { checkSetup } = await import("../../server/setup-validator.js");

    const root = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-guard-"));
    const kit = path.join(root, "brand-kit");
    const lib = path.join(root, "library");
    fs.mkdirSync(kit, { recursive: true });
    fs.mkdirSync(lib, { recursive: true });
    const config = { rootDir: root, brandKitDir: kit, libraryDir: lib, outputsDir: path.join(root, "outputs") };

    const states = [
      ["empty kit", () => {}],
      [
        "guidelines and tone present but kit not fully operational",
        () =>
          fs.writeFileSync(
            path.join(kit, "brand-guidelines.md"),
            "# Brand\n\n## Tone Of Voice\nWarm, direct.\n"
          )
      ]
    ];

    for (const [label, mutate] of states) {
      mutate();
      const readiness = checkSetup({
        config,
        rootDir: root,
        brandKitDir: kit,
        requestedFeatures: ["copy_generation"]
      }).feature_readiness.copy_generation;

      assert.ok(
        !(readiness.status === "needs_setup" && readiness.blocking_issues.length === 0),
        `copy_generation reported "${readiness.status}" with an empty blocking_issues array (${label}). ` +
          `Status must derive from the array so the two cannot disagree — a model reads this on turn one ` +
          `of nearly every session and is told it is blocked with nothing to fix.`
      );
    }

    fs.rmSync(root, { recursive: true, force: true });
  });
});
