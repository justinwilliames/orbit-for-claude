/**
 * A build must be reproducible from its own tag.
 *
 * scripts/build-extension.js shells out to scripts/fetch-guides.mjs
 * mid-build, which network-fetches the live guide library and overwrites
 * the tracked data/guides-export.json into the bundle. Sentinel found in
 * R1 that the shipped .mcpb therefore diverges by a sha256 from the tag
 * it was built at. Measured, the entire divergence was ONE field:
 *
 *     -  "exportedAt": "2026-08-31T07:28:35.145Z",
 *     +  "exportedAt": "2026-09-01T01:46:30.319Z",
 *
 * 99 guides in, 99 guides out, zero bodies changed, 26 bytes different.
 * Upstream stamps that clock when the origin regenerates the response,
 * and the endpoint carries `cache-control: s-maxage=86400`, so it ticks
 * about once a day on its own. The library's newest guide was dated
 * 2026-08-21 — eleven days older than the clock claiming to describe it.
 *
 * Two things follow, and the ORDER is the finding. A `git diff
 * --exit-code` reproducibility gate armed against this file today would
 * red on EVERY build, because every build moves the clock. Normalise
 * first; only then is a gate measuring anything real.
 *
 * This suite is the guard for the normalisation half. It cannot use the
 * live endpoint to prove it: two consecutive real fetches agree anyway,
 * because the edge cache serves both from one origin render. A guard
 * that passes for that reason has tested the CDN, not the script. So the
 * script is pointed at a local origin that re-stamps `exportedAt` on
 * every request — a day apart, compressed into a millisecond — which is
 * exactly the condition the real one fails under.
 *
 * The last test is the counterweight: normalisation must not become a
 * filter that hides real updates. A changed guide body must still move
 * the file, or the site-sync signal has been quietly deleted rather than
 * repaired.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = join(ROOT, "scripts", "fetch-guides.mjs");

/** A minimal payload in the real export's shape. */
function fixture(guides) {
  return {
    version: "1",
    // Re-stamped per request by the server below — this is the volatile
    // field under test, so the fixture must never hold it constant.
    exportedAt: null,
    count: guides.length,
    guides,
  };
}

const GUIDES = [
  {
    slug: "welcome-series",
    title: "Welcome series",
    summary: "First ninety days.",
    category: "lifecycle",
    date: "20 Apr 2026",
    isoDate: "2026-04-20",
    readingMinutes: 7,
    primarySkill: "onboarding",
    secondarySkills: [],
    targetQuery: "welcome series",
    canonicalUrl: "https://yourorbit.team/guides/welcome-series",
    markdown: "# Welcome series\n\nBody.\n",
  },
  {
    slug: "winback",
    title: "Win-back",
    summary: "Lapsed reactivation.",
    category: "lifecycle",
    date: "21 Aug 2026",
    isoDate: "2026-08-21",
    readingMinutes: 5,
    primarySkill: "retention",
    secondarySkills: ["segmentation"],
    targetQuery: "winback email",
    canonicalUrl: "https://yourorbit.team/guides/winback",
    markdown: "# Win-back\n\nBody.\n",
  },
];

/**
 * Serve the fixture with a FRESH `exportedAt` on every single request,
 * the way the origin does once its edge cache expires.
 */
async function startOrigin(guides) {
  let hits = 0;
  const server = createServer((req, res) => {
    hits += 1;
    const body = fixture(guides);
    // Distinct per request, and deliberately far from the guide dates.
    body.exportedAt = new Date(Date.now() + hits * 86_400_000).toISOString();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/api/guides/export`,
    hits: () => hits,
    close: () =>
      new Promise((resolve) => {
        // Undici keeps connections alive; close() alone would never resolve.
        server.closeAllConnections?.();
        server.close(resolve);
      }),
  };
}

const run = promisify(execFile);

/**
 * Run the real script against a throwaway target and return the bytes.
 *
 * Must be async: the origin above lives in THIS process, so a blocking
 * spawnSync would hold the event loop and the child's request would
 * never be served — a deadlock that looks exactly like a hung test.
 */
async function fetchInto(url, target) {
  const { stdout, stderr } = await run(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 20_000,
    env: {
      ...process.env,
      ORBIT_GUIDES_URL: url,
      ORBIT_GUIDES_TARGET: target,
      ORBIT_GUIDES_SKIP: "",
    },
  });
  assert.match(
    stdout,
    /\[fetch-guides] OK/,
    `fetch-guides.mjs did not write a snapshot\n${stdout}\n${stderr}`
  );
  return fs.readFileSync(target, "utf8");
}

describe("build reproducibility — the guides snapshot", () => {
  test("two fetches of unchanged content produce an identical file", async () => {
    const origin = await startOrigin(GUIDES);
    const dir = fs.mkdtempSync(join(os.tmpdir(), "orbit-guides-"));
    try {
      const first = await fetchInto(origin.url, join(dir, "a.json"));
      const second = await fetchInto(origin.url, join(dir, "b.json"));

      assert.equal(
        origin.hits(),
        2,
        "both runs must actually hit the origin — a skipped fetch proves nothing"
      );
      assert.equal(
        second,
        first,
        "the origin re-stamped its clock between these two fetches and the " +
          "snapshot changed with it — every build would move the sha256"
      );
    } finally {
      await origin.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the fetch clock never reaches the file", async () => {
    const origin = await startOrigin(GUIDES);
    const dir = fs.mkdtempSync(join(os.tmpdir(), "orbit-guides-"));
    try {
      const written = JSON.parse(await fetchInto(origin.url, join(dir, "a.json")));

      // exportedAt is now the newest guide in the library, not a clock.
      assert.equal(written.exportedAt, "2026-08-21");
      assert.equal(
        written.contentHash.length,
        64,
        "content identity must be a sha256 the site-sync row can read"
      );

      // Nothing anywhere in the file may carry today's date, which is
      // what a leaked wall clock would look like.
      const today = new Date().toISOString().slice(0, 10);
      assert.ok(
        !JSON.stringify(written).includes(today),
        `a wall clock leaked into the snapshot (found ${today})`
      );
    } finally {
      await origin.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a real content change still moves the file and the hash", async () => {
    const before = await startOrigin(GUIDES);
    const dir = fs.mkdtempSync(join(os.tmpdir(), "orbit-guides-"));
    try {
      const original = JSON.parse(await fetchInto(before.url, join(dir, "a.json")));
      await before.close();

      // One guide body edited upstream — a legitimate site update.
      const edited = structuredClone(GUIDES);
      edited[1].markdown = "# Win-back\n\nRewritten body.\n";
      const after = await startOrigin(edited);
      try {
        const updated = JSON.parse(await fetchInto(after.url, join(dir, "b.json")));
        assert.notEqual(
          updated.contentHash,
          original.contentHash,
          "normalisation has become a filter that hides real site updates"
        );
      } finally {
        await after.close();
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
