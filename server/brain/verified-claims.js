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

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { resolveSafe } from "../path-safety.js";

const PLACEHOLDER_BRAND = "ACME";

/**
 * Generation counter for the SCRIPTS these generators emit (gate.sh,
 * check-claims.sh). Bump it whenever an emitted script body changes.
 *
 * Why it exists: both generators used to route through `writeSkip`, so
 * regenerating over an existing brain was a silent no-op that reported
 * `partial`. Nothing on disk said which generation it was, so a fixed gate
 * could only ever reach people who had never run the tool. Every generated
 * script now carries `# orbit-<kind>-generation: N`; an older marker is
 * upgraded in place, a missing marker means a human edited it and we do not
 * touch it.
 */
const SCRIPT_GENERATION = 3;

/**
 * The marker line stamped into every generated script, after the shebang.
 *
 * It carries a digest of the body it was written with, not just a generation
 * number. The number answers "how old is this?"; only the digest answers the
 * question that decides whether we may destroy the file — "is this still
 * byte-for-byte what Orbit wrote, or has a human been in here since?"
 */
function generationMarker(kind, digest) {
  return `# orbit-${kind}-generation: ${SCRIPT_GENERATION} sha256:${digest}`;
}

/** Digest of a script body with any generation marker line removed. */
function bodyDigest(body, kind) {
  const stripped = String(body)
    .split("\n")
    .filter((l) => !new RegExp(`^# orbit-${kind}-generation:`).test(l))
    .join("\n");
  return crypto.createHash("sha256").update(stripped, "utf8").digest("hex").slice(0, 16);
}

/** Read the generation + digest stamped into an existing script. */
function readGeneration(body, kind) {
  const match = body.match(
    new RegExp(`^# orbit-${kind}-generation:[ \\t]*(\\d+)(?:[ \\t]+sha256:([0-9a-f]+))?[ \\t]*$`, "m")
  );
  if (!match) return null;
  return { generation: Number(match[1]), digest: match[2] ?? null };
}

/**
 * Write `content` to `filePath` unless it already exists.
 * Records the outcome on `result` and returns true if written.
 *
 * For USER content (the claims markdown, PRD stubs) — never overwritten,
 * because the user's edits are the point. Generated scripts use
 * `writeGenerated` instead.
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
 * Write a GENERATED script, upgrading an older generation in place.
 *
 * Five outcomes, each named on `result` rather than collapsed into "skipped":
 *   created     — nothing was there.
 *   upgraded    — Orbit's own untouched output, rewritten ({path,from,to}).
 *   unchanged   — byte-identical to what we would write now.
 *   hand_edited — a human wrote or edited it. Left alone.
 *   unverified  — marked by a pre-digest Orbit, so we cannot tell. Left alone.
 *
 * WHY THE DIGEST.
 *
 * The `hand_edited` test used to be "is the marker missing?", and its own
 * docblock stated the premise as "no marker, so a human wrote or edited it".
 * That premise is false in the direction that costs data: a human editing an
 * Orbit-generated script KEEPS the header. Nobody deletes the shebang block
 * to tighten a threshold. So the guard protected only the edits nobody makes
 * and destroyed every edit anyone actually makes — silently, and reported as
 * `upgraded {from: 2, to: 2}`, an upgrade from a generation to itself, which
 * is not a thing that can happen and which nothing asserted against.
 *
 * One product had two opposite write policies twenty lines apart: writeSkip
 * refuses and reports `skipped`, writeGenerated overwrote and reported
 * success — and the destructive one was on the flagship step.
 *
 * So the marker now carries a digest of the body Orbit wrote. If the file on
 * disk still hashes to it, the file is ours and may be replaced. If it does
 * not, a human has been in here and we stop. A file marked by a pre-digest
 * Orbit is `unverified` — we cannot prove it is untouched, so we do not
 * destroy it; deleting it is a one-word instruction, un-deleting an edit is
 * not.
 *
 * The rewrite still triggers on CONTENT, not just on the generation number:
 * a regenerate with a different clip_kb has to land, and reporting "already
 * current" while leaving the old threshold on disk is the same silent no-op
 * the marker exists to kill.
 */
