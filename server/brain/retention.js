/**
 * Template Brain — retention policy.
 *
 * A brain repo accretes renders. Compiled HTML, preview PNGs, screenshot
 * captures, generated art: all of it lands next to the knowledge, and none of
 * it is the knowledge. Left alone the ratio inverts — the markdown that IS the
 * brain becomes a rounding error next to the pixels, every clone pays for it,
 * and the derived knowledge graph fills up with process scratch until it stops
 * being able to answer anything.
 *
 * Three rules, emitted as files a repo can actually enforce:
 *
 *   1. A RENDER NEVER ENTERS GIT. Enforced at commit time by a pure-bash hook —
 *      no pip, no pre-commit framework, nothing to install but git itself.
 *   2. "REGENERABLE" MUST BE PROVED, not assumed. The prune auditor deletes a
 *      file only when a recipe in the policy matches it AND that recipe's source
 *      still exists on disk. No recipe, or a recipe whose source is gone, means
 *      the file stays and is reported for review.
 *   3. CAPTURES OF LIVE PLATFORM STATE ARE EVIDENCE. A screenshot of a vendor
 *      dashboard on a Tuesday cannot be re-taken on Wednesday — the dashboard
 *      moved. Evidence is never auto-pruned at any age, and is marked as such in
 *      the policy rather than left to a reviewer's judgement.
 *
 * The policy is TSV, not JSON, for one reason: the auditor that reads it is
 * bash, and a repo whose safety check needs `jq` installed is a repo whose
 * safety check does not run. Tab-separated is parseable by awk everywhere.
 *
 * Pure local file generation — no network, no activation gate. The two scripts
 * are generated (rewritten in place on upgrade, never over a human's edits);
 * the policy TSV is user content and is never overwritten.
 *
 * ALL generated content is customer-neutral.
 */

import fs from "node:fs";
import path from "node:path";

import { writeGenerated, writeSkip } from "./verified-claims.js";

const DEFAULT_MAX_MB = 1;
const DEFAULT_PRUNE_DAYS = 60;

/**
 * Write the retention policy, the commit hook installer and the prune auditor
 * into an existing brain repo.
 *
 * @param {string} root  Brain repo root (already resolved + created).
 * @param {object} result  Accumulator carrying created/skipped/upgraded/…
 * @returns {{ retention_policy, install_hooks, prune_audit, max_mb, prune_days }}
 */
export function installRetention(root, result) {
  const policyPath = path.join(root, "scripts", "retention-policy.tsv");
  writeSkip(policyPath, buildRetentionPolicy(), result);

  writeSkip(path.join(root, "RETENTION.md"), buildRetentionDoc(), result);

  const hooksPath = path.join(root, "scripts", "install-hooks.sh");
  if (writeGenerated(hooksPath, buildInstallHooks(), result, "hooks")) {
    fs.chmodSync(hooksPath, 0o755);
  }

  const prunePath = path.join(root, "scripts", "prune-audit.sh");
  if (writeGenerated(prunePath, buildPruneAudit(), result, "prune")) {
    fs.chmodSync(prunePath, 0o755);
  }

  return {
    retention_policy: policyPath,
    install_hooks: hooksPath,
    prune_audit: prunePath,
    max_mb: DEFAULT_MAX_MB,
    prune_days: DEFAULT_PRUNE_DAYS,
  };
}

// ── The policy ────────────────────────────────────────────────────

function buildRetentionPolicy() {
  return `# retention-policy.tsv — what may be deleted, and what proves it is safe.
#
# Tab-separated. Three columns:
#
#   path-glob <TAB> recipe <TAB> source-glob
#
#   path-glob    a shell glob, repo-relative, matching the artifacts.
#   recipe       the command that regenerates them — REGENERABLE means the file
#                is an output and can be rebuilt. The literal token EVIDENCE
#                means the opposite: this is a capture of live platform state and
#                can NEVER be re-taken. Evidence is never auto-pruned at any age.
#   source-glob  what the recipe needs. prune-audit.sh will not delete a file
#                whose source no longer exists — a recipe you cannot run is not
#                a recipe. Write "-" for EVIDENCE rows.
#
# The rule this file exists to enforce: "regenerable" must be PROVED, not
# assumed. Anything with no matching row is reported REVIEW and never deleted.
#
# Edit this file, not the auditor.
#
# path-glob	recipe	source-glob
# WHICH PATHS BELONG HERE. This policy governs files that ARE COMMITTED and age
# out: dated render galleries, design reviews, audit output. Paths that are
# gitignored (build/compiled/, build/preview/, build/states/) are the commit
# hook's job — they never enter git, so there is nothing here to prune, and a
# row pointing at one can never fire. Those three rows used to be the shipped
# default, which made the auditor's delete path unreachable by construction.
design/*/renders/*.png	your renderer, e.g. a headless-browser screenshot script	templates/*.html
reviews/*/renders/*.png	your renderer, e.g. a headless-browser screenshot script	templates/*.html
build/renders/*.png	your renderer, e.g. a headless-browser screenshot script	templates/*.html
#
# EVIDENCE — captures of live platform state. Never auto-pruned.
# No ** here either: the path-glob column is matched as a shell case pattern,
# where a single * already crosses /. ** was never a different set, only a
# different-looking one.
evidence/*	EVIDENCE	-
assets/images/*	EVIDENCE	-
`;
}

