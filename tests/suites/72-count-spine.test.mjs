/**
 * Count-spine guard (Echo, issue #19).
 *
 * THE DEFECT THIS PINS. Orbit states its own size on several surfaces, in
 * hand-written prose that gets re-typed rather than generated. sync-counts.mjs
 * existed to keep four of them (README.md, server.json, server/index.js,
 * manifest.json) honest against the three source-of-truth files — but its
 * guide-count pattern required the literal words "practitioner guides" in
 * that order. README's own prose said "99 long-form guides" (no
 * "practitioner"), so the pattern never matched it, the script printed
 * "already in sync" on every run, and a 91-vs-99 drift survived a sync that
 * reported success. A sync that reports success while silently skipping a
 * surface is worse than no sync: it launders a stale number as a verified
 * one.
 *
 * Two more surfaces stated a skill/tool count with no sync at all:
 * CLAUDE.md ("62 skills total", "62 specialist protocols", "80+ tools
 * backing the skills") sat at 62/80+ against a true 83/135, and
 * docs/INTEGRATION-STANDARD.md ("the 99 guides") was accurate only by
 * coincidence, with nothing stopping either from drifting again the next
 * time the product grew.
 *
 * THE FIX. Two moves, matched to what the number is FOR on each surface:
 *   - README.md is the stranger-facing surface — "83 skills and 135 tools"
 *     is a real specificity signal at the install decision. Kept live: the
 *     guide-count pattern in scripts/sync-counts.mjs was widened to catch
 *     every long-form/practitioner combination, and README's own prose was
 *     normalised to the canonical phrasing as a second line of defence.
 *   - CLAUDE.md and docs/INTEGRATION-STANDARD.md are internal engineering
 *     docs nobody evaluates Orbit from. The cardinal was demoted out of
 *     them entirely rather than wired into another regex — fewer numbers
 *     to drift beats one more sync target to maintain, and an agent that
 *     actually needs the figure can `ls skills/*.md | wc -l` in one command.
 *
 * THE BAR. This suite re-runs the REAL rewrite logic from sync-counts.mjs
 * against every live TARGET file — if running the script right now would
 * change a byte of it, that file is stale and this test fails. It also
 * asserts every DEMOTED file has stayed demoted: the exact bare-count
 * phrasing that drifted before must not have crept back in.
 *
 * THE TRAP THIS GUARDS. docs/INTEGRATION-STANDARD.md legitimately discusses
 * "135 tools" and "66 of 135" a few paragraphs away, as a DATED historical
 * measurement from a specific past event — not a live "here is Orbit's
 * current size" claim. A blanket "no digit near the word tools" pattern
 * would flag that honest history as a second unsynced inventory line and,
 * if wired into the rewriter, would corrupt it to match today's count. The
 * DEMOTED patterns below are scoped to the exact phrasing that actually
 * drifted, not a broad ban, so the historical figure is provably untouched.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { REWRITES, TARGETS, DEMOTED, INVENTORY, GUIDE_INVENTORY } from "../../scripts/sync-counts.mjs";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** What sync-counts.mjs would write, without writing it. */
function wouldRewrite(raw) {
  let next = raw;
  for (const { pattern, replacement } of REWRITES) {
    next = next.replace(pattern, replacement());
  }
  return next;
}

describe("count spine: every stated Orbit size is honest", () => {
  test("sanity: the exported canonical strings are non-empty and numeric-led", () => {
    assert.match(INVENTORY, /^\d+ skills and \d+ tools$/);
    assert.match(GUIDE_INVENTORY, /^\d+ long-form practitioner guides$/);
  });

  test("README.md: every guide-count mention, found independently of REWRITES, is the canonical phrase", () => {
    // The wouldRewrite() check above is a fixed point of REWRITES itself —
    // if a pattern has the same blind spot the prose does, "no diff" is
    // vacuously true and proves nothing. This scan is independent: it finds
    // every "N ... guide(s)" mention by shape alone and demands each one be
    // the exact canonical GUIDE_INVENTORY string, so a phrasing this suite
    // has never seen before still fails loud instead of passing quiet. This
    // is exactly how the original defect hid — README said "99 long-form
    // guides" in two places, the narrower pattern only knew "practitioner
    // guides", and the script printed "already in sync" both times.
    const raw = fs.readFileSync(path.join(ROOT_DIR, "README.md"), "utf8");
    const found = raw.match(/\b\d[\d,]*\+?\s+(?:long-form\s+)?(?:practitioner\s+)?guides\b/gi) ?? [];
    assert.ok(found.length > 0, "expected at least one guide-count mention in README.md — did the section move?");
    for (const mention of found) {
      assert.equal(
        mention,
        GUIDE_INVENTORY,
        `README.md says "${mention}", not the canonical "${GUIDE_INVENTORY}" — same drift shape as the original defect.`
      );
    }
  });

  for (const file of TARGETS) {
    test(`${file}: running sync-counts.mjs right now would change nothing`, () => {
      const full = path.join(ROOT_DIR, file);
      if (!fs.existsSync(full)) {
        // Not every TARGET states a count in every release (server.json
        // currently carries none) — absence of the file itself would still
        // be a real failure elsewhere, but this guard is only about count
        // drift, so skip rather than false-fail on a file with nothing to
        // say yet.
        return;
      }
      const raw = fs.readFileSync(full, "utf8");
      const rewritten = wouldRewrite(raw);
      assert.equal(
        rewritten,
        raw,
        `${file} contains a stale count sync-counts.mjs would have rewritten. ` +
          `Run \`node scripts/sync-counts.mjs\` and inspect the diff.`
      );
    });
  }

  for (const { file, patterns } of DEMOTED) {
    test(`${file}: stays demoted — no bare skill/tool count crept back in`, () => {
      const full = path.join(ROOT_DIR, file);
      const raw = fs.readFileSync(full, "utf8");
      for (const pattern of patterns) {
        assert.doesNotMatch(
          raw,
          pattern,
          `${file} contains ${pattern} — a demoted count has reappeared with nothing to keep it honest. ` +
            `Either remove the number again or move ${file} into TARGETS and give it a real REWRITES pattern.`
        );
      }
    });
  }

  test("docs/INTEGRATION-STANDARD.md: the dated historical tool count is untouched by demotion", () => {
    // The trap this suite exists to avoid falling into: proving the fix for
    // the LIVE count claim didn't also mangle the file's own frozen
    // snapshot of a past measurement.
    const raw = fs.readFileSync(path.join(ROOT_DIR, "docs", "INTEGRATION-STANDARD.md"), "utf8");
    assert.match(raw, /66 of 135 tools had ever been called at the time/);
    assert.match(raw, /Orbit\s+registers 135/);
  });
});
