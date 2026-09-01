/**
 * orbit_dark_mode_check was structurally blind to <img> elements.
 *
 * `img` sits in html-checks.js's SELF_CLOSING_TAGS set, and every walk
 * checkDarkModeRisk runs (collectFgBgPairs, collectBareWhiteText) hits
 * that set and `continue`s straight past it. Run against a real Orbit
 * header composite — the actual `getOrbitLogoDataUri` logo <img> from
 * server/orbit-branding.js, sitting on a plain #ffffff panel with no
 * dark-mode CSS at all — the check measured the two text/background
 * colour pairs around it, found nothing wrong with them, and returned
 * "pass" with invert_risk_count: 0. It never looked at the image tag.
 *
 * The fix cannot decide whether an arbitrary PNG's pixels survive
 * inversion — that needs a rendered client, not markup. What it CAN
 * decide, and now does: whether an <img> sits on a resolvable ground
 * that a full-invert dark-mode client would flip, with no declared
 * adaptation (a <picture> dark-mode <source>, or a data-ogsc/data-ogsb
 * hook). That is a warn with a named reason, not a guessed verdict —
 * and where the background itself can't be resolved, that is reported
 * as not-measured rather than silently dropped.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { checkDarkModeRisk } from "../../server/html-checks.js";
import { getOrbitLogoDataUri, getOrbitBrandingMeta } from "../../server/orbit-branding.js";

describe("checkDarkModeRisk — image blindness", () => {
  test("a real Orbit header logo <img> on a light, un-adapted ground is not a silent pass", () => {
    // The actual production logo asset and attribution copy, not a
    // stand-in — this is the exact shape of the composite that shipped
    // a false "pass".
    const logoUri = getOrbitLogoDataUri({ rootDir: process.cwd(), theme: "light" });
    const meta = getOrbitBrandingMeta();
    const html = `<!doctype html><html lang="en"><body>
      <div class="orbit-meta" style="background:#ffffff">
        <img class="orbit-logo" src="${logoUri}" alt="Orbit" width="28" height="28" />
        <div class="orbit-copy">
          <strong style="color:#171717">${meta.attribution}</strong>
          <span style="color:#171717">${meta.tagline}</span>
        </div>
      </div>
    </body></html>`;

    const result = checkDarkModeRisk({ html });

    // The text pairs either side of the image are fine on their own —
    // the point of this fixture is that they used to be the WHOLE
    // story. If the text pairs stop resolving this assertion is
    // pointless, so pin them down too.
    assert.equal(result.colour_pairs_measured, 2, "the two text/bg pairs around the image must still resolve");
    assert.equal(result.invert_risk_count, 0, "the text pairs themselves are not the defect");

    assert.equal(
      result.image_invert_risk_count,
      1,
      "the bare logo <img> on an un-adapted light ground must be counted"
    );
    assert.notEqual(result.verdict, "pass", 'an image with no dark-mode adaptation cannot clear as "pass"');
    const imgFinding = result.findings.find((f) => f.kind === "image_invert_risk");
    assert.ok(imgFinding, "must produce a finding for the image, not just bump a counter");
    assert.equal(imgFinding.bg, "#ffffff");
  });

  test("a bare <img> on any resolvable, non-dark ground is flagged — the general guard", () => {
    const html = `<html lang="en"><body>
      <table role="presentation"><tr><td style="background-color:#f5f5f5">
        <img src="hero.png" alt="Hero" />
      </td></tr></table>
    </body></html>`;
    const result = checkDarkModeRisk({ html });
    assert.equal(result.image_invert_risk_count, 1);
    assert.notEqual(result.verdict, "pass");
  });

  test("a <picture> with a prefers-color-scheme:dark <source> is a properly handled image — no finding", () => {
    const html = `<html lang="en"><body>
      <table role="presentation"><tr><td style="background-color:#f5f5f5">
        <picture>
          <source srcset="hero-dark.png" media="(prefers-color-scheme: dark)" />
          <img src="hero-light.png" alt="Hero" />
        </picture>
      </td></tr></table>
    </body></html>`;
    const result = checkDarkModeRisk({ html });
    assert.equal(result.image_invert_risk_count, 0, "a declared dark-mode source variant must clear the image");
    assert.equal(
      result.findings.some((f) => f.kind === "image_invert_risk"),
      false
    );
  });

  test("a data-ogsc dark-mode hook on the <img> itself is a properly handled image — no finding", () => {
    const html = `<html lang="en"><body>
      <table role="presentation"><tr><td style="background-color:#f5f5f5">
        <img src="hero.png" alt="Hero" data-ogsc="hero-dark.png" />
      </td></tr></table>
    </body></html>`;
    const result = checkDarkModeRisk({ html });
    assert.equal(result.image_invert_risk_count, 0);
  });

  test("an image whose background cannot be resolved is not-measured, not a silent drop and not a guessed risk", () => {
    const html = `<html lang="en"><body>
      <div><img src="hero.png" alt="Hero" /></div>
    </body></html>`;
    const result = checkDarkModeRisk({ html });
    assert.equal(result.image_invert_risk_count, 0, "unresolvable ground must not be scored as a confirmed risk");
    assert.ok(
      result.warnings.some((w) => w.kind === "image_dark_mode_not_measured"),
      "the abstention must be reported by name, not silently dropped"
    );
  });

  test("an image already on a dark ground is not flagged (nothing inverts into a clash there)", () => {
    const html = `<html lang="en"><body>
      <table role="presentation"><tr><td style="background-color:#111111">
        <img src="hero.png" alt="Hero" />
      </td></tr></table>
    </body></html>`;
    const result = checkDarkModeRisk({ html });
    assert.equal(result.image_invert_risk_count, 0);
  });
});
