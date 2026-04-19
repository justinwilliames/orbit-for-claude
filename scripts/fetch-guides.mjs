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
 * Environment:
 *   ORBIT_GUIDES_URL       override source URL (for staging tests)
 *   ORBIT_GUIDES_SKIP=1    skip fetch, keep existing snapshot
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const TARGET_PATH = path.join(ROOT_DIR, "data", "guides-export.json");
const DEFAULT_URL = "https://get.yourorbit.team/api/guides/export";

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

    // Write with consistent 2-space indent for diff review in git.
    fs.mkdirSync(path.dirname(TARGET_PATH), { recursive: true });
    fs.writeFileSync(TARGET_PATH, JSON.stringify(payload, null, 2) + "\n");
    console.log(
      `[fetch-guides] OK — ${payload.guides.length} guides written to ${path.relative(ROOT_DIR, TARGET_PATH)}`
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
