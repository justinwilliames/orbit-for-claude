#!/usr/bin/env node
/**
 * Fetch the Orbit guides export and snapshot it into data/ so the .mcpb
 * can bundle the content as MCP resources.
 *
 * Source of truth: https://get.yourorbit.team/api/guides/export
 * Target:          data/guides-export.json
 *
 * Runs as a build step before build-extension.js so packaged mcpb's
 * always ship the most recent guide library. If the fetch fails (site
 * down, offline, endpoint removed), the script preserves the existing
 * snapshot — the build continues with whatever content was last good.
 * This is intentional: deliverability of the mcpb takes precedence
 * over having the absolute latest guides.
 *
 * Run manually: `node scripts/fetch-guides.mjs`
 * Build wiring: invoked from scripts/build-extension.js.
 *
 * The snapshot is NORMALISED before it is written. Upstream stamps every
 * response with `exportedAt`, the wall clock at the moment the origin
 * regenerated the page — and the endpoint is edge-cached with
 * `s-maxage=86400`, so that clock moves about once a day whether or not
 * a single guide changed. Writing it through made `git diff data/` mean
 * "a build ran", which is worthless: it fires on every build and would
 * red any `--exit-code` reproducibility gate placed after it. Worse, it
 * was the reason the shipped .mcpb diverged by a sha256 from the tag it
 * was built at (99 guides in, 99 guides out, 26 bytes different).
 *
 * So the clock is replaced by content-derived identity:
 *   exportedAt   the newest `isoDate` across the guides — what the
 *                library actually contains, not when we asked for it.
 *                Consumers already treat this as an opaque label
 *                (server/guides.js, the startup banner in index.js).
 *   contentHash  sha256 over the guides array exactly as written, so
 *                "did the library change?" is one line, not a 1.3 MB diff.
 *
 * Net effect: `git diff data/guides-export.json` is now the site-sync
 * outcome row. Clean means the site didn't move. Dirty means it did.
 *
 * Environment:
 *   ORBIT_GUIDES_URL       override source URL (for staging tests)
 *   ORBIT_GUIDES_SKIP=1    skip fetch, keep existing snapshot
 *   ORBIT_GUIDES_TARGET    override the snapshot path (used by tests so
 *                          they never write over the tracked file)
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const TARGET_PATH =
  process.env.ORBIT_GUIDES_TARGET ??
  path.join(ROOT_DIR, "data", "guides-export.json");
const DEFAULT_URL = "https://get.yourorbit.team/api/guides/export";

/**
 * Strip the volatile fetch clock and replace it with identity derived
 * from the content itself, so two fetches of unchanged guides produce
 * byte-identical files.
 *
 * Unknown top-level keys are carried through rather than dropped — if
 * upstream grows a field we want to see it in the diff, not lose it
 * silently. They are placed before `guides` so the whole scalar header
 * stays readable at the top of a 1.3 MB file.
 */
function normalise(payload) {
  const { version, exportedAt: _fetchClock, count, guides, ...extra } = payload;

  // Guides as written, so the hash and the file can never disagree.
  const contentHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(guides))
    .digest("hex");

  // Newest guide date in the library. Date-only strings ("2026-08-21")
  // sort lexicographically, which is why this needs no Date parsing.
  const dates = guides.map((g) => g.isoDate).filter((d) => typeof d === "string");
  const newest = dates.length ? dates.slice().sort().at(-1) : null;

  return { version, exportedAt: newest, count, contentHash, ...extra, guides };
}

async function main() {
  if (process.env.ORBIT_GUIDES_SKIP === "1") {
    console.log("[fetch-guides] ORBIT_GUIDES_SKIP=1 — keeping existing snapshot.");
    return;
  }

  const url = process.env.ORBIT_GUIDES_URL ?? DEFAULT_URL;
  console.log(`[fetch-guides] Fetching ${url}`);

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      // 30s timeout — enough for a cold Vercel invocation, not so long
      // that a stuck build hangs forever.
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const payload = await res.json();

    // Basic shape validation — catches the case where we fetched
    // something that parsed as JSON but isn't the export format.
    if (!payload || typeof payload !== "object") {
      throw new Error("Response was not a JSON object");
    }
    if (typeof payload.version !== "string") {
      throw new Error("Missing `version` — not a guides export");
    }
    if (!Array.isArray(payload.guides)) {
      throw new Error("Missing `guides` array");
    }
    if (payload.guides.length === 0) {
      throw new Error("Guides array is empty — refusing to overwrite");
    }

    // Normalise away the fetch clock BEFORE writing — see the header.
    const snapshot = normalise(payload);

    // Write with consistent 2-space indent for diff review in git.
    fs.mkdirSync(path.dirname(TARGET_PATH), { recursive: true });
    fs.writeFileSync(TARGET_PATH, JSON.stringify(snapshot, null, 2) + "\n");
    console.log(
      `[fetch-guides] OK — ${snapshot.guides.length} guides written to ${path.relative(ROOT_DIR, TARGET_PATH)} (content ${snapshot.contentHash.slice(0, 12)}, newest ${snapshot.exportedAt})`
    );
  } catch (err) {
    const existing = fs.existsSync(TARGET_PATH);
    if (existing) {
      console.warn(
        `[fetch-guides] FAILED (${err?.message ?? err}) — keeping existing snapshot.`
      );
      // Not fatal — the build proceeds with the last good snapshot.
    } else {
      console.error(
        `[fetch-guides] FAILED and no existing snapshot — cannot continue.\n${err?.stack ?? err}`
      );
      process.exit(1);
    }
  }
}

await main();
