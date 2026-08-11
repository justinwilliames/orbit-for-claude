/**
 * Project the server's tool safety classification into manifest.json.
 *
 * Why this exists: manifest.json is the artifact a Connectors Directory
 * reviewer reads, the install dialog renders, and any static analysis of
 * the .mcpb sees. It said nothing at all about which of Orbit's 121 tools
 * write to a production ESP, while the running server carried a full
 * annotations block on every one — so the two things a stranger can
 * inspect disagreed, and the drift guard, comparing names, could not see
 * it.
 *
 * ---- WHY NOT JUST WRITE THE ANNOTATIONS OBJECT -----------------------
 * Because the MCPB manifest schema forbids it. `tools[]` is
 * `additionalProperties: false` with exactly two allowed keys, `name` and
 * `description`, in v0.1 through v0.4 — an `annotations` key makes
 * `mcpb validate` fail on all 121 entries and produces a bundle the
 * packer rejects. The real MCP annotations live where the spec puts them:
 * on the tool as registered, which is what a reviewer's own tools/list
 * call returns. What the manifest gets is the same classification in the
 * one free-text field the schema allows.
 *
 * Only the tools that are NOT read-only are marked. The absence of a
 * marker is therefore load-bearing and generated, not an oversight — and
 * it keeps the install dialog from carrying 121 identical suffixes.
 *
 * Run it directly (`npm run sync:manifest`) or let the build do it —
 * tests/suites/26-manifest-drift.test.mjs fails if you skip both.
 *
 * Exit code 1 means the manifest was out of date and has been rewritten,
 * so a CI step can treat "had to change something" as a failure.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  REMOTE_WRITE,
  IRREVERSIBLE,
  LOCAL_WRITE,
  LOCAL_WRITE_NETWORKED,
} from "../server/tool-annotations.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(ROOT_DIR, "manifest.json");

/**
 * The marker for a tool, or null when it is read-only.
 *
 * Exported shape is a plain function so the drift test can compute the
 * expected string itself rather than pattern-matching prose.
 */
export function safetyMarkerFor(name) {
  if (REMOTE_WRITE.has(name)) {
    return IRREVERSIBLE.has(name)
      ? "[Safety: writes to a third-party system, and cannot be undone.]"
      : "[Safety: writes to a third-party system.]";
  }
  if (LOCAL_WRITE_NETWORKED.has(name)) {
    return "[Safety: sends data to a third-party API and writes files on this machine.]";
  }
  if (LOCAL_WRITE.has(name)) {
    return "[Safety: writes files in your local Orbit workspace.]";
  }
  return null;
}

/** Every marker this script can emit, for stripping a stale one. */
const ALL_MARKERS = [
  "[Safety: writes to a third-party system, and cannot be undone.]",
  "[Safety: writes to a third-party system.]",
  "[Safety: sends data to a third-party API and writes files on this machine.]",
  "[Safety: writes files in your local Orbit workspace.]",
];

function stripMarker(description) {
  let out = description ?? "";
  for (const marker of ALL_MARKERS) {
    out = out.split(` ${marker}`).join("").split(marker).join("");
  }
  return out.trimEnd();
}

// Running as a script rather than being imported by the test.
if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(raw);

  if (!Array.isArray(manifest.tools)) {
    process.stderr.write("manifest.json has no `tools` array.\n");
    process.exit(1);
  }

  let marked = 0;
  for (const tool of manifest.tools) {
    const base = stripMarker(tool.description);
    const marker = safetyMarkerFor(tool.name);
    if (marker) marked += 1;
    tool.description = marker ? `${base} ${marker}` : base;
  }

  // Two-space JSON with a trailing newline — matches what's checked in, so
  // a no-op run produces a zero-line diff rather than reformatting the file.
  const out = `${JSON.stringify(manifest, null, 2)}\n`;
  if (out !== raw) {
    fs.writeFileSync(MANIFEST_PATH, out);
    process.stdout.write(
      `manifest.json safety markers updated (${marked} of ${manifest.tools.length} tools are not read-only).\n`
    );
    process.exit(1);
  }

  process.stdout.write(
    `manifest.json safety markers already in sync (${marked} of ${manifest.tools.length} marked).\n`
  );
}
