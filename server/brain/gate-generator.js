/**
 * Template Brain — ship-gate generator.
 *
 * Emits the offline layout / structure gate an author runs before any send,
 * parameterised to the user's byte-clip limit, container width, master-template
 * path and mobile viewport. Three files:
 *
 *   build/gate.sh            the gate itself — seven stages, below.
 *   build/drift-check.sh     module drift, called by stage 5 and runnable alone.
 *   build/drift-allowlist.tsv the divergence allowlist (user content, never clobbered).
 *
 * The gate's stages, each customer-neutral:
 *
 *   0. precondition — the file is a real document, not a failed compile.
 *   1. byte-clip   — measured in BYTES (wc -c), never codepoints; master exempt
 *                    by BASENAME (a "mastercard" folder is not a library).
 *   2. overflow    — no fixed width past the declared container width.
 *   3. orphan-link — no empty / placeholder hrefs.
 *   4. CTA-parity  — every link sharing a visible label resolves to ONE
 *                    destination.
 *   5. module-drift — every module matches the master's skeleton, or cites a
 *                    ruling in the allowlist. Drift is a FAIL, not a judgement
 *                    call; and a module absent from the master means the email
 *                    was composed from memory, which is the same defect earlier.
 *   6. gmail-first — constructs Gmail does not render are DROPPED, not degraded.
 *   7. statistics  — every quoted figure has a receipt (delegates to
 *                    build/check-claims.sh from orbit_init_verified_claims).
 *
 * Stages 1–4 are ABSENCE checks, so the script rejects an empty / body-less
 * document up front: otherwise a failed compile scores a perfect pass. Stages
 * 5–7 depend on files the user may not have installed yet; each says so LOUDLY
 * and downgrades the verdict to PASS WITH WARNINGS rather than reporting a
 * clean pass over an unenforced law.
 *
 * The gate scopes itself honestly in its own header: it is a layout / structure
 * gate only. It does NOT reproduce send-time render or inbox truth — that stays
 * with the render / inbox QA gate (orbit_qa_email + orbit_render_email_preview).
 *
 * Pure local file generation — no network, no activation gate. It DOES
 * rewrite its own previous output in place (that is how a changed clip_kb
 * lands), but never a file a human has touched: the generation marker
 * carries a digest of the body Orbit wrote, and a file that no longer
 * hashes to it comes back as `hand_edited` and is left exactly as found.
 *
 * ALL generated content is customer-neutral: placeholder brand "ACME".
 */

import fs from "node:fs";
import path from "node:path";

import { resolveSafe } from "../path-safety.js";
import { writeGenerated, writeSkip } from "./verified-claims.js";

const DEFAULT_CLIP_KB = 102; // Gmail clips ~102 KB.
const DEFAULT_MOBILE_WIDTH = 375; // iPhone-class logical width.
const DEFAULT_CONTAINER_WIDTH = 600; // Standard email body width.
const DEFAULT_MASTER_NAME = "master";
const DEFAULT_MASTER_TEMPLATE = "templates/master-template.html";

/**
 * Generate the ship gate in the brain repo.
 *
 * @param {object} args
 * @param {string} args.path              Brain repo root.
 * @param {number} [args.clip_kb]         Byte-clip threshold in KB.
 * @param {number} [args.mobile_width]    Mobile viewport width in px.
 * @param {number} [args.container_width] Declared email container width in px.
 * @param {string} [args.master_name]     Filename token exempt from the clip check.
 * @param {string} [args.master_template] Repo-relative path to the canonical master.
 * @param {boolean} [args.gmail_first]    Enforce the Gmail-first single tier (default true).
 * @returns {{ root, script, drift_check, drift_allowlist, clip_kb, mobile_width,
 *             container_width, master_name, master_template, gmail_first,
 *             created, skipped, upgraded, unchanged, hand_edited, unverified }}
 */
