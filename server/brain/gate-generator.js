/**
 * Template Brain — ship-gate generator.
 *
 * Emits a starter `build/gate.sh`: the offline layout / structure gate an
 * author runs before any send. It parameterises to the user's byte-clip
 * limit, mobile viewport and master-template name, and covers four check
 * categories, each customer-neutral:
 *
 *   - byte-clip   — measured in BYTES (wc -c), never codepoints; master exempt
 *                   by BASENAME (a "mastercard" folder is not a library).
 *   - overflow    — no fixed width past the declared container width.
 *   - orphan-link — no empty / placeholder hrefs.
 *   - CTA-parity  — every link sharing a visible label resolves to ONE
 *                   destination.
 *
 * All four are ABSENCE checks, so the script rejects an empty / body-less
 * document up front: otherwise a failed compile scores a perfect pass.
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
import { writeGenerated } from "./verified-claims.js";

const DEFAULT_CLIP_KB = 102; // Gmail clips ~102 KB.
const DEFAULT_MOBILE_WIDTH = 375; // iPhone-class logical width.
const DEFAULT_CONTAINER_WIDTH = 600; // Standard email body width.
const DEFAULT_MASTER_NAME = "master";

/**
 * Generate `build/gate.sh` in the brain repo.
 *
 * @param {object} args
 * @param {string} args.path             Brain repo root.
 * @param {number} [args.clip_kb]         Byte-clip threshold in KB.
 * @param {number} [args.mobile_width]    Mobile viewport width in px.
 * @param {number} [args.container_width] Declared email container width in px.
 * @param {string} [args.master_name]     Filename token exempt from the clip check.
 * @returns {{ root, script, clip_kb, mobile_width, container_width, master_name,
 *             created, skipped, upgraded, unchanged, hand_edited }}
 */
export function generateBrainGate({
  path: repoPath,
  clip_kb,
  mobile_width,
  container_width,
  master_name,
} = {}) {
  const root = resolveSafe(repoPath);
  const clipKb = positiveNumber(clip_kb, DEFAULT_CLIP_KB);
  const mobileWidth = positiveNumber(mobile_width, DEFAULT_MOBILE_WIDTH);
  const containerWidth = positiveNumber(container_width, DEFAULT_CONTAINER_WIDTH);
  const masterName = sanitiseToken(master_name, DEFAULT_MASTER_NAME);

  const result = {
    root,
    script: null,
    clip_kb: clipKb,
    mobile_width: mobileWidth,
    container_width: containerWidth,
    master_name: masterName,
    created: [],
    skipped: [],
    upgraded: [],
    unchanged: [],
    hand_edited: [],
  };

  const scriptPath = path.join(root, "build", "gate.sh");
  result.script = scriptPath;
  const body = buildGateScript({ clipKb, mobileWidth, containerWidth, masterName });
  if (writeGenerated(scriptPath, body, result, "gate")) {
    fs.chmodSync(scriptPath, 0o755);
  }

  return result;
}