function buildRetentionDoc() {
  return `# Retention policy

How this brain stays small enough to clone and cheap enough to read.

The markdown in here is the brain. Everything else — compiled HTML, preview
images, generated art — is output. Output outweighs knowledge quickly and
quietly: it is bigger per file, it changes on every build, and nobody notices
until a clone takes minutes and the derived knowledge graph is mostly scratch.

Three rules, each with a file that enforces it.

## 1. A render never enters git

\`\`\`bash
bash scripts/install-hooks.sh
\`\`\`

Installs a \`pre-commit\` hook that rejects any staged file at or over **1 MB**,
plus anything under the generated paths in \`.gitignore\`. Pure bash — it needs
git and nothing else, so it runs on every machine that can clone the repo.

If the hook blocks you, **regenerate rather than \`--no-verify\`**. A binary that
is worth committing is a binary that is not regenerable, and that belongs under
\`evidence/\` where the policy says so out loud.

## 2. "Regenerable" must be proved

\`\`\`bash
bash scripts/prune-audit.sh            # report only — the default
bash scripts/prune-audit.sh --days 90  # try a different window
bash scripts/prune-audit.sh --apply --yes
\`\`\`

The auditor deletes a file only when **all three** hold:

| # | Condition | How it is established |
|---|---|---|
| 1 | **Aged out** | No commit has touched it inside the window (\`git log\`) |
| 2 | **Unreferenced** | Its path or basename appears in no other tracked file |
| 3 | **Regenerable** | A recipe in \`scripts/retention-policy.tsv\` matches it **and that recipe's source still exists** |

Fail any one and the file stays. Condition 3 is the one that gets skipped in
hand-rolled cleanups, and it is the one that loses work: a recipe whose source
was deleted two refactors ago is not a recipe, it is a sentence about the past.

Even with \`--apply --yes\` the auditor uses \`git rm\`, so every removal is staged
for review and never committed or pushed for you.

**"Loaded" is not observable.** Git records when a file was last *modified*, not
when it was last *read*. Access times reset on clone and are meaningless in CI,
so they cannot ground a policy that runs on other people's machines. Condition 1
approximates "in use" with last-commit age; condition 2 does the real work.

## 3. Captures of live platform state are evidence

A screenshot of your ESP's dashboard is not an artifact of your build. It is a
record of what the platform looked like at a moment that has passed. Nothing
regenerates it, at any price, so the policy marks those paths \`EVIDENCE\` and the
auditor never touches them — not at 60 days, not at 600.

Keep them under \`evidence/\`. If a capture is worth taking, it is worth a path
that says what it is.

## What the graph indexes

If you run the knowledge-graph layer, keep process scratch out of it with a
\`.graphifyignore\`. A graph built over renders and review transcripts is mostly
noise, and past a few thousand nodes it stops being visualisable at all. The
transcripts still live in git — that is history, and history belongs in the log,
not in the index.

## Read cost

Size on disk is the visible problem; tokens are the expensive one. A log that
grows unbounded becomes a file every session pays to read before doing any work.
When a knowledge file gets long enough to notice, split it by era or domain and
put a thin current index at the front.
`;
}

// ── The commit hook ───────────────────────────────────────────────