export function generateBrainGate({
  path: repoPath,
  clip_kb,
  mobile_width,
  container_width,
  master_name,
  master_template,
  gmail_first,
} = {}) {
  const root = resolveSafe(repoPath);
  const clipKb = positiveNumber(clip_kb, DEFAULT_CLIP_KB);
  const mobileWidth = positiveNumber(mobile_width, DEFAULT_MOBILE_WIDTH);
  const containerWidth = positiveNumber(container_width, DEFAULT_CONTAINER_WIDTH);
  const masterName = sanitiseToken(master_name, DEFAULT_MASTER_NAME);
  const masterTemplate = sanitiseRelPath(master_template, DEFAULT_MASTER_TEMPLATE);
  const gmailFirst = gmail_first === undefined ? true : Boolean(gmail_first);

  const result = {
    root,
    script: null,
    drift_check: null,
    drift_allowlist: null,
    clip_kb: clipKb,
    mobile_width: mobileWidth,
    container_width: containerWidth,
    master_name: masterName,
    master_template: masterTemplate,
    gmail_first: gmailFirst,
    created: [],
    skipped: [],
    upgraded: [],
    unchanged: [],
    hand_edited: [],
    unverified: [],
  };

  // The allowlist is USER content — every line in it is a ruling someone made.
  // writeSkip, never writeGenerated: regenerating the gate must not be able to
  // erase the record of why a divergence was permitted.
  const allowlistPath = path.join(root, "build", "drift-allowlist.tsv");
  result.drift_allowlist = allowlistPath;
  writeSkip(allowlistPath, buildAllowlistSeed(), result);

  const driftPath = path.join(root, "build", "drift-check.sh");
  result.drift_check = driftPath;
  if (writeGenerated(driftPath, buildDriftScript({ masterTemplate }), result, "drift")) {
    fs.chmodSync(driftPath, 0o755);
  }

  const scriptPath = path.join(root, "build", "gate.sh");
  result.script = scriptPath;
  const body = buildGateScript({
    clipKb,
    mobileWidth,
    containerWidth,
    masterName,
    masterTemplate,
    gmailFirst,
  });
  if (writeGenerated(scriptPath, body, result, "gate")) {
    fs.chmodSync(scriptPath, 0o755);
  }

  // Say it in prose too. A caller reading `hand_edited: [{...}]` off a
  // result object may or may not act on it; a caller reading "your edits
  // were kept and the parameters you asked for did NOT land" cannot miss
  // that the regenerate was a no-op.
  const preserved = [...result.hand_edited, ...result.unverified];
  result.message =
    preserved.length > 0
      ? `Nothing was written to ${preserved
          .map((p) => path.basename(p?.path ?? p))
          .join(", ")}: the file already exists and is not verifiably Orbit's own output, ` +
        "so your copy was left exactly as found. The parameters you passed have NOT been applied. " +
        "Save anything you added, delete the file, and run this again."
      : result.unchanged.length > 0 && result.created.length === 0 && result.upgraded.length === 0
        ? `${scriptPath} is already current — byte-identical to what would be written now.`
        : `Wrote ${scriptPath}. Run it on a COMPILED email before any send. ` +
          `Stage 5 (module drift) stays UNENFORCED until ${masterTemplate} exists — ` +
          "the gate says so on every run rather than passing quietly.";

  return result;
}

// ── The gate ──────────────────────────────────────────────────────

