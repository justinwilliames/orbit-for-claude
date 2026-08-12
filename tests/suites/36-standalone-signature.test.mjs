/**
 * The "Made with Orbit" row has to be VISIBLE, measured in a real engine.
 *
 * `orbitSignStandalone()` is the only code in either repo whose stated
 * purpose is organic distribution: a shared artifact is the one object Orbit
 * produces that reaches someone who does not have Orbit installed. It
 * appended its row to a <body> that every widget sets to
 * `height: 100vh; overflow: hidden`, with a `.wrap` also at 100vh — so the
 * row's top edge was the fold by construction, at every viewport height,
 * with zero scrollbar to hint at it. Measured at 1400x900 before the fix:
 * top 900, bottom 938, visible pixels 0.
 *
 * Nothing caught it because every assertion anyone would write is a
 * querySelector assertion, and the element was always there. The two
 * screenshots in docs/images are captures of these exact documents and the
 * string appears in neither. So this suite asks a browser where the row
 * actually IS — a rect assertion, not a querySelector assertion.
 *
 * Engine: system Chrome in headless mode, driven with --dump-dom. The page
 * measures itself and writes the rect onto <body> as a data attribute, which
 * --dump-dom then hands back. No new dependency for a repo whose problem is
 * distribution, not test infrastructure. Skips loudly when no Chrome is
 * installed rather than passing quietly.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { ORBIT_WIDGETS } from "../../server/ui/register.js";

/** Where a headless-capable Chrome might live, in order of preference. */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean);

const CHROME = CHROME_CANDIDATES.find((p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
});

const VIEWPORT = { width: 1400, height: 900 };

/**
 * The measurement the page runs on itself once laid out. Injected rather than
 * asserted from outside, because the numbers that matter (where the row sits
 * relative to the fold, and whether there is a scrollbar to reach it) only
 * exist after layout.
 */
const PROBE = `
<script>
(function () {
  var report = function () {
    var row = document.querySelector('.o-made-with');
    var doc = document.documentElement;
    var out = { found: !!row };
    if (row) {
      var r = row.getBoundingClientRect();
      out.top = Math.round(r.top);
      out.bottom = Math.round(r.bottom);
      out.height = Math.round(r.height);
      out.viewportH = window.innerHeight;
      out.visiblePx = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
      out.scrollbarPx = window.innerWidth - doc.clientWidth;
      out.maxScrollPx = Math.max(0, doc.scrollHeight - doc.clientHeight);
    }
    document.body.setAttribute('data-orbit-probe', JSON.stringify(out));
  };
  if (document.readyState === 'complete') report();
  else window.addEventListener('load', report);
})();
</script>`;

let tmpDir = null;

/** Render a widget's ARTIFACT document, load it in Chrome, return the probe. */
function measure(widget) {
  // render(null) is exactly the document the static ui:// resource carries,
  // and the artifact path bakes data into the same shell. Standalone is the
  // default: there is no host bridge in a file:// load, so orbitEmbedded is
  // false and the signature applies — the real shared-artifact case.
  const html = widget.render(null).replace("</body>", `${PROBE}</body>`);
  const file = path.join(tmpDir, `${path.basename(widget.uri)}`);
  fs.writeFileSync(file, html, "utf8");

  const dom = execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      "--virtual-time-budget=3000",
      "--dump-dom",
      `file://${file}`
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }
  );

  const match = /data-orbit-probe="([^"]*)"/.exec(dom);
  assert.ok(match, `the page never reported a measurement for ${widget.uri} — it may not have loaded`);
  const decoded = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return JSON.parse(decoded);
}

describe("Standalone artifacts show the row that carries the product name", { skip: CHROME ? false : "no Chrome found — set CHROME_PATH to run the rect assertions" }, () => {
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-signature-"));
  });

  after(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  for (const widget of ORBIT_WIDGETS) {
    test(`${widget.uri} — the signature row is inside the viewport`, () => {
      const probe = measure(widget);
      assert.ok(probe.found, `no .o-made-with element in ${widget.uri}`);

      // The assertion the finding turns on: WHERE it is, not THAT it is.
      assert.ok(
        probe.top < probe.viewportH,
        `signature row starts at ${probe.top}px in a ${probe.viewportH}px viewport — below the fold`
      );
      assert.equal(
        probe.bottom <= probe.viewportH,
        true,
        `signature row ends at ${probe.bottom}px in a ${probe.viewportH}px viewport — clipped`
      );
      // 1px of tolerance for subpixel layout, not one line of it.
      assert.ok(
        probe.visiblePx >= probe.height - 1,
        `only ${probe.visiblePx} of ${probe.height}px of the signature row is on screen`
      );

      // And it must not depend on the viewer scrolling: these documents set
      // body { overflow: hidden }, so there is no scrollbar to reach it with.
      if (probe.scrollbarPx === 0) {
        assert.equal(
          probe.maxScrollPx,
          0,
          `${probe.maxScrollPx}px of content sits below an unscrollable fold — nobody can reach it`
        );
      }
    });
  }
});
