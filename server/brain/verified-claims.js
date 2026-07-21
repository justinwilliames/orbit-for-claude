/**
 * Template Brain — verified-claims generator.
 *
 * Productises the "verified-claims file" pattern: a single whitelist of
 * statistics an email program is allowed to quote. Every figure that
 * appears in a stat/proof module MUST come from this file; if there is no
 * receipt, the module is dropped — never a placeholder, never extrapolated.
 *
 * This module owns the CANONICAL content of that file (one editable home),
 * so the scaffolder reuses `buildVerifiedClaimsMarkdown()` when it seeds a
 * fresh brain and `orbit_init_verified_claims` reuses it to (re)initialise
 * the file standalone plus emit `build/check-claims.sh`.
 *
 * Pure local file generation — no network, no activation gate. Every write
 * refuses to overwrite an existing file (report-and-skip).
 *
 * ALL generated content is customer-neutral: placeholder brand "ACME".
 */

import fs from "node:fs";
import path from "node:path";

import { resolveSafe } from "../path-safety.js";

const PLACEHOLDER_BRAND = "ACME";

/**
 * Write `content` to `filePath` unless it already exists.
 * Records the outcome on `result` and returns true if written.
 */
function writeSkip(filePath, content, result) {
  if (fs.existsSync(filePath)) {
    result.skipped.push(filePath);
    return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  result.created.push(filePath);
  return true;
}

/**
 * The canonical `knowledge/verified-claims.md` content. Customer-neutral;
 * `company` defaults to the ACME placeholder.
 */
export function buildVerifiedClaimsMarkdown(company = PLACEHOLDER_BRAND) {
  return `---
title: "${company} — Verified Claims"
type: knowledge
stage: cross-program
slug: verified-claims
status: live
owner: TODO
priority: P1
updated: ${today()}
human_approved: false
links: []
---

# Verified Claims — the numbers this program is allowed to quote

This file is the **whitelist of statistics ${company}'s emails may quote.** It
is the single canonical home for every figure that appears in a stat or proof
module. Nothing else restates a number — modules link here.

## Staleness rule (read before every send that quotes a figure)

1. **Re-run the receipt query** for any figure the email quotes before you send.
2. Only **raise a display form** when a fresh reading clears the next round
   threshold. Never raise it on a hunch, never annualise, never extrapolate.
3. Stamp the **date read** in the row every time you re-verify.

## The hard gate (wired into the module catalogue)

> Any figure in a stat/proof module **must** come from a row below. If the data
> does not exist, or is not close enough to the claim, **drop the module from
> the email entirely.** Never ship a placeholder. Never extrapolate. Never
> annualise a partial reading.

A missing receipt is not a reason to soften the copy — it is a reason to remove
the claim. This converts "don't make up numbers" from a hope into an auditable
mechanism.

## Safe display form

The **display** column is rounded **down** from the raw value so the claim stays
true as the underlying data grows (a "10,000+" claim never becomes false the day
after you read 10,400). Round down, never up.

## Receipts

Replace the example row. One row per claim.

| Claim | Raw value | Display (rounded down) | Receipt (source query) | Date read |
|---|---|---|---|---|
| _e.g. jobs booked to date_ | _12,431_ | _12,000+_ | _\`SELECT count(*) FROM jobs\` — ${company} warehouse_ | _${today()}_ |

<!--
  Add rows above. Rules:
  - Display is rounded DOWN from Raw.
  - Receipt names the exact query / source, not "the dashboard".
  - Date read is the day you last ran the receipt query.
  - No row => the number may not appear in any email.
-->
`;
}

/**
 * The starter `build/check-claims.sh` script: greps compiled email HTML for
 * digits and fails the build on any figure absent from the claims file.
 * Customer-neutral; a starting point the user tunes to their number formats.
 */
export function buildCheckClaimsScript() {
  return `#!/usr/bin/env bash
# check-claims.sh — fail a build that quotes a number not in the claims file.
#
# STARTER SCRIPT. It enforces the verified-claims hard gate at the layout
# stage: every standalone number in the compiled email HTML must appear as an
# approved display form in knowledge/verified-claims.md. Tune the number
# regex and the ignore list to your own copy conventions.
#
# Scope (honest): this is a text-level guard, not a data-truth guarantee.
# It cannot know a token resolved to the right value at send time — a live
# multi-state test cohort in your ESP still owns that. See the render/inbox
# QA gate for send-time truth.
#
# Usage: build/check-claims.sh <compiled-email.html> [claims-file]

set -euo pipefail

HTML_FILE="\${1:-}"
CLAIMS_FILE="\${2:-knowledge/verified-claims.md}"

if [[ -z "\$HTML_FILE" || ! -f "\$HTML_FILE" ]]; then
  echo "check-claims: usage: build/check-claims.sh <compiled-email.html> [claims-file]" >&2
  exit 2
fi
if [[ ! -f "\$CLAIMS_FILE" ]]; then
  echo "check-claims: claims file not found: \$CLAIMS_FILE" >&2
  exit 2
fi

# Numbers that are structural, not claims — safe to ignore. Extend for your
# own template: years, common pixel/spacing values, colour hex digits, etc.
IGNORE_RE='^(0|1|2|3|4|5|6|7|8|9|10|20|24|100|200|202[0-9]|203[0-9]|600|640)$'

# The set of approved display forms, digits-only (commas/plus/% stripped) so
# "12,000+" in the claims file matches "12000" extracted from the HTML.
approved="$(grep -oE '[0-9][0-9,]*' "\$CLAIMS_FILE" | tr -d ',' | sort -u || true)"

# Every standalone integer in the rendered HTML (strip tags first so we do not
# catch numbers inside attributes like width="600").
rendered="$(sed -E 's/<[^>]*>/ /g' "\$HTML_FILE" \\
  | grep -oE '[0-9][0-9,]*' | tr -d ',' | sort -u || true)"

violations=()
while IFS= read -r n; do
  [[ -z "\$n" ]] && continue
  [[ "\$n" =~ \$IGNORE_RE ]] && continue
  if ! grep -qxF "\$n" <<< "\$approved"; then
    violations+=("\$n")
  fi
done <<< "\$rendered"

if (( \${#violations[@]} > 0 )); then
  echo "check-claims: FAIL — numbers in the email with no receipt in \$CLAIMS_FILE:" >&2
  printf '  - %s\\n' "\${violations[@]}" >&2
  echo "Add a receipt row, or drop the module quoting the figure. Never placeholder." >&2
  exit 1
fi

echo "check-claims: PASS — every quoted figure has a receipt."
`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Initialise the verified-claims whitelist file + the check-claims gate.
 * Refuses to overwrite either file (report-and-skip).
 *
 * @param {object} args
 * @param {string} args.path        Brain repo root.
 * @param {string} [args.company_name]
 * @returns {{ root: string, created: string[], skipped: string[] }}
 */
export function initVerifiedClaims({ path: repoPath, company_name } = {}) {
  const root = resolveSafe(repoPath);
  const company = normaliseBrand(company_name);
  const result = { root, created: [], skipped: [] };

  writeSkip(
    path.join(root, "knowledge", "verified-claims.md"),
    buildVerifiedClaimsMarkdown(company),
    result
  );

  const script = path.join(root, "build", "check-claims.sh");
  if (writeSkip(script, buildCheckClaimsScript(), result)) {
    fs.chmodSync(script, 0o755);
  }

  return result;
}

function normaliseBrand(name) {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed : PLACEHOLDER_BRAND;
}

export { writeSkip, PLACEHOLDER_BRAND, today };
