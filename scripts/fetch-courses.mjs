#!/usr/bin/env node
/**
 * Fetch the Orbit courses export and snapshot it into data/ so the
 * .mcpb can bundle the course catalogue as MCP resources.
 *
 * Source of truth: https://get.yourorbit.team/api/courses/export
 * Target:          data/courses-export.json
 *
 * Runs as a build step before build-extension.js — packaged mcpb's
 * ship the current course catalogue alongside the guides library. If
 * the fetch fails (site down, offline, endpoint unavailable), the
 * script preserves the existing snapshot. Ship-ability of the mcpb
 * always wins over having the absolute-latest course list.
 *
 * Run manually: `node scripts/fetch-courses.mjs`
 * Build wiring: invoked from scripts/build-extension.js.
 *
 * Environment:
 *   ORBIT_COURSES_URL     override source URL (for staging tests)
 *   ORBIT_COURSES_SKIP=1  skip fetch, keep existing snapshot
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const TARGET_PATH = path.join(ROOT_DIR, "data", "courses-export.json");
const DEFAULT_URL = "https://get.yourorbit.team/api/courses/export";

async function main() {
  if (process.env.ORBIT_COURSES_SKIP === "1") {
    console.log(
      "[fetch-courses] ORBIT_COURSES_SKIP=1 — keeping existing snapshot.",
    );
    return;
  }

  const url = process.env.ORBIT_COURSES_URL ?? DEFAULT_URL;
  console.log(`[fetch-courses] Fetching ${url}`);

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const payload = await res.json();

    if (!payload || typeof payload !== "object") {
      throw new Error("Response was not a JSON object");
    }
    if (typeof payload.version !== "string") {
      throw new Error("Missing `version` — not a courses export");
    }
    if (!Array.isArray(payload.courses)) {
      throw new Error("Missing `courses` array");
    }
    if (payload.courses.length === 0) {
      throw new Error("Courses array is empty — refusing to overwrite");
    }

    fs.mkdirSync(path.dirname(TARGET_PATH), { recursive: true });
    fs.writeFileSync(TARGET_PATH, JSON.stringify(payload, null, 2) + "\n");
    console.log(
      `[fetch-courses] OK — ${payload.courses.length} courses written to ${path.relative(ROOT_DIR, TARGET_PATH)}`,
    );
  } catch (err) {
    const existing = fs.existsSync(TARGET_PATH);
    if (existing) {
      console.warn(
        `[fetch-courses] FAILED (${err?.message ?? err}) — keeping existing snapshot.`,
      );
    } else {
      console.error(
        `[fetch-courses] FAILED and no existing snapshot — cannot continue.\n${err?.stack ?? err}`,
      );
      process.exit(1);
    }
  }
}

await main();