function buildGateScript({
  clipKb,
  mobileWidth,
  containerWidth,
  masterName,
  masterTemplate,
  gmailFirst,
}) {
  const clipBytes = Math.round(clipKb * 1024);
  return `#!/usr/bin/env bash
# gate.sh — offline layout / structure ship gate.
#
# STARTER SCRIPT, parameterised for this brain. Run it on a COMPILED email
# HTML file before any send. It enforces seven categorical checks:
#
#   0. precondition — the file is a real document, not a failed compile.
#   1. byte-clip    — total size under the clip threshold (BYTES, not chars).
#   2. overflow     — no fixed pixel width past the declared container.
#   3. orphan-link  — no empty or placeholder hrefs.
#   4. CTA-parity   — links sharing a visible label resolve to ONE destination.
#   5. module-drift — every module matches the master's skeleton, or cites a
#                     ruling in build/drift-allowlist.tsv. Delegates to
#                     build/drift-check.sh.
#   6. gmail-first  — constructs the dominant client will not render are
#                     DROPPED, not degraded.
#   7. statistics   — every quoted figure has a receipt. Delegates to
#                     build/check-claims.sh (orbit_init_verified_claims).
#
# HONEST SCOPE: this is the LAYOUT / STRUCTURE gate. It does NOT reproduce
# send-time truth — a blank dynamic token, string-vs-boolean truthiness, or how
# an inbox actually renders. The render / inbox QA gate owns that (run
# orbit_qa_email + orbit_render_email_preview on the exact compiled HTML before
# a real send). Passing this gate is necessary, not sufficient.
#
# Stages 5 and 7 depend on files this brain may not have yet. A missing
# dependency is reported as UNENFORCED and downgrades the verdict to PASS WITH
# WARNINGS — never a clean pass. A gate that reports green over a law it never
# ran is the defect these stages exist to prevent.
#
# A templating-bearing email must be RESOLVED off one shared variable map and
# each branch gated separately — resolve every branch, never strip. Compile and
# resolve upstream of this script, then run the gate once per resolved branch.
# This script has no templating engine of its own and will happily pass a
# document whose branches were never varied.
#
# Orbit's \`orbit_liquid_state_matrix\` does that resolution. By default it
# renders every state INTERNALLY and returns only axes, counts and findings —
# no documents — so pass \`write_states_to\` to get the branch files this gate
# needs, then loop:
#
#   orbit_liquid_state_matrix(html=<compiled>, write_states_to="build/states")
#   for f in build/states/state-*.html; do build/gate.sh "\$f" || exit 1; done
#
# Usage: build/gate.sh <compiled-email.html>
#
# EXIT CODES — four states, because three of them are not "pass":
#   0  PASS                every stage ran and every stage was clean.
#   1  BLOCKED             a stage failed. Do not send this.
#   2  NOT CHECKED         the input could not be parsed or a dependency is
#                          unusable. Nothing was measured, so nothing passed.
#   3  PASS WITH WARNINGS  the stages that ran were clean, but one or more laws
#                          were UNENFORCED. \`|| exit 1\` treats this as a failure,
#                          which is the point; special-case 3 only if you have
#                          decided to ship with a law switched off.

set -uo pipefail

CLIP_BYTES=${clipBytes}            # ${clipKb} KB clip threshold
MOBILE_WIDTH=${mobileWidth}        # mobile viewport width, px (reported, not the overflow bar)
CONTAINER_WIDTH=${containerWidth}  # declared email container width, px — the overflow bar
MASTER_TOKEN="${masterName}"       # BASENAMES containing this are size-exempt (library, not a send)
MASTER_TEMPLATE="${masterTemplate}"   # repo-relative canonical master, for the drift stage
GMAIL_FIRST=${gmailFirst ? 1 : 0}                     # 1 = enforce the single-tier rule

HERE="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT="\$(dirname "\$HERE")"

FILE="\${1:-}"
if [[ -z "\$FILE" || ! -f "\$FILE" ]]; then
  echo "gate: usage: build/gate.sh <compiled-email.html>" >&2
  exit 2
fi

# ── 0. precondition ───────────────────────────────────────────────
# Stages 1-4 are ABSENCE checks, so an absent document passes all of
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
# layout widths. Stages 2-4 read FLAT, never the raw file. Stage 6 is the
# exception and reads the RAW file on purpose — a <style> block Gmail will
# not honour is exactly what that stage is looking for.
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
      # An UNBALANCED open tag used to "return out" — silently discarding
      # everything after it. Stages 2-4 then measured a truncated document and
      # reported three PASSes on an email whose oversized table, dead href and
      # colliding label all sat in the discarded half. Absence checks over a
      # buffer that stops early are absence checks over nothing.
      if (j == 0) { UNBAL = 1; return out }
      s = substr(s, j + length(shutTok))
    }
    return out s
  }
  { gsub(/\\t/, " "); buf = buf \$0 " " }
  END {
    # Comments first. A prose line reading "do not add a <style block here"
    # is not an unbalanced tag, and diagnosing it as one sends the author
    # hunting a tag that does not exist — a wrong diagnosis costs more than
    # no diagnosis, because it is followed.
    while ((ci = index(buf, "<!--")) > 0) {
      cj = index(substr(buf, ci), "-->")
      if (cj == 0) { buf = substr(buf, 1, ci - 1); break }
      buf = substr(buf, 1, ci - 1) " " substr(buf, ci + cj + 2)
    }
    gsub(/<\\/[ ]*style[ ]*>/, "</style>", buf)
    gsub(/<\\/[ ]*script[ ]*>/, "</script>", buf)
    buf = cut(buf, "<style", "</style>")
    buf = cut(buf, "<script", "</script>")
    if (UNBAL) { print "@@UNBALANCED@@"; exit }
    print buf
  }
' "\$FILE")"; then
  echo "gate: NOT CHECKED — could not parse \$FILE into markup. Stages 1-4 are absence checks, so reporting PASS here would be a lie." >&2
  exit 2
fi
# Unbalanced FIRST. The length floor below would otherwise swallow it — the
# sentinel is short, so a generic "could not parse" masked the one diagnosis
# that tells the author exactly which tag to go and close.
if [[ "\$FLAT" == "@@UNBALANCED@@"* ]]; then
  echo "gate: NOT CHECKED — \$FILE has an unbalanced <style or <script: an opening tag with no closing tag. Everything after it is unparseable, and stages 1-4 are absence checks, so a PASS over the readable half would be a lie. Close the tag, or check whichever step wrote the file." >&2
  exit 2
fi
# Length, not a \${FLAT//…/} scrub: bash pattern substitution over a
# few hundred KB of flattened markup takes minutes.
if (( \${#FLAT} < 100 )); then
  echo "gate: NOT CHECKED — \$FILE flattened to almost nothing. Stages 1-4 are absence checks, so reporting PASS here would be a lie." >&2
  exit 2
fi

# A SECOND buffer: newlines collapsed, but <style>/<script> LEFT IN. Stage 6 is
# hunting for exactly the constructs the flattener deliberately removes, and it
# used to grep the raw file line by line — so a compiler that wrapped
# \`<script\\n  type="...">\` across two lines hid it from every pattern. The
# flatten comment above says compilers do that; stage 6 was simply not reading
# the same document as everyone else.
# Guarded exactly like FLAT. It was not, and an empty RAW_FLAT makes stage 6 —
# which is nothing but absence checks over that buffer — report PASS on an
# email full of the constructs it exists to catch. That is the same fail-to-fail
# this whole change removes, reintroduced twenty lines inside the fix for it.
if ! RAW_FLAT="\$(awk '{ gsub(/\\t/, " "); buf = buf \$0 " " } END { print buf }' "\$FILE")" \\
  || (( \${#RAW_FLAT} < 100 )); then
  echo "gate: NOT CHECKED — could not build the raw buffer stage 6 reads from \$FILE. Stage 6 is an absence check, so reporting PASS over an empty buffer would be a lie." >&2
  exit 2
fi

# (label TAB href) for every anchor, single- or double-quoted, however the
# compiler wrapped its attributes.
anchor_pairs() {
  printf '%s' "\$FLAT" | awk -v Q="\\"'" '
    # Index of the ">" that really closes an opening tag — one that is not
    # inside a quoted attribute value. A plain /[^>]*>/ slice ends the tag at
    # the first ">" it sees, so title="Save > 50%" cut the tag in half and
    # folded the href into the visible label. Two CTAs with different
    # destinations then had different labels, and CTA-parity passed.
    function tagend(s,   i, c, q) {
      q = ""
      for (i = 1; i <= length(s); i++) {
        c = substr(s, i, 1)
        if (q != "") { if (c == q) q = ""; continue }
        if (c == "\\"" || c == "'"'"'") { q = c; continue }
        if (c == ">") return i
      }
      return 0
    }
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
        k = tagend(body)
        if (k > 0) body = substr(body, k + 1)
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
# Matched on a NAME SEGMENT of the basename, not a substring of it. Scoping to
# the basename stopped a "mastercard" FOLDER exempting a real send, and then
# left the identical hole one level down: mastercard-launch.html still contains
# the token, so a 1 MB campaign skipped the clip law entirely — silently, since
# the exemption prints SKIP rather than a warning. Split the stem on the
# separators filenames actually use and require a whole segment to match.
# The exemption names ONE file: the master this gate was pointed at. Two
# looser rules preceded it and both let a real send through. A basename
# SUBSTRING exempted mastercard-launch.html. A name SEGMENT then exempted
# master-template-assembled.html — which is exactly what the documented
# ingest path produces, because learn_email_template defaults its slug to
# "master-template" and the assembler appends "-assembled". The library is a
# specific file at a known path; matching its basename is the whole question.
base=\$(basename "\$FILE")
stem="\$(printf '%s' "\${base%.*}" | tr '[:upper:]' '[:lower:]')"
token="\$(printf '%s' "\$MASTER_TOKEN" | tr '[:upper:]' '[:lower:]')"
master_base="\$(basename "\$MASTER_TEMPLATE")"
# The rule: the file this gate was POINTED at is always the library, and
# otherwise the stem must OPEN with the token and carry at most one more
# segment. master.html, master-template.html and master-library.html are
# libraries; mastercard-launch.html never opens with the token, and
# master-template-assembled.html — what the documented ingest path actually
# writes — carries a third segment and is a send.
seg_count=\$(printf '%s' "\$stem" | tr '\\-._' '   ' | wc -w | tr -d ' ')
first_seg=\$(printf '%s' "\$stem" | tr '\\-._' '   ' | awk '{print \$1}')
if [[ "\$base" == "\$master_base" ]] || { [[ "\$first_seg" == "\$token" ]] && (( seg_count <= 2 )); }; then
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
# Both quote styles. The HTML-attribute form is the one form tables use, and
# a single-quoted width='900' walked straight past a double-quote-only match.
wide=\$(printf '%s' "\$FLAT" | grep -oiE "width[:=][\\"']?[[:space:]]*[0-9]+" \\
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

# ── 5. module-drift ───────────────────────────────────────────────
# Drift is a FAIL, not a judgement call. Delegated to build/drift-check.sh so
# the same comparison can be run on one file by hand. An eyeballed pass is the
# failure mode this stage exists to remove: "it looks right" is how a module
# ships missing the one element that made it that module.
if [[ ! -x "\$HERE/drift-check.sh" && ! -f "\$HERE/drift-check.sh" ]]; then
  note "module-drift" "UNENFORCED — build/drift-check.sh is missing. Re-run orbit_generate_brain_gate."
  warn=1
elif [[ ! -f "\$ROOT/\$MASTER_TEMPLATE" ]]; then
  note "module-drift" "UNENFORCED — no master at \$MASTER_TEMPLATE, so there is nothing to diff against. Put your canonical master there (orbit_learn_email_template derives one from an email you already send). Until then this law is NOT being checked."
  warn=1
else
  drift_out="\$(bash "\$HERE/drift-check.sh" "\$FILE" 2>&1)"
  drift_rc=\$?
  printf '%s\\n' "\$drift_out" | sed 's/^/gate:   /'
  if (( drift_rc == 1 )); then
    note "module-drift" "FAIL — see drift-check output above."
    fail=1
  elif (( drift_rc != 0 )); then
    note "module-drift" "UNENFORCED — drift-check could not run (exit \$drift_rc). Reporting PASS here would be a lie."
    warn=1
  else
    note "module-drift" "PASS — every module matches the master, or cites a ruling."
  fi
fi

# ── 6. gmail-first ────────────────────────────────────────────────
# One tier. Anything the dominant webmail client will not render is DROPPED,
# not degraded — a treatment that only works for a minority of the list is a
# treatment two-thirds of the list sees broken. Read against the RAW file:
# the flattened buffer has already removed the <style> block, which is where
# half of these live.
#
# This is a CATEGORICAL list of constructs with no support, not a compatibility
# lab. It cannot tell you a supported construct renders correctly — send a real
# test and look. Font declarations are the documented exemption: a webfont is
# allowed as long as it degrades to a declared fallback.
if (( GMAIL_FIRST )); then
  gm=""
  # Every bullet carries the "gate:" prefix the rest of the run honours. The
  # fix list used to be interpolated raw into one note, so the only actionable
  # part of a failure was also the only part that broke the output's contract —
  # a \`grep '^gate:'\` scrape dropped it entirely.
  add_gm() { gm="\${gm}\$1
"; }
  # Every pattern below reads RAW_FLAT, not the file. Line-oriented greps could
  # not see an opening tag whose attributes wrap onto the next line — the exact
  # wrapping the flatten comment above says real compilers produce — so stage 6
  # was the one stage reading a different document from every other stage, and
  # it passed unsupported constructs whole.
  gmg() { printf '%s' "\$RAW_FLAT" | grep -qiE "\$1"; }
  # A stylesheet <link> is stripped — but the webfont link every MJML-class
  # compiler emits by default is the documented FONT exemption, and failing on
  # it would fail every correctly-compiled email in the repo. Font providers
  # are exempt; a link carrying LAYOUT css is not.
  if printf '%s' "\$RAW_FLAT" | grep -oiE '<link[^>]+>' | grep -i 'stylesheet' \
    | grep -viE 'fonts?\.|/fonts?/|typekit|font-face' | grep -q .; then
    add_gm "external <link rel=stylesheet> carrying layout CSS — stripped. Inline the styles, or drop the treatment. (Webfont links are exempt; the fallback-family check below covers those.)"
  fi
  gmg '<script[[:space:]>]' && add_gm "<script> — stripped. Nothing interactive survives; drop it."
  gmg '<(iframe|object|embed|video|audio)[[:space:]>]' && add_gm "embedded media (<iframe>/<object>/<embed>/<video>/<audio>) — stripped. Use a still image linking out."
  gmg '<(form|input|select|textarea)[[:space:]>]' && add_gm "form controls — stripped. Link to a hosted form instead."
  gmg '<svg[[:space:]>]' && add_gm "inline <svg> — stripped. Export the glyph as PNG."
  gmg 'position[[:space:]]*:[[:space:]]*(absolute|fixed)' && add_gm "position:absolute/fixed — unsupported. Rebuild the overlay as stacked table rows."
  gmg 'display[[:space:]]*:[[:space:]]*(inline-)?(flex|grid)' && add_gm "flexbox / grid — unsupported. Use tables for layout."
  gmg 'var\\(--' && add_gm "CSS custom properties (var(--x)) — unsupported, and the fallback is the literal declaration being dropped. Write the value."
  gmg 'margin[a-z-]*[[:space:]]*:[^;\\"'"'"']*-[0-9]' && add_gm "negative margin — stripped. The layout it was pulling back will sit where it falls."
  # Font fallbacks are the one documented exemption — but only when a fallback
  # is actually declared. A single-family stack degrades to the client default,
  # which is the degrade this rule exists to forbid.
  bare_font=\$(printf '%s' "\$RAW_FLAT" | grep -oiE "font-family[[:space:]]*:[^;\\"'}]*" \
    | grep -viE '(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit)' \
    | grep -v ',' | head -3)
  [[ -n "\$bare_font" ]] && add_gm "font-family with no generic fallback: \$(echo "\$bare_font" | tr '\\n' ';') — the webfont will not load; declare a fallback family."

  if [[ -n "\$gm" ]]; then
    gm_count=\$(printf '%s' "\$gm" | grep -c .)
    note "gmail-first" "FAIL — \$gm_count construct(s) the dominant client will not render:"
    printf '%s' "\$gm" | grep . | sed 's/^/gate:   - /'
    fail=1
  else
    note "gmail-first" "PASS — no categorically-unsupported construct. (Support is not correctness: still send a real inbox test.)"
  fi
else
  note "gmail-first" "SKIP — single-tier enforcement is switched off for this brain."
fi

# ── 7. statistics ─────────────────────────────────────────────────
# A figure presented as a statistic must trace to a verified source, or the
# module carrying it is dropped. Delegated to check-claims.sh, which owns the
# receipt file's format.
if [[ -f "\$HERE/check-claims.sh" ]]; then
  claims_out="\$(bash "\$HERE/check-claims.sh" "\$FILE" 2>&1)"
  claims_rc=\$?
  printf '%s\\n' "\$claims_out" | sed 's/^/gate:   /'
  if (( claims_rc == 1 )); then
    note "statistics" "FAIL — see check-claims output above. Get a receipt, or drop the module."
    fail=1
  elif (( claims_rc != 0 )); then
    note "statistics" "UNENFORCED — check-claims could not run (exit \$claims_rc)."
    warn=1
  else
    note "statistics" "PASS — every quoted figure has a receipt."
  fi
else
  note "statistics" "UNENFORCED — build/check-claims.sh is missing, so nothing is checking the numbers in this email. Run orbit_init_verified_claims to wire it."
  warn=1
fi

# ── verdict ───────────────────────────────────────────────────────
if (( fail )); then
  echo "gate: BLOCKED — failures above. Not shippable." >&2
  exit 1
fi
if (( warn )); then
  # Exit 3, not 0. This script's own header teaches \`gate.sh "\$f" || exit 1\`,
  # and for as long as an unenforced law exited 0 that recipe could not tell a
  # gate that checked seven laws from one that checked five — on a freshly
  # bootstrapped brain, which is every new user, two laws are unenforced and the
  # pipeline went green. A distinct non-zero code means the documented recipe
  # catches it, while a caller who has genuinely decided to proceed can still
  # special-case 3 rather than swallowing every failure.
  echo "gate: PASS WITH WARNINGS (exit 3) — one or more laws above are UNENFORCED. Nothing checked them, so this is not a pass over them; wire them before you rely on this gate." >&2
  exit 3
fi
echo "gate: PASS — layout/structure clean. Run the render/inbox QA gate before sending."
`;
}