function writeGenerated(filePath, body, result, kind) {
  for (const key of ["created", "skipped", "upgraded", "unchanged", "hand_edited", "unverified"]) {
    if (!result[key]) result[key] = [];
  }

  const lines = body.split("\n");
  lines.splice(lines[0].startsWith("#!") ? 1 : 0, 0, generationMarker(kind, bodyDigest(body, kind)));
  const content = lines.join("\n");

  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf8");
    const found = readGeneration(existing, kind);
    if (found === null) {
      result.hand_edited.push(filePath);
      return false;
    }
    if (found.digest === null) {
      result.unverified.push({
        path: filePath,
        from: found.generation,
        reason:
          "Written by an Orbit that did not stamp a content digest, so whether it " +
          "has been edited since cannot be established. Not overwritten. Delete the " +
          "file to regenerate it, after saving anything you added.",
      });
      return false;
    }
    if (bodyDigest(existing, kind) !== found.digest) {
      result.hand_edited.push({
        path: filePath,
        from: found.generation,
        reason:
          "Orbit generated this file and it has been modified since. Your changes " +
          "were kept. Delete the file to regenerate it from scratch.",
      });
      return false;
    }
    if (existing === content) {
      result.unchanged.push(filePath);
      return false;
    }
    fs.writeFileSync(filePath, content, "utf8");
    result.upgraded.push({ path: filePath, from: found.generation, to: SCRIPT_GENERATION });
    return true;
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

# Resolve the claims file against the REPO, not the caller's cwd. The default
# used to be the bare relative path, which only worked when someone happened to
# run this from the repo root — and gate.sh now calls it on every send from
# wherever the author is standing. A gate stage that reports "claims file not
# found" because of a working directory reads as a missing file, and the fix
# people reach for is to stop running the check.
HERE="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT="\$(dirname "\$HERE")"

HTML_FILE="\${1:-}"
CLAIMS_FILE="\${2:-\$ROOT/knowledge/verified-claims.md}"

if [[ -z "\$HTML_FILE" || ! -f "\$HTML_FILE" ]]; then
  echo "check-claims: usage: build/check-claims.sh <compiled-email.html> [claims-file]" >&2
  exit 2
fi
if [[ ! -f "\$CLAIMS_FILE" ]]; then
  echo "check-claims: claims file not found: \$CLAIMS_FILE" >&2
  exit 2
fi

# An absence check on an absent document passes for the wrong reason: a
# zero-byte file quotes no unapproved figure, so the cleanest email this
# gate ever saw was the one that never compiled. Reject the input instead.
if (( \$(wc -c < "\$HTML_FILE" | tr -d ' ') < 512 )) || ! grep -qi '<body' "\$HTML_FILE"; then
  echo "check-claims: NOT CHECKED — the file is empty or has no <body> — check whichever step wrote it (a failed compile, or a template that assembled zero modules)." >&2
  exit 2
fi

# Numbers that are structural, not claims — safe to ignore. Extend for your
# own template: years, common pixel/spacing values, colour hex digits, etc.
IGNORE_RE='^(0|1|2|3|4|5|6|7|8|9|10|20|24|100|200|202[0-9]|203[0-9]|600|640)\$'

# A STATISTIC is a figure offered as evidence. A price, a clock time, a date, a
# street number and a quantity are none of those, and the first version of this
# gate blocked "free over \$50" and "ends at 11pm" while waving through
# "Save 20%" — the one figure in that sentence that actually needs a source.
# These patterns are matched against the number IN CONTEXT, not the bare digits.
CONTEXTUAL_IGNORE='([\$£€¥][0-9]|[0-9][ ]?(am|pm|AM|PM)|[0-9](st|nd|rd|th)|[0-9][ ]?(hours?|days?|weeks?|months?|mins?|minutes?|seconds?)|[0-9][ ]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))'

# ── extraction ────────────────────────────────────────────────────
# Two rules earned the hard way, both of which made this gate fire on 100%
# of real emails and on none of the broken ones:
#
#   1. Strip <style>/<script>/comments BEFORE stripping tags. A <style>
#      block's CONTENTS are not tags, so a naive tag strip leaves every hex
#      digit, media-query breakpoint and spacing value behind as a "claim".
#   2. Never join across a comma. "font-weight:300,400,500,700" with its
#      commas deleted becomes the number 300400500700, which appears
#      nowhere on Earth. Only a properly grouped thousands number
#      (1,234 / 12,000) collapses; anything else splits into its parts.
#
# Known limit: a number that only ever appears inside an HTML comment is not
# checked. Comments are stripped because MSO conditionals carry layout px.

# Visible copy only: no <style>, no <script>, no comments, no tags.
# NB: awk parameter names avoid every builtin (close, index, length, split...).
# Naming one \`close\` is a syntax error on BSD awk only, and this gate would
# then have compared an empty extraction and reported PASS.
visible_text() {
  awk '
    function cut(s, openTok, shutTok,   out, i, j) {
      out = ""
      while ((i = index(tolower(s), openTok)) > 0) {
        out = out substr(s, 1, i - 1) " "
        s = substr(s, i + length(openTok))
        j = index(tolower(s), shutTok)
        if (j == 0) return out
        s = substr(s, j + length(shutTok))
      }
      return out s
    }
    { gsub(/\\t/, " "); buf = buf \$0 " " }
    END {
      buf = cut(buf, "<style", "</style>")
      buf = cut(buf, "<script", "</script>")
      # Downlevel-revealed markers wrap content meant for NON-Outlook clients.
      # Drop the markers, keep the copy between them.
      gsub(/<!--\\[if[^>]*\\]><!-->/, " ", buf)
      gsub(/<!--<!\\[endif\\]-->/, " ", buf)
      buf = cut(buf, "<!--[if", "<![endif]-->")   # Outlook-only blocks
      buf = cut(buf, "<!--", "-->")               # ordinary comments
      gsub(/<[^>]*>/, " ", buf)
      print buf
    }
  ' "\$1"
}

# Digit tokens, one per line, commas resolved per token — never across one.
numbers() {
  grep -oE '[0-9][0-9,]*[0-9]|[0-9]' \\
    | awk '
        /^[0-9][0-9]?[0-9]?(,[0-9][0-9][0-9])+\$/ { gsub(/,/, ""); print; next }
        {
          n = split(\$0, part, ",")
          for (i = 1; i <= n; i++) if (part[i] != "") print part[i]
        }
      ' \\
    | sort -u
}

# The set of approved display forms, digits-only, so "12,000+" in the claims
# file matches "12000" extracted from the email.
approved="\$(numbers < "\$CLAIMS_FILE" || true)"

# A receipts table with nothing in it cannot enforce this law; it can only
# block every number in every email. Bootstrapping a brain now writes this
# script, so that empty state is the DEFAULT one — and a gate whose
# out-of-the-box behaviour is to refuse an ordinary marketing email is a gate
# people delete on day one. Say the law is not armed yet, and arm it the moment
# the author writes their first receipt.
if [[ -z "\$approved" ]]; then
  echo "check-claims: NOT ARMED — \$CLAIMS_FILE has no receipts in it yet, so there is nothing to check figures against. Add your first receipt and this law starts enforcing on the next run." >&2
  exit 2
fi

# Every standalone integer in the email's VISIBLE copy.
visible="\$(visible_text "\$HTML_FILE")"
rendered="\$(printf '%s' "\$visible" | numbers || true)"

violations=()
while IFS= read -r n; do
  [[ -z "\$n" ]] && continue
  [[ "\$n" =~ \$IGNORE_RE ]] && continue
  # Skip it ONLY if we can SEE its occurrences and every one of them sits
  # inside a price, a clock time or a date. Two ways to get this wrong, and
  # the first draft managed both: the probe searched for the comma-stripped
  # form while the copy reads "48,000", found nothing — and then treated
  # "no occurrences" as "no violations" and waved the figure through. An
  # unreadable context is a reason to CHECK, never a reason to skip.
  probe="\$(printf '%s' "\$n" | sed 's/./&,\\?/g')"
  ctx="\$(grep -oE "[^ ]{0,3}\$probe[^ ]{0,10}" <<< "\$visible" || true)"
  if [[ -n "\$ctx" ]] && ! grep -qvE "\$CONTEXTUAL_IGNORE" <<< "\$ctx"; then
    continue
  fi
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
  const result = { root, created: [], skipped: [], upgraded: [], unchanged: [], hand_edited: [] };

  // The claims markdown is the user's own receipts — never overwritten.
  writeSkip(
    path.join(root, "knowledge", "verified-claims.md"),
    buildVerifiedClaimsMarkdown(company),
    result
  );

  // The script is ours — an older generation gets upgraded in place.
  const script = path.join(root, "build", "check-claims.sh");
  if (writeGenerated(script, buildCheckClaimsScript(), result, "check-claims")) {
    fs.chmodSync(script, 0o755);
  }

  return result;
}

function normaliseBrand(name) {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed : PLACEHOLDER_BRAND;
}

export {
  writeSkip,
  writeGenerated,
  readGeneration,
  generationMarker,
  SCRIPT_GENERATION,
  PLACEHOLDER_BRAND,
  today,
};