function buildInstallHooks() {
  return `#!/usr/bin/env bash
# install-hooks.sh — wire the commit gate that keeps renders out of git.
#
# Pure bash, no dependencies beyond git. Idempotent: re-running refreshes the
# hook. If a pre-commit hook already exists and is not ours, it is left alone
# and reported — clobbering someone's hook to install a size check would be a
# poor trade.
#
# Usage: bash scripts/install-hooks.sh

set -euo pipefail

ROOT="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
cd "\$ROOT"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "install-hooks: not a git repository — run 'git init' first." >&2
  exit 2
fi

HOOK_DIR="\$(git rev-parse --git-path hooks)"
mkdir -p "\$HOOK_DIR"
HOOK="\$HOOK_DIR/pre-commit"
MARKER="# orbit-brain-retention-hook"

if [[ -f "\$HOOK" ]] && ! grep -q "\$MARKER" "\$HOOK"; then
  echo "install-hooks: \$HOOK already exists and is not ours — left alone." >&2
  echo "install-hooks: add the size check to it by hand, or move it aside and re-run." >&2
  exit 1
fi

cat > "\$HOOK" <<'HOOKEOF'
#!/usr/bin/env bash
# orbit-brain-retention-hook
# A render never enters git. See RETENTION.md.
set -uo pipefail

MAX_BYTES=$((${DEFAULT_MAX_MB} * 1024 * 1024))
blocked=0

while IFS= read -r f; do
  [[ -z "\$f" || ! -f "\$f" ]] && continue
  size=\$(wc -c < "\$f" | tr -d ' ')
  if (( size >= MAX_BYTES )); then
    echo "pre-commit: BLOCKED \$f — \$size bytes, over the ${DEFAULT_MAX_MB}MB limit." >&2
    blocked=1
  fi
  case "\$f" in
    */compiled/*|compiled/*|*/preview/*|preview/*|*/states/*|node_modules/*|*/node_modules/*|graphify-out/*|*.compiled.html)
      echo "pre-commit: BLOCKED \$f — generated output. Regenerate it instead of committing it." >&2
      blocked=1
      ;;
  esac
done < <(git diff --cached --name-only --diff-filter=ACM)

if (( blocked )); then
  echo "" >&2
  echo "pre-commit: nothing was committed. If one of these is NOT regenerable, it is evidence —" >&2
  echo "pre-commit: move it under evidence/ and add a row to scripts/retention-policy.tsv." >&2
  echo "pre-commit: --no-verify is not the fix. RETENTION.md explains why." >&2
  exit 1
fi
HOOKEOF

chmod +x "\$HOOK"
echo "install-hooks: wired \$HOOK — files >= ${DEFAULT_MAX_MB}MB and generated paths are now blocked at commit."
`;
}

// ── The prune auditor ─────────────────────────────────────────────

