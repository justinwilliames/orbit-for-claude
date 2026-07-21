/**
 * Template Brain — ship-gate generator.
 *
 * Emits a starter `build/gate.sh`: the offline layout / structure gate an
 * author runs before any send. It parameterises to the user's byte-clip
 * limit, mobile viewport and master-template name, and covers four check
 * categories, each customer-neutral:
 *
 *   - byte-clip   — measured in BYTES (wc -c), never codepoints; master exempt.
 *   - mobile      — no fixed width wider than the mobile viewport.
 *   - orphan-link — no empty / placeholder hrefs.
 *   - CTA-parity  — every link sharing a visible label resolves to ONE
 *                   destination.
 *
 * The gate scopes itself honestly in its own header: it is a layout / structure
 * gate only. It does NOT reproduce send-time render or inbox truth — that stays
 * with the render / inbox QA gate (orbit_qa_email + orbit_render_email_preview).
 *
 * Pure local file generation — no network, no activation gate. Refuses to
 * overwrite an existing file (report-and-skip).
 *
 * ALL generated content is customer-neutral: placeholder brand "ACME".
 */

import fs from "node:fs";
import path from "node:path";

import { resolveSafe } from "../path-safety.js";
import { writeSkip } from "./verified-claims.js";

const DEFAULT_CLIP_KB = 102; // Gmail clips ~102 KB.
const DEFAULT_MOBILE_WIDTH = 375; // iPhone-class logical width.
const DEFAULT_MASTER_NAME = "master";

/**
 * Generate `build/gate.sh` in the brain repo.
 *
 * @param {object} args
 * @param {string} args.path             Brain repo root.
 * @param {number} [args.clip_kb]        Byte-clip threshold in KB.
 * @param {number} [args.mobile_width]   Mobile viewport width in px.
 * @param {string} [args.master_name]    Filename token exempt from the clip check.
 * @returns {{ root, script, clip_kb, mobile_width, master_name, created, skipped }}
 */
export function generateBrainGate({
  path: repoPath,
  clip_kb,
  mobile_width,
  master_name,
} = {}) {
  const root = resolveSafe(repoPath);
  const clipKb = positiveNumber(clip_kb, DEFAULT_CLIP_KB);
  const mobileWidth = positiveNumber(mobile_width, DEFAULT_MOBILE_WIDTH);
  const masterName = sanitiseToken(master_name, DEFAULT_MASTER_NAME);

  const result = { root, script: null, clip_kb: clipKb, mobile_width: mobileWidth, master_name: masterName, created: [], skipped: [] };

  const scriptPath = path.join(root, "build", "gate.sh");
  result.script = scriptPath;
  if (writeSkip(scriptPath, buildGateScript({ clipKb, mobileWidth, masterName }), result)) {
    fs.chmodSync(scriptPath, 0o755);
  }

  return result;
}

