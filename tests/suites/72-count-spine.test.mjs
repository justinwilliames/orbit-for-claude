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
 * WHAT 2026-09-07 ADDED. The same defect recurred on surfaces that were
 * never TARGETS: orbit.md — the router Claude reads first in every session,
 * so its numbers are the ones a model repeats back to a user — said "62
 * specialist protocols and 84 tools" and "80+ practitioner guides" against
 * a true 86/135/99, and server/catalog.js reasoned in comments about "83
 * skills" over a corpus of 86. Both are TARGETS now, so the loop above
 * covers them; the tests below are the independent half, because a shape
 * the rewriter has never been taught is exactly what a fixed-point check
 * cannot see.
 *
 * THE MACHINE-READABLE COUNT, AND WHERE IT LIVES. The website's
 * fifteen-minute sync reads the manifest this repo uploads and had no
 * skill count to read, which is how a typed 79 outlived a generated 86.
 * The first fix put a `skills` key in manifest.json — and `mcpb pack`
 * rejected it ("Unrecognized key(s) in object: 'skills'"), which would
 * have broken the release build in CI. The count now ships as the sidecar
 * data/counts.json, published beside manifest.json in the bucket. Both
 * halves are asserted below: the sidecar must exist and be true, and the
 * manifest must NOT carry the key — the second assertion is the one that
 * keeps a working release, so it is not folded into the first.
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