function buildGateScript({ clipKb, mobileWidth, containerWidth, masterName }) {
  const clipBytes = Math.round(clipKb * 1024);
  return `#!/usr/bin/env bash
# gate.sh — offline layout / structure ship gate.
#
# STARTER SCRIPT, parameterised for this brain. Run it on a COMPILED email
# HTML file before any send. It enforces four categorical checks:
#
#   0. precondition — the file is a real document, not a failed compile.
#   1. byte-clip    — total size under the clip threshold (BYTES, not chars).
#   2. overflow     — no fixed pixel width past the declared container.
#   3. orphan-link  — no empty or placeholder hrefs.
#   4. CTA-parity   — links sharing a visible label resolve to ONE destination.
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

CLIP_BYTES=${clipBytes}            # ${clipKb} KB clip threshold
MOBILE_WIDTH=${mobileWidth}        # mobile viewport width, px (reported, not the overflow bar)
CONTAINER_WIDTH=${containerWidth}  # declared email container width, px — the overflow bar
MASTER_TOKEN="${masterName}"       # BASENAMES containing this are size-exempt (library, not a send)

FILE="\${1:-}"
if [[ -z "\$FILE" || ! -f "\$FILE" ]]; then
  echo "gate: usage: build/gate.sh <compiled-email.html>" >&2
  exit 2
fi

# ── 0. precondition ───────────────────────────────────────────────
# Every check below is an ABSENCE check, so an absent document passes all of
# them: a zero-byte file has no oversized width, no orphan href and no
# colliding label. That made the cleanest email this gate ever saw the one
# that never compiled. Reject the input before measuring it.
bytes=\$(wc -c < "\$FILE" | tr -d ' ')
if (( bytes < 512 )) || ! grep -qi '<body' "\$FILE"; then
  echo "gate: NOT CHECKED — the file is empty or has no <body> — check whichever step wrote it (a failed compile, or a template that assembled zero modules)." >&2
  exit 2
fi

fail=0
warn=0
note() { echo "gate: [\$1] \$2"; }

# ── shared: flatten the document ──────────────────────────────────
# One buffer, newlines collapsed, <style>/<script> removed. Two reasons:
# a compiler puts each attribute on its own line, so a line-oriented scan
# finds ZERO anchors in real output; and a stylesheet's breakpoints are not
# layout widths. Every check below reads FLAT, never the raw file.
# NB: awk parameter names avoid every builtin (close, index, length, split...).
# Naming one \`close\` is a syntax error on BSD awk only — and the checks below
# would then have measured an empty string and reported four PASSes.
if ! FLAT="\$(awk '
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
    print buf
  }
' "\$FILE")" || (( \${#FLAT} < 100 )); then
  # Length, not a \${FLAT//…/} scrub: bash pattern substitution over a
  # few hundred KB of flattened markup takes minutes.
  echo "gate: NOT CHECKED — could not parse \$FILE into markup. Every check below is an absence check, so reporting PASS here would be a lie." >&2
  exit 2
fi

# (label TAB href) for every anchor, single- or double-quoted, however the
# compiler wrapped its attributes.
anchor_pairs() {
  printf '%s' "\$FLAT" | awk -v Q="\\"'" '
    {
      s = \$0
      while ((i = index(tolower(s), "<a ")) > 0) {
        s = substr(s, i + 3)
        seg = s
        j = index(tolower(seg), "</a>")
        if (j > 0) seg = substr(seg, 1, j - 1)
        href = ""
        if (match(seg, "href[ ]*=[ ]*[" Q "][^" Q "]*[" Q "]")) {
          href = substr(seg, RSTART, RLENGTH)
          sub("^href[ ]*=[ ]*[" Q "]", "", href)
          sub("[" Q "]\$", "", href)
        }
        body = seg
        sub(/^[^>]*>/, "", body)
        gsub(/<[^>]*>/, " ", body)
        gsub(/[ ]+/, " ", body)
        gsub(/^ | \$/, "", body)
        print tolower(body) "\\t" href
      }
    }
  '
}
PAIRS="\$(anchor_pairs)"

# ── 1. byte-clip ──────────────────────────────────────────────────
# Bytes, never characters — multibyte glyphs make a codepoint count lie.
# Matched on the BASENAME: a path component containing the token (a
# "mastercard" campaign folder) must not exempt a real send.
base=\$(basename "\$FILE")
if [[ "\$base" == *"\$MASTER_TOKEN"* ]]; then
  note "byte-clip" "SKIP — master library exempt by name (\$bytes bytes)."
elif (( bytes >= CLIP_BYTES )); then
  note "byte-clip" "FAIL — \$bytes bytes ≥ \$CLIP_BYTES. Trim inline CSS or move below-fold content out."
  fail=1
else
  note "byte-clip" "PASS — \$bytes / \$CLIP_BYTES bytes."
fi

# ── 2. overflow ───────────────────────────────────────────────────
# No fixed width= / width:NNpx wider than the DECLARED CONTAINER. Measuring
# against the \${MOBILE_WIDTH}px viewport instead warned on the container
# itself and on the responsive breakpoint — i.e. on every correct email,
# which is a warning nobody reads twice. Mobile reflow below the container
# is the render gate's job, in a real emulated viewport.
wide=\$(printf '%s' "\$FLAT" | grep -oiE 'width[:=]"?[[:space:]]*[0-9]+' \\
  | grep -oE '[0-9]+' | awk -v w="\$CONTAINER_WIDTH" '\$1 > w' | sort -nu | tail -5)
if [[ -n "\$wide" ]]; then
  note "overflow" "FAIL — fixed widths past the \${CONTAINER_WIDTH}px container: \$(echo "\$wide" | tr '\\n' ' '). These push the email sideways in every client."
  fail=1
else
  note "overflow" "PASS — no fixed width past the \${CONTAINER_WIDTH}px container."
fi

# ── 3. orphan-link ────────────────────────────────────────────────
orphans=\$(printf '%s\\n' "\$PAIRS" | awk -F'\\t' '
  NF > 1 {
    h = tolower(\$2); gsub(/^ +| +\$/, "", h)
    if (h == "" || h == "#" || h ~ /^javascript:void/) c++
  }
  END { print c + 0 }')
if (( orphans > 0 )); then
  note "orphan-link" "FAIL — \$orphans empty / placeholder href(s). Every link needs a real destination."
  fail=1
else
  note "orphan-link" "PASS — no orphan links."
fi

# ── 4. CTA-parity ─────────────────────────────────────────────────
# Same visible label must map to exactly one href. Group the extracted
# (label -> href) pairs by label, fail any label with more than one href.
parity=\$(printf '%s\\n' "\$PAIRS" | awk -F'\\t' 'NF > 1 && \$1 != "" && \$2 != ""' \\
  | sort -u | awk -F'\\t' '{ c[\$1]++ } END { for (l in c) if (c[l] > 1) print l }')
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

export {
  DEFAULT_CLIP_KB,
  DEFAULT_MOBILE_WIDTH,
  DEFAULT_CONTAINER_WIDTH,
  DEFAULT_MASTER_NAME,
};