function buildPruneAudit() {
  return `#!/usr/bin/env bash
# prune-audit.sh — delete a render only when it is provably safe to.
#
# Three conditions, ALL of which must hold (see RETENTION.md):
#
#   1. aged out    — no commit has touched it inside the window.
#   2. unreferenced — its path or basename appears in no other tracked file.
#   3. regenerable  — a recipe in scripts/retention-policy.tsv matches it AND
#                     that recipe's source still exists.
#
# EVIDENCE rows are never deleted at any age. A capture of live platform state
# cannot be re-taken, so "it is old" is not an argument about it.
#
# Dry-run by default. --apply --yes stages removals with \`git rm\`, so even the
# destructive path leaves everything reviewable before it is committed.
#
# Usage: bash scripts/prune-audit.sh [--days N] [--apply --yes]

set -uo pipefail

ROOT="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
cd "\$ROOT"

DAYS=${DEFAULT_PRUNE_DAYS}
APPLY=0
YES=0
POLICY="scripts/retention-policy.tsv"

while [[ \$# -gt 0 ]]; do
  case "\$1" in
    --days) DAYS="\${2:-${DEFAULT_PRUNE_DAYS}}"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    --yes) YES=1; shift ;;
    --policy) POLICY="\${2:-\$POLICY}"; shift 2 ;;
    *) echo "prune-audit: unknown argument \$1" >&2; exit 2 ;;
  esac
done

git rev-parse --git-dir >/dev/null 2>&1 || { echo "prune-audit: not a git repository." >&2; exit 2; }
[[ -f "\$POLICY" ]] || { echo "prune-audit: NOT CHECKED — no policy at \$POLICY. Without it nothing can be proved regenerable, and guessing is how work gets lost." >&2; exit 2; }

CUTOFF_ARG="\${DAYS} days ago"

# A policy row that governs a GITIGNORED path can never fire: this auditor
# walks tracked files, and an ignored path is never tracked. Silence would read
# as "nothing to prune" when the truth is "nothing was ever eligible" — the two
# look identical in a report of zero, and one of them is a bug in your policy.
while IFS=\$'\\t' read -r p_glob p_recipe p_source; do
  [[ -z "\${p_glob:-}" || "\$p_glob" == \\#* ]] && continue
  [[ "\$p_recipe" == "EVIDENCE" ]] && continue
  probe="\${p_glob%%[*?]*}"
  probe="\${probe%/}"
  [[ -z "\$probe" ]] && continue
  # Probe as a path INSIDE the directory. A directory-only .gitignore pattern
  # ("build/compiled/") does not match the bare name "build/compiled", so the
  # detector this check exists to be would have found nothing, every time.
  if git check-ignore -q "\$probe/" 2>/dev/null || git check-ignore -q "\$probe" 2>/dev/null; then
    echo "prune-audit: POLICY DEAD ROW — \\"\$p_glob\\" is under a gitignored path (\$probe), so no file matching it is ever tracked and this row can never fire. Either drop the row, or stop ignoring the path." >&2
  fi
done < "\$POLICY"

kept_recent=0; kept_referenced=0; kept_evidence=0; review=0
declare -a DELETABLE=()

# Every tracked file, minus the ones no policy would ever match anyway.
while IFS= read -r f; do
  [[ -f "\$f" ]] || continue

  # Which policy row claims it? First match wins, so order the file
  # most-specific-first.
  recipe=""; source_glob=""
  while IFS=\$'\\t' read -r p_glob p_recipe p_source; do
    [[ -z "\${p_glob:-}" || "\$p_glob" == \\#* ]] && continue
    # shellcheck disable=SC2053
    case "\$f" in
      \$p_glob) recipe="\$p_recipe"; source_glob="\$p_source"; break ;;
    esac
  done < "\$POLICY"

  [[ -z "\$recipe" ]] && continue   # not an artifact this policy governs

  if [[ "\$recipe" == "EVIDENCE" ]]; then
    kept_evidence=\$((kept_evidence + 1))
    continue
  fi

  # 1. aged out?
  last="\$(git log -1 --format=%ct -- "\$f" 2>/dev/null)"
  cutoff="\$(date -j -v-"\${DAYS}"d +%s 2>/dev/null || date -d "\$CUTOFF_ARG" +%s 2>/dev/null)"
  if [[ -z "\$cutoff" ]]; then
    echo "prune-audit: NOT CHECKED — could not compute a cutoff date on this system." >&2
    exit 2
  fi
  if [[ -z "\$last" ]] || (( last > cutoff )); then
    kept_recent=\$((kept_recent + 1))
    continue
  fi

  # 2. unreferenced?
  base="\$(basename "\$f")"
  if git grep -qlF -- "\$base" -- ':!'"\$f" >/dev/null 2>&1; then
    kept_referenced=\$((kept_referenced + 1))
    continue
  fi

  # 3. regenerable — the recipe's SOURCE has to still exist. A recipe whose
  #    input is gone is a sentence about the past, not a way back.
  #    The proof must count TRACKED sources only. Two wrong answers preceded
  #    this one. A globstar expansion was a bash 4.0 feature on a bash 3.2
  #    shell, so condition 3 failed for every file — wrong, but wrong in the
  #    SAFE direction: nothing was ever deleted. Replacing it with a bare find
  #    then flipped the sign, because find sees untracked and gitignored files:
  #    a stray build artefact under templates/ satisfied "the recipe's source
  #    still exists" and authorised deleting a render nothing could rebuild.
  #    A source that is not in the repository is not a source you can hand
  #    someone else, so git ls-files is the question actually being asked.
  have_source=0
  if [[ -n "\$source_glob" && "\$source_glob" != "-" ]]; then
    if [[ -n "\$(git ls-files -- "\$source_glob" 2>/dev/null | head -1)" ]]; then
      have_source=1
    fi
  fi
  if (( ! have_source )); then
    echo "REVIEW    \$f — recipe \\"\$recipe\\" but no surviving source matching \\"\$source_glob\\". Not deleted."
    review=\$((review + 1))
    continue
  fi

  DELETABLE+=("\$f")
done < <(git ls-files)

echo ""
echo "prune-audit: window \${DAYS} days"
echo "  deletable      \${#DELETABLE[@]}"
echo "  kept: recent   \$kept_recent"
echo "  kept: referenced \$kept_referenced"
echo "  kept: evidence \$kept_evidence  (never pruned at any age)"
echo "  review         \$review  (no provable way to regenerate)"

# bash 3.2 (the macOS system bash) treats "\${arr[@]}" on an EMPTY array as an
# unbound variable under set -u, so every clean run would die right here — at
# the one moment the script has good news to report.
if (( \${#DELETABLE[@]} > 0 )); then
  for f in "\${DELETABLE[@]}"; do echo "DELETABLE \$f"; done
fi

if (( APPLY && YES )); then
  if (( \${#DELETABLE[@]} == 0 )); then
    echo "prune-audit: nothing to remove."
    exit 0
  fi
  git rm --cached --quiet -- "\${DELETABLE[@]}" && rm -f -- "\${DELETABLE[@]}"
  echo "prune-audit: staged \${#DELETABLE[@]} removal(s). Review with 'git status' before committing."
elif (( APPLY )); then
  echo "prune-audit: --apply given without --yes. Nothing was removed."
fi
`;
}

export { DEFAULT_MAX_MB, DEFAULT_PRUNE_DAYS };