import {
  COUNTS,
  REWRITES,
  TARGETS,
  COUNTS_FILE,
  DESCRIPTION_FILE,
  DEMOTED,
  INVENTORY,
  GUIDE_INVENTORY,
} from "../../scripts/sync-counts.mjs";

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

  test("orbit.md and server/catalog.js are in TARGETS at all", () => {
    // The defect was never that a pattern was wrong — it was that a
    // surface was outside the denominator, so no pattern ever ran on it.
    // Asserting membership means deleting a target fails here rather than
    // quietly shrinking what "in sync" means.
    for (const file of ["orbit.md", "server/catalog.js", "manifest.json"]) {
      assert.ok(
        TARGETS.includes(file),
        `${file} states Orbit's size and must be a sync-counts TARGET — it drifted to 62/84/83 while it wasn't.`
      );
    }
  });

  test("orbit.md: every count-shaped claim, found independently of REWRITES, is current", () => {
    // Independent of the rewriter, for the same reason the README scan
    // above is: "62 specialist protocols and 84 tools" survived every run
    // of a script whose patterns had never heard of that phrasing.
    //
    // A bare "N guides" is deliberately not scanned: the citation rules say
    // "2-4 guides max", which is an instruction about how many to cite, not
    // a claim about how many exist. The "+" form ("80+ guides") is a size
    // claim and is scanned.
    const raw = fs.readFileSync(path.join(ROOT_DIR, "orbit.md"), "utf8");
    const flat = raw.replace(/\s+/g, " ");

    const pairs = flat.match(/\b\d+\+? specialist protocols\.? (?:and )?\d+\+? tools\b/g) ?? [];
    assert.ok(pairs.length > 0, "expected orbit.md to state its protocol/tool inventory — did the router intro move?");
    for (const mention of pairs) {
      assert.match(
        mention,
        new RegExp(`^${COUNTS.skills} specialist protocols\\.? (?:and )?${COUNTS.tools} tools$`),
        `orbit.md says "${mention}", not ${COUNTS.skills} protocols and ${COUNTS.tools} tools. ` +
          "This is the surface Claude reads before every Orbit answer."
      );
    }

    const guideClaims =
      flat.match(/\b\d[\d,]*\+?\s+(?:long-form\s+)?practitioner\s+guides\b|\b\d[\d,]*\+\s+guides\b/gi) ?? [];
    assert.ok(guideClaims.length > 0, "expected orbit.md to state the guide-library size in Further Reading.");
    for (const mention of guideClaims) {
      assert.equal(mention, GUIDE_INVENTORY, `orbit.md says "${mention}", not the canonical "${GUIDE_INVENTORY}".`);
    }
  });

  test("server/catalog.js: the corpus size in the scorer's comments is current", () => {
    const raw = fs.readFileSync(path.join(ROOT_DIR, "server", "catalog.js"), "utf8");
    const mentions = raw.match(/\b(?:of|over) \d+ skills\b|\b\d+ skills times\b/g) ?? [];
    assert.ok(mentions.length > 0, "expected server/catalog.js to describe the corpus it scores over.");
    for (const mention of mentions) {
      const stated = Number(mention.match(/\d+/)[0]);
      assert.equal(
        stated,
        COUNTS.skills,
        `server/catalog.js says "${mention}" — the scorer's own comments describe a library of ${COUNTS.skills}.`
      );
    }
  });

  test("server/catalog.js: the per-keyword document frequency is NOT rewritten as a corpus size", () => {
    // The counterpart trap to INTEGRATION-STANDARD.md's dated figure: the
    // same file observes that a term is "rare across the corpus (2 skills)",
    // which is a document frequency for one keyword. A blanket "N skills"
    // pattern would rewrite it to the library size and turn a true comment
    // into a false one.
    const raw = fs.readFileSync(path.join(ROOT_DIR, "server", "catalog.js"), "utf8");
    assert.match(raw, /rare across the corpus \(2 skills\)/);
  });

  test("data/counts.json: the sidecar exists, parses, and states the generated counts", () => {
    // Prose counts are for humans. This file is what the website's
    // fifteen-minute sync reads off the bucket; without it the site had
    // nothing to read and kept a typed number instead.
    const full = path.join(ROOT_DIR, COUNTS_FILE);
    assert.ok(
      fs.existsSync(full),
      `${COUNTS_FILE} is missing — the website's sync has no counts to read. Run \`node scripts/sync-counts.mjs\`.`
    );
    const counts = JSON.parse(fs.readFileSync(full, "utf8"));
    assert.equal(counts.skills, COUNTS.skills, `${COUNTS_FILE} says ${counts.skills} skills; the library holds ${COUNTS.skills}.`);
    assert.equal(counts.tools, COUNTS.tools, `${COUNTS_FILE} says ${counts.tools} tools; the manifest registers ${COUNTS.tools}.`);
    assert.equal(counts.guides, COUNTS.guides, `${COUNTS_FILE} says ${counts.guides} guides; the library holds ${COUNTS.guides}.`);
    // The version rides along so a consumer can tell which release the
    // counts describe. A sidecar describing a different build is worse
    // than no sidecar: it looks authoritative and isn't.
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8"));
    assert.equal(counts.version, manifest.version);
    assert.equal(counts.generated_from, "scripts/sync-counts.mjs");
  });

  test("data/repo-description.txt: exists and states the true counts", () => {
    // The last surface with no owner. The description is the first sentence
    // a stranger reads on the repo page, it was hand-edited to "83 skills"
    // on 01 Sep 2026, and it was stale six days later — because nothing in
    // .github/workflows/ or scripts/ so much as mentioned `repo edit`. The
    // file is now generated by sync-counts.mjs and pushed by the release
    // workflow's Promote step; this asserts the half that lives in the repo.
    const full = path.join(ROOT_DIR, DESCRIPTION_FILE);
    assert.ok(
      fs.existsSync(full),
      `${DESCRIPTION_FILE} is missing — the release workflow has nothing to push. Run \`node scripts/sync-counts.mjs\`.`
    );
    const raw = fs.readFileSync(full, "utf8");
    assert.ok(
      raw.includes(INVENTORY),
      `${DESCRIPTION_FILE} does not say "${INVENTORY}" — it reads: ${JSON.stringify(raw)}`
    );
  });

  test('manifest.json: carries NO top-level "skills" key', () => {
    // Not a style preference — a hard build constraint. The MCPB manifest
    // schema is closed, and `mcpb pack` fails the whole release with
    // "Unrecognized key(s) in object: 'skills'". The key shipped here once;
    // this assertion is why it cannot ship twice. The count lives in
    // data/counts.json instead (asserted above).
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "manifest.json"), "utf8"));
    assert.ok(
      !("skills" in manifest),
      'manifest.json has a top-level "skills" key — `mcpb pack` rejects the manifest and CI cannot build a release. ' +
        "The count belongs in data/counts.json; run `node scripts/sync-counts.mjs` to strip it."
    );
    assert.equal(manifest.tools.length, COUNTS.tools);
  });

  test("skills/*.md and data/skills.manifest.json agree on how many skills exist", () => {
    // Everything above is synced FROM the generated manifest. If the
    // manifest itself is stale, every surface is confidently wrong
    // together, which is worse than one surface being visibly wrong.
    const onDisk = fs.readdirSync(path.join(ROOT_DIR, "skills")).filter((f) => f.endsWith(".md")).length;
    assert.equal(
      onDisk,
      COUNTS.skills,
      `skills/ holds ${onDisk} files, data/skills.manifest.json ${COUNTS.skills}. Run \`npm run build:skills-manifest\`.`
    );
  });

  test("docs/INTEGRATION-STANDARD.md: the dated historical tool count is untouched by demotion", () => {
    // The trap this suite exists to avoid falling into: proving the fix for
    // the LIVE count claim didn't also mangle the file's own frozen
    // snapshot of a past measurement.
    const raw = fs.readFileSync(path.join(ROOT_DIR, "docs", "INTEGRATION-STANDARD.md"), "utf8");
    assert.match(raw, /66 of 135 tools had ever been called at the time/);
    assert.match(raw, /Orbit\s+registers 135/);
  });
});