// ── The drift check ───────────────────────────────────────────────

function buildDriftScript({ masterTemplate }) {
  return `#!/usr/bin/env bash
# drift-check.sh — module drift is a FAIL, not a judgement call.
#
# Compares every module in a composed email against the SAME module in the
# canonical master, and fails on any structural difference that is not
# allowlisted with a written ruling.
#
# Two laws, one comparison:
#
#   Module drift    — a module whose skeleton differs from the master's has
#                     drifted. Divergence is legal ONLY as an allowlist entry
#                     citing a ruling. "It looks fine" is not a ruling: that
#                     judgement is what ships a module missing the one element
#                     that made it that module.
#   Compose from    — a module label the master does not have was composed from
#   the master        memory, not copied from the library. Same defect, earlier.
#
# WHAT A "SKELETON" IS. Tag sequence, attribute names, and the values of the
# PRESENTATION attributes (style, class, bgcolor, align, valign, width, height,
# border, cellpadding, cellspacing, role, colspan, rowspan). Text, href, src and
# alt are deliberately excluded — copy and destinations are supposed to change
# per send; padding, colour and structure are not.
#
# WHAT IT CANNOT SEE. It compares documents, not renders: a module can match its
# master skeleton exactly and still look wrong in an inbox. It also cannot see a
# module that was left out entirely — a composed email is allowed to use any
# subset of the library. Composition completeness belongs in the program spec.
#
# MODULE MARKERS. Modules are delimited by the markers Orbit's assembler emits:
#
#   <!-- MODULE: hero -->  ...  <!-- /MODULE: hero -->
#
# A file with no markers is NOT CHECKED (exit 2), never a pass. Nesting is not
# supported: the first closing marker after an opening one closes it.
#
# Usage: build/drift-check.sh <composed-email.html> [master] [allowlist]
# Exit:  0 clean · 1 drift · 2 could not check

set -uo pipefail

HERE="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
ROOT="\$(dirname "\$HERE")"

FILE="\${1:-}"
MASTER="\${2:-\$ROOT/${masterTemplate}}"
ALLOWLIST="\${3:-\$HERE/drift-allowlist.tsv}"

if [[ -z "\$FILE" || ! -f "\$FILE" ]]; then
  echo "drift-check: usage: build/drift-check.sh <composed-email.html> [master] [allowlist]" >&2
  exit 2
fi
if [[ ! -f "\$MASTER" ]]; then
  echo "drift-check: NOT CHECKED — no master at \$MASTER. There is nothing to diff against, so a PASS here would mean nothing." >&2
  exit 2
fi

# A hash, from whatever this machine has. No hasher means no comparison —
# and no comparison must never read as a pass.
if command -v sha256sum >/dev/null 2>&1; then
  hashit() { sha256sum | awk '{print substr(\$1,1,12)}'; }
elif command -v shasum >/dev/null 2>&1; then
  hashit() { shasum -a 256 | awk '{print substr(\$1,1,12)}'; }
elif command -v openssl >/dev/null 2>&1; then
  hashit() { openssl dgst -sha256 | awk '{print substr(\$NF,1,12)}'; }
else
  echo "drift-check: NOT CHECKED — no sha256sum, shasum or openssl on this machine." >&2
  exit 2
fi

# Emit "label<TAB>skeleton" for every marked module in a file.
skeletons_raw() {
  awk '
    # Normalise one tag: name, attribute names, presentation values only.
    function normtag(t,   res, i, c, name, val, q, n, an, akey, aval, p, kk, vv) {
      an = 0
      sub(/^[ \\t\\r\\n]+/, "", t)
      n = ""; i = 1
      while (i <= length(t) && substr(t, i, 1) ~ /[A-Za-z0-9\\/!-]/) { n = n substr(t, i, 1); i++ }
      res = tolower(n)
      while (i <= length(t)) {
        c = substr(t, i, 1)
        if (c ~ /[ \\t\\r\\n]/) { i++; continue }
        name = ""
        while (i <= length(t) && substr(t, i, 1) !~ /[ \\t\\r\\n=>\\/]/) { name = name substr(t, i, 1); i++ }
        if (name == "") { i++; continue }
        name = tolower(name)
        val = ""
        while (i <= length(t) && substr(t, i, 1) ~ /[ \\t\\r\\n]/) i++
        if (substr(t, i, 1) == "=") {
          i++
          while (i <= length(t) && substr(t, i, 1) ~ /[ \\t\\r\\n]/) i++
          q = substr(t, i, 1)
          if (q == "\\"" || q == "'"'"'") {
            i++
            while (i <= length(t) && substr(t, i, 1) != q) { val = val substr(t, i, 1); i++ }
            i++
          } else {
            while (i <= length(t) && substr(t, i, 1) !~ /[ \\t\\r\\n>]/) { val = val substr(t, i, 1); i++ }
          }
        }
        if (name ~ /^(style|class|bgcolor|align|valign|width|height|border|cellpadding|cellspacing|role|colspan|rowspan)\$/) {
          gsub(/url\\([^)]*\\)/, "url()", val)
          gsub(/[ \\t\\r\\n]+/, " ", val)
          sub(/^ /, "", val); sub(/ \$/, "", val)
          val = (name == "style") ? canonstyle(val) : tolower(val)
          an++; akey[an] = name; aval[an] = name "=" val
        } else {
          an++; akey[an] = name; aval[an] = name
        }
      }
      # Emit attributes in NAME ORDER, not source order. An attribute reorder is
      # not drift, and any tool that rewrites markup — the Orbit juice-based
      # inliner among them — reorders freely. Hashing source order meant every
      # module of a real exported email failed, which is a gate that fires on
      # everything and therefore on nothing.
      for (p = 2; p <= an; p++) {
        kk = akey[p]; vv = aval[p]; q = p - 1
        while (q >= 1 && akey[q] > kk) { akey[q+1] = akey[q]; aval[q+1] = aval[q]; q-- }
        akey[q+1] = kk; aval[q+1] = vv
      }
      for (p = 1; p <= an; p++) res = res " " aval[p]
      return res
    }

    # A style attribute is a SET of declarations, not a string. Whitespace after
    # a colon, declaration order and a trailing semicolon are all free variation
    # that any rewriter introduces; treating them as identity made the allowlist
    # a store you must rekey after every build, which is a store people delete.
    # Split, trim, drop empties, sort, rejoin.
    function canonstyle(v,   n, i, j, k, t, key, parts, tmp, out) {
      n = split(v, parts, ";")
      j = 0
      for (i = 1; i <= n; i++) {
        t = parts[i]
        gsub(/^[ \\t]+|[ \\t]+\$/, "", t)
        if (t == "") continue
        sub(/[ \\t]*:[ \\t]*/, ":", t)
        gsub(/[ \\t]+/, " ", t)
        j++; tmp[j] = tolower(t)
      }
      for (i = 2; i <= j; i++) {
        key = tmp[i]; k = i - 1
        while (k >= 1 && tmp[k] > key) { tmp[k+1] = tmp[k]; k-- }
        tmp[k+1] = key
      }
      out = ""
      for (i = 1; i <= j; i++) out = out tmp[i] ";"
      return out
    }

    # Normalise a module body to its skeleton: tags only, no text nodes.
    function skeleton(s,   out, i, j, tag) {
      # Downlevel-hidden conditionals FIRST. The generic comment strip below
      # looks for the next "-->", which inside <!--[if mso]> ... <![endif]--> is
      # the one that closes the whole block — so the entire Outlook fallback,
      # tables and all, was deleted before hashing. Deleting the complete mso
      # fallback from a module compared equal to the master and reported PASS.
      gsub(/<!--\\[[^]]*\\]>/, " ", s)
      gsub(/<!\\[endif\\]-->/, " ", s)
      while ((i = index(s, "<!--")) > 0) {
        j = index(substr(s, i), "-->")
        if (j == 0) { s = substr(s, 1, i - 1); break }
        s = substr(s, 1, i - 1) " " substr(s, i + j + 2)
      }
      out = ""
      while ((i = index(s, "<")) > 0) {
        s = substr(s, i + 1)
        j = index(s, ">")
        if (j == 0) break
        tag = substr(s, 1, j - 1)
        s = substr(s, j + 1)
        out = out normtag(tag) "|"
      }
      return out
    }

    { gsub(/\\t/, " "); buf = buf \$0 "\\n" }
    END {
      s = buf
      while ((i = index(s, "<!-- MODULE:")) > 0) {
        s = substr(s, i + 12)
        j = index(s, "-->")
        if (j == 0) break
        label = substr(s, 1, j - 1)
        gsub(/^[ \\t\\r\\n]+|[ \\t\\r\\n]+\$/, "", label)
        s = substr(s, j + 3)
        k = index(s, "<!-- /MODULE:")
        if (k == 0) {
          printf "%s\\t!UNCLOSED\\n", tolower(label)
          break
        }
        body = substr(s, 1, k - 1)
        s = substr(s, k + 13)
        printf "%s\\t%s\\n", tolower(label), skeleton(body)
      }
    }
  ' "\$1"
}

# ...and hash each skeleton so the allowlist can pin one exact shape.
skeletons() {
  skeletons_raw "\$1" | while IFS=\$'\\t' read -r label skel; do
    if [[ "\$skel" == "!UNCLOSED" ]]; then
      printf '%s\\t!UNCLOSED\\n' "\$label"
    else
      printf '%s\\t%s\\n' "\$label" "\$(printf '%s' "\$skel" | hashit)"
    fi
  done
}

MASTER_SK="\$(skeletons "\$MASTER")"
CAND_SK="\$(skeletons "\$FILE")"

if [[ -z "\$MASTER_SK" ]]; then
  echo "drift-check: NOT CHECKED — the master at \$MASTER carries no <!-- MODULE: --> markers, so it is not a module library. Mark its modules, or point MASTER at the file that is." >&2
  exit 2
fi
if [[ -z "\$CAND_SK" ]]; then
  echo "drift-check: NOT CHECKED — \$FILE carries no <!-- MODULE: --> markers. Compose it from the master (orbit_assemble_email_template_from_components emits the markers) or add them by hand. An unmarked file cannot be compared, and must not read as clean." >&2
  exit 2
fi
if grep -q '!UNCLOSED' <<< "\$MASTER_SK\$CAND_SK"; then
  echo "drift-check: NOT CHECKED — an opening <!-- MODULE: --> marker has no matching <!-- /MODULE: -->:" >&2
  grep '!UNCLOSED' <<< "\$MASTER_SK
\$CAND_SK" | sed 's/^/  /' >&2
  exit 2
fi

# The allowlist: module <TAB> skeleton-hash <TAB> ruling <TAB> note.
# An entry with no ruling is itself a failure — an allowlist that does not say
# WHY is just the check switched off, one line at a time.
allow_lookup() { # \$1 label, \$2 candidate hash, \$3 master hash -> prints the ruling
  [[ -f "\$ALLOWLIST" ]] || return 0
  awk -F'\\t' -v l="\$1" -v h="\$2" -v m="\$3" '
    /^[[:space:]]*(#|\$)/ { next }
    { for (c = 1; c <= 4; c++) gsub(/^[ \\t]+|[ \\t]+\$/, "", \$c) }
    tolower(\$1) == tolower(l) && \$2 == h && \$3 == m { print \$4; exit }
  ' "\$ALLOWLIST"
}

drift=0
allowed=0
checked=0

while IFS=\$'\\t' read -r label hash; do
  [[ -z "\$label" ]] && continue
  checked=\$((checked + 1))
  master_hash="\$(awk -F'\\t' -v l="\$label" 'tolower(\$1) == tolower(l) { print \$2; exit }' <<< "\$MASTER_SK")"

  if [[ -z "\$master_hash" ]]; then
    echo "drift-check: FAIL [\$label] — no such module in the master. This was composed from memory, not copied from the library. Add it to the master first, or use the module that already exists." >&2
    drift=1
    continue
  fi
  if [[ "\$hash" == "\$master_hash" ]]; then
    continue
  fi

  # Keyed on BOTH hashes. A ruling pinned only to the candidate kept blessing
  # that divergence after the master moved underneath it — so a decision made
  # about one difference silently authorised a completely different one, and
  # the stale detector could not see it either.
  ruling="\$(allow_lookup "\$label" "\$hash" "\$master_hash")"
  ruling="\$(printf '%s' "\$ruling" | tr -d '\\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*\$//')"
  case "\$(printf '%s' "\$ruling" | tr '[:upper:]' '[:lower:]')" in
    ""|"todo"|"tbd"|"-"|"n/a"|"na"|"none")
      if [[ -z "\$ruling" ]]; then
        echo "drift-check: FAIL [\$label] — drifted from the master (skeleton \$hash, master \$master_hash) and is not allowlisted. Recopy the module from the master, or add this line to \$(basename "\$ALLOWLIST") with the ruling that permits it:  \$label<TAB>\$hash<TAB>\$master_hash<TAB><ruling><TAB><note>" >&2
      else
        echo "drift-check: FAIL [\$label] — allowlisted with no ruling (\\"\$ruling\\"). An allowlist entry that does not say WHY is the check switched off. Cite the decision that permitted it." >&2
      fi
      drift=1
      ;;
    *)
      echo "drift-check: ALLOWED [\$label] — diverges from the master, permitted by: \$ruling"
      allowed=\$((allowed + 1))
      ;;
  esac
done <<< "\$CAND_SK"

# An allowlist entry whose hash matches nothing is stale. It is not a failure —
# it is a line that will silently permit nothing, and would go on looking like
# coverage forever.
if [[ -f "\$ALLOWLIST" ]]; then
  while IFS=\$'\\t' read -r a_label a_hash a_master a_rest; do
    [[ -z "\${a_label:-}" || "\$a_label" == \\#* ]] && continue
    if ! grep -qi "^\$a_label"\$'\\t'"\$a_hash\$" <<< "\$CAND_SK"; then
      : # only report against the file we were given if the label IS present
      if grep -qi "^\$a_label"\$'\\t' <<< "\$CAND_SK"; then
        echo "drift-check: STALE — allowlist line [\$a_label \$a_hash] no longer matches that module's skeleton. The divergence it blessed has changed shape; re-rule it or delete the line."
      fi
    fi
  done < "\$ALLOWLIST"
fi

if (( drift )); then
  echo "drift-check: BLOCKED — \$checked module(s) checked, drift above." >&2
  exit 1
fi
echo "drift-check: PASS — \$checked module(s) match the master (\$allowed allowlisted divergence(s))."
`;
}

