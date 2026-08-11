/**
 * Status-vocabulary drift guard.
 *
 * The telemetry classifier decides "did this tool call do the thing"
 * from the shaped `status` a handler returns. That classifier used to be
 * a ten-entry allowlist maintained by hand against a vocabulary of
 * seventy-odd, and everything it hadn't heard of counted as a success —
 * including `push_not_configured` and `needs_plugin_credentials`, the two
 * most common ways a fresh install refuses to work. The list decayed
 * every time someone invented a status, and nothing caught it.
 *
 * So: don't ship a list, ship the guard. This greps every status literal
 * out of server/ and fails if one isn't classified into exactly one of
 * delivered / prompted / failed. Adding a status now means deciding what
 * it means, in the same commit.
 *
 * Same shape as the manifest-drift guard (26) — extract from the source
 * of truth, diff against the declaration, name the offenders.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DELIVERED_STATUSES,
  PROMPTED_STATUSES,
  FAILED_STATUSES,
  INDIRECT_STATUSES,
  ALL_STATUSES,
  isFailureStatus,
} from "../../server/status-vocabulary.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.resolve(TEST_DIR, "..", "..", "server");
const VOCAB_FILE = path.join(SERVER_DIR, "status-vocabulary.js");

/**
 * Both the ways a handler sets a status: the literal in the returned
 * object, and the `let status; ... status = "ahead"` form used where the
 * value is computed before the return.
 */
const STATUS_PATTERNS = [
  /\bstatus:\s*"([a-z0-9_]+)"/g,
  /\bstatus\s*=\s*"([a-z0-9_]+)"/g,
];

/** Every `status` literal in server/, mapped to the files that emit it. */
function collectStatusLiterals() {
  const found = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!full.endsWith(".js")) continue;
      // The vocabulary file declares the sets; it doesn't emit them.
      if (full === VOCAB_FILE) continue;
      const src = fs.readFileSync(full, "utf8");
      for (const re of STATUS_PATTERNS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(src)) !== null) {
          if (!found.has(m[1])) found.set(m[1], new Set());
          found.get(m[1]).add(path.relative(SERVER_DIR, full));
        }
      }
    }
  };
  walk(SERVER_DIR);
  return found;
}

describe("Status vocabulary — every status the server emits is classified", () => {
  test("no status literal in server/ is unclassified", () => {
    const found = collectStatusLiterals();
    const unclassified = [...found.entries()]
      .filter(([status]) => !ALL_STATUSES.has(status))
      .map(([status, files]) => `  - "${status}" (${[...files].sort().join(", ")})`);

    assert.equal(
      unclassified.length,
      0,
      `Unclassified status values (${unclassified.length}). Add each to exactly one set in ` +
        `server/status-vocabulary.js — DELIVERED_STATUSES, PROMPTED_STATUSES or FAILED_STATUSES:\n` +
        unclassified.join("\n")
    );
  });

  test("the three buckets are disjoint", () => {
    const overlaps = [];
    for (const s of DELIVERED_STATUSES) {
      if (PROMPTED_STATUSES.has(s)) overlaps.push(`${s}: delivered + prompted`);
      if (FAILED_STATUSES.has(s)) overlaps.push(`${s}: delivered + failed`);
    }
    for (const s of PROMPTED_STATUSES) {
      if (FAILED_STATUSES.has(s)) overlaps.push(`${s}: prompted + failed`);
    }
    assert.deepEqual(overlaps, [], `A status must mean exactly one thing:\n  ${overlaps.join("\n  ")}`);
  });

  test("every classified status survives the receiving end's error_class regex", () => {
    // get-orbit lib/db.ts rejects anything that doesn't match this, and a
    // rejected class is stored as NULL — a silently unattributable failure.
    const ERROR_CLASS_RE = /^[A-Za-z][A-Za-z0-9_-]{0,80}$/;
    const bad = [...ALL_STATUSES].filter((s) => !ERROR_CLASS_RE.test(s));
    assert.deepEqual(bad, [], `Statuses the telemetry sink would drop: ${bad.join(", ")}`);
  });

  test("the day-one refusals are failures, not successes", () => {
    // The regression this whole file exists to prevent. A fresh install
    // with no Braze/Stripo credential must not read as a working one.
    for (const status of [
      "needs_setup",
      "needs_plugin_credentials",
      "push_not_configured",
      "auth_failed",
      "no_modules",
      "module_not_found",
      "unsupported_platform",
    ]) {
      assert.ok(isFailureStatus(status), `"${status}" must classify as a failure`);
    }
    // ...and the conversational turns must not read as broken ones.
    for (const status of ["ok", "needs_inputs", "needs_confirmation", "dry_run", "partial", "saved"]) {
      assert.ok(!isFailureStatus(status), `"${status}" must not classify as a failure`);
    }
  });

  test("indirectly-set statuses are still classified", () => {
    // These never appear at a return site as a literal (they're computed
    // into a variable, or mapped from an error code in
    // withToolErrorHandling's catch), so the grep above can't see them.
    for (const status of INDIRECT_STATUSES) {
      assert.ok(ALL_STATUSES.has(status), `Indirect status "${status}" fell out of the vocabulary`);
    }
  });
});