function buildGateScript({ clipKb, mobileWidth, masterName }) {
  const clipBytes = Math.round(clipKb * 1024);
  return `#!/usr/bin/env bash
# gate.sh — offline layout / structure ship gate.
#
# STARTER SCRIPT, parameterised for this brain. Run it on a COMPILED email
# HTML file before any send. It enforces four categorical checks:
#
#   1. byte-clip   — total size under the clip threshold (BYTES, not chars).
#   2. mobile      — no fixed pixel width wider than the mobile viewport.
#   3. orphan-link — no empty or placeholder hrefs.
#   4. CTA-parity  — links sharing a visible label resolve to ONE destination.
#
# HONEST SCOPE: this is the LAYOUT / STRUCTURE gate. It does NOT reproduce
# send-time truth — a blank dynamic token, string-vs-boolean truthiness, or how
# an inbox actually renders. The render / inbox QA gate owns that (run
# orbit_qa_email + orbit_render_email_preview on the exact compiled HTML before
# a real send). Passing this gate is necessary, not sufficient.
#
# A templating-bearing email must be RESOLVED off one shared variable map and
# each branch gated separately — resolve every branch, never strip. Compile and
# resolve upstream of this script, then run the gate once per resolved branch.
#
# Usage: build/gate.sh <compiled-email.html>

set -uo pipefail

CLIP_BYTES=${clipBytes}          # ${clipKb} KB clip threshold
MOBILE_WIDTH=${mobileWidth}      # mobile viewport width, px
MASTER_TOKEN="${masterName}"     # filenames containing this are size-exempt (library, not a send)

FILE="\${1:-}"
if [[ -z "\$FILE" || ! -f "\$FILE" ]]; then
  echo "gate: usage: build/gate.sh <compiled-email.html>" >&2
  exit 2
fi

fail=0
warn=0
note() { echo "gate: [\$1] \$2"; }

# ── 1. byte-clip ──────────────────────────────────────────────────
# Bytes, never characters — multibyte glyphs make a codepoint count lie.
bytes=\$(wc -c < "\$FILE" | tr -d ' ')
if [[ "\$FILE" == *"\$MASTER_TOKEN"* ]]; then
  note "byte-clip" "SKIP — master library exempt by name (\$bytes bytes)."
elif (( bytes >= CLIP_BYTES )); then
  note "byte-clip" "FAIL — \$bytes bytes ≥ \$CLIP_BYTES. Trim inline CSS or move below-fold content out."
  fail=1
else
  note "byte-clip" "PASS — \$bytes / \$CLIP_BYTES bytes."
fi

# ── 2. mobile ─────────────────────────────────────────────────────
# Heuristic: no fixed width= / width:NNpx wider than the mobile viewport.
# The AUTHORITATIVE mobile check is an emulated-viewport render (the render
# gate). This starter catches the common fixed-width overflow offline.
wide=\$(grep -oiE 'width[:=]"?[[:space:]]*[0-9]+' "\$FILE" \\
  | grep -oE '[0-9]+' | awk -v w="\$MOBILE_WIDTH" '\$1 > w' | sort -nu | tail -5)
if [[ -n "\$wide" ]]; then
  note "mobile" "WARN — fixed widths above \${MOBILE_WIDTH}px found: \$(echo "\$wide" | tr '\\n' ' '). Verify no horizontal overflow in an emulated viewport."
  warn=1
else
  note "mobile" "PASS — no fixed width above \${MOBILE_WIDTH}px."
fi

# ── 3. orphan-link ────────────────────────────────────────────────
orphans=\$(grep -oiE 'href="[[:space:]]*(#?|javascript:void\\(0\\)?)[[:space:]]*"' "\$FILE" | wc -l | tr -d ' ')
if (( orphans > 0 )); then
  note "orphan-link" "FAIL — \$orphans empty / placeholder href(s). Every link needs a real destination."
  fail=1
else
  note "orphan-link" "PASS — no orphan links."
fi

# ── 4. CTA-parity ─────────────────────────────────────────────────
# Same visible label must map to exactly one href. Extract (label -> href)
# pairs, group by label, fail any label with more than one distinct href.
parity=\$(awk '
  BEGIN { RS="<a "; FS="\\n" }
  NR > 1 {
    href=""; label="";
    if (match($0, /href="[^"]*"/)) { href=substr($0, RSTART+6, RLENGTH-7); }
    body=$0; sub(/^[^>]*>/, "", body); sub(/<\\/a>.*/, "", body);
    gsub(/<[^>]*>/, "", body); gsub(/[[:space:]]+/, " ", body);
    gsub(/^ | $/, "", body); label=tolower(body);
    if (label != "" && href != "") print label "\\t" href;
  }
' "\$FILE" | sort -u | awk -F'\\t' '{ c[$1]++ } END { for (l in c) if (c[l] > 1) print l }')
if [[ -n "\$parity" ]]; then
  note "CTA-parity" "FAIL — label(s) point to multiple destinations: \$(echo "\$parity" | tr '\\n' ';')"
  fail=1
else
  note "CTA-parity" "PASS — every shared label resolves to one destination."
fi

# ── verdict ───────────────────────────────────────────────────────
if (( fail )); then
  echo "gate: BLOCKED — layout/structure failures above. Not shippable." >&2
  exit 1
fi
if (( warn )); then
  echo "gate: PASS WITH WARNINGS — review the mobile note, then run the render gate."
  exit 0
fi
echo "gate: PASS — layout/structure clean. Run the render/inbox QA gate before sending."
`;
}

// ── Helpers ───────────────────────────────────────────────────────

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sanitiseToken(value, fallback) {
  const cleaned = String(value ?? "").trim().replace(/[^a-zA-Z0-9._-]+/g, "");
  return cleaned.length > 0 ? cleaned : fallback;
}

export { DEFAULT_CLIP_KB, DEFAULT_MOBILE_WIDTH, DEFAULT_MASTER_NAME };