function buildAllowlistSeed() {
  return `# drift-allowlist.tsv — the ONLY legal home for a module that diverges from the master.
#
# Tab-separated. FIVE columns:
#
#   module <TAB> skeleton-hash <TAB> master-hash <TAB> ruling <TAB> note
#
#   module        the label inside its <!-- MODULE: … --> marker, lower-case.
#   skeleton-hash the 12-char hash of YOUR module, as drift-check.sh printed it.
#   master-hash   the 12-char hash of the MASTER's module in the same failure.
#                 Both are required: a ruling names a difference between two
#                 specific shapes. Pinned to the candidate alone, a decision
#                 about one divergence goes on authorising a different one the
#                 moment the master changes underneath it.
#   ruling        WHERE the decision is written down — e.g. "decisions-log.md#r12".
#                 An entry with no ruling, or TODO / TBD / n/a, FAILS the check.
#                 An allowlist that does not say why is not an allowlist.
#   note          one line of prose, for the person who reads this in six months.
#
# Nothing here is retroactive. Adding a line permits ONE shape of ONE module, and
# only until that shape changes.
#
# module	skeleton-hash	ruling	note
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

/**
 * A repo-RELATIVE path, kept inside the repo. The generated scripts interpolate
 * this into bash, so a value carrying quotes, `$`, backticks or `..` is not a
 * bad path — it is a shell injection into a file the user is told to run.
 */
function sanitiseRelPath(value, fallback) {
  const raw = String(value ?? "").trim().replace(/^[./]+/, "");
  if (raw.length === 0) return fallback;
  const cleaned = raw
    .split("/")
    .filter((seg) => seg.length > 0 && seg !== "." && seg !== "..")
    .map((seg) => seg.replace(/[^a-zA-Z0-9._-]+/g, ""))
    .filter((seg) => seg.length > 0)
    .join("/");
  return cleaned.length > 0 ? cleaned : fallback;
}

export {
  DEFAULT_CLIP_KB,
  DEFAULT_MOBILE_WIDTH,
  DEFAULT_CONTAINER_WIDTH,
  DEFAULT_MASTER_NAME,
  DEFAULT_MASTER_TEMPLATE,
};
