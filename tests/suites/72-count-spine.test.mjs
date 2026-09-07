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
 *
 * WHAT THE SECOND DESCRIBE BLOCK ADDS. Everything above asserts the state
 * of this tree. None of it asserts that verify-count-spine.mjs would NOTICE
 * a bad tree — and two of its rows were, until 2026-09-07, incapable of it:
 *
 *   - `mentions === 0` scored a row `ok`. Rewording server/index.js to
 *     "86 lifecycle skills and 135 tools" — a shape no scanner knows —
 *     turned a checked surface into an unchecked one AND printed a tick
 *     for it, which is worse than not checking the file at all.
 *   - orbit.md's Skill Index had no row of its own. 33 of 86 skills had no
 *     index line, so the router could not route to them, while every count
 *     on every surface truthfully read 86. A cardinality check would not
 *     have caught the worse case either: rename one skill and add another
 *     and the total still reads 86 while the index points at a file that
 *     does not exist. Only a set difference sees that.
 *
 * A green tick over a fixture that cannot fail is the defect this review
 * round is named after, so those two rows are tested by MUTATION: build a
 * scratch tree, break exactly one thing in it, and require the script to
 * exit non-zero. The control case runs the same harness on an unbroken
 * tree and requires exit 0 — without it, a scratch tree that failed for
 * its own reasons would make every mutation test pass for the wrong reason.
 *
 * The scratch tree is a symlink farm: only the two scripts and the file
 * under mutation are real copies, everything else is a link into this
 * repo. That matters twice. Node's ESM loader resolves symlinks, so a
 * linked script would compute ROOT_DIR back to the real repo and would
 * mutate nothing; and nothing here ever writes or deletes through a link,
 * so a working tree someone else is editing is never touched.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
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

/**
 * A throwaway copy of the repo, with `overrides` written in place of the
 * real files. Only `scripts/` and any directory holding an override are
 * real directories; everything else is one symlink.
 *
 * Overrides are limited to depth 2 (`orbit.md`, `server/index.js`) — deeper
 * than that and the parent-materialising below would need to recurse, and
 * nothing needs it yet. Writing to a path whose parent is still a symlink
 * would write THROUGH it into the real repo, so this throws rather than
 * quietly guessing.
 */
function scratchTree(overrides = {}) {
  const realDirs = new Set(["scripts"]);
  for (const rel of Object.keys(overrides)) {
    const parts = rel.split("/");
    assert.ok(parts.length <= 2, `scratchTree override "${rel}" is deeper than this helper materialises.`);
    if (parts.length === 2) {
      realDirs.add(parts[0]);
    }
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orbit-count-spine-"));
  for (const entry of fs.readdirSync(ROOT_DIR)) {
    const src = path.join(ROOT_DIR, entry);
    const dst = path.join(dir, entry);
    if (!realDirs.has(entry)) {
      fs.symlinkSync(src, dst);
      continue;
    }
    fs.mkdirSync(dst);
    for (const child of fs.readdirSync(src)) {
      fs.symlinkSync(path.join(src, child), path.join(dst, child));
    }
  }

  // The scripts must be real files. Node's ESM loader resolves symlinks
  // before computing import.meta.url, so a linked script would derive
  // ROOT_DIR back to the real repo and read straight past every override.
  for (const script of ["verify-count-spine.mjs", "sync-counts.mjs"]) {
    const dst = path.join(dir, "scripts", script);
    fs.rmSync(dst);
    fs.copyFileSync(path.join(ROOT_DIR, "scripts", script), dst);
  }

  for (const [rel, contents] of Object.entries(overrides)) {
    const dst = path.join(dir, rel);
    // rmSync on a symlink unlinks the link, never the target.
    fs.rmSync(dst);
    fs.writeFileSync(dst, contents);
  }
  return dir;
}

/** Run the spine in a scratch tree. Returns its exit code and stdout. */
function runSpine(dir) {
  try {
    const stdout = execFileSync(process.execPath, [path.join(dir, "scripts", "verify-count-spine.mjs")], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status ?? -1, stdout: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

/** The printed table row whose surface column starts with `surface`. */
function tableRow(stdout, surface) {
  return stdout.split("\n").find((line) => line.startsWith(surface)) ?? "";
}

/** Runs `body` against a scratch tree and always removes it afterwards. */
function withScratch(overrides, body) {
  const dir = scratchTree(overrides);
  try {
    body(runSpine(dir), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const ORBIT_MD = fs.readFileSync(path.join(ROOT_DIR, "orbit.md"), "utf8");
/** The first Skill Index row, as the verify script's own pattern finds it. */
const FIRST_INDEX_ROW = ORBIT_MD.match(/^\| `([a-z0-9-]+)`.*$/m);

describe("count spine: the gate itself fails on a tree that deserves it", () => {
  test("control: an unmutated scratch tree passes, so a mutation failing means something", () => {
    // The fixture-honesty check. If the symlink farm were broken, every
    // mutation below would exit non-zero for reasons that have nothing to
    // do with what it claims to prove, and all of them would pass.
    withScratch({}, ({ code, stdout }) => {
      assert.equal(code, 0, `an untouched scratch tree should pass the spine. Output:\n${stdout}`);
      assert.match(stdout, /orbit\.md Skill Index vs skills\/\*\.md/, "the Skill Index row is missing from the table.");
      assert.match(stdout, /All \d+ checks pass/);
    });
  });

  test("Skill Index: dropping one slug from orbit.md fails the set-difference row", () => {
    assert.ok(FIRST_INDEX_ROW, "expected orbit.md to hold at least one Skill Index row to drop.");
    const [line, slug] = FIRST_INDEX_ROW;
    withScratch({ "orbit.md": ORBIT_MD.replace(`${line}\n`, "") }, ({ code, stdout }) => {
      assert.equal(code, 1, `dropping "${slug}" from the Skill Index must fail the spine. Output:\n${stdout}`);
      assert.match(
        tableRow(stdout, "orbit.md Skill Index vs skills/*.md"),
        /\| NO$/,
        "the Skill Index row should read NO when a skill has no index line."
      );
      assert.match(stdout, new RegExp(`have no Skill Index row[^]*\\b${slug}\\b`), `the failure should name ${slug}.`);
    });
  });

  test("Skill Index: a swap that preserves the count still fails — this is why it is a set", () => {
    // The case a cardinality check cannot see, and the reason R2 ruled for
    // a set difference: 86 index rows against 86 files, one of them
    // pointing at a skill that does not exist.
    assert.ok(FIRST_INDEX_ROW, "expected orbit.md to hold at least one Skill Index row to swap.");
    const [line, slug] = FIRST_INDEX_ROW;
    const swapped = line.replace(`\`${slug}\``, "`not-a-real-skill`");
    withScratch({ "orbit.md": ORBIT_MD.replace(line, () => swapped) }, ({ code, stdout }) => {
      assert.equal(code, 1, `swapping "${slug}" for a non-existent skill must fail the spine. Output:\n${stdout}`);
      const row = tableRow(stdout, "orbit.md Skill Index vs skills/*.md");
      assert.match(row, /\| NO$/);
      assert.match(
        row,
        new RegExp(`\\| ${COUNTS.skills} +\\| ${COUNTS.skills} +\\| NO$`),
        `the count is unchanged at ${COUNTS.skills} on both sides — only the set difference catches this. Row: ${row}`
      );
      assert.match(stdout, /name no file in skills\/[^]*not-a-real-skill/);
    });
  });

  test("fail-open: a surface that states no count at all fails instead of scoring ok", () => {
    // Sentinel's instrumented case, verbatim: the exact reword that used to
    // print "(no count stated) | yes" for server/index.js.
    const raw = fs.readFileSync(path.join(ROOT_DIR, "server", "index.js"), "utf8");
    const stated = `${COUNTS.skills} skills and ${COUNTS.tools} tools`;
    assert.ok(raw.includes(stated), `server/index.js no longer says "${stated}" — pick another surface to mutate.`);
    const reworded = raw.replaceAll(stated, `${COUNTS.skills} lifecycle skills and ${COUNTS.tools} tools`);

    withScratch({ "server/index.js": reworded }, ({ code, stdout }) => {
      assert.equal(code, 1, `a reworded count no scanner knows must fail, not score ok. Output:\n${stdout}`);
      const row = tableRow(stdout, "server/index.js ");
      assert.match(
        row,
        /\(no count stated\) +\| NO$/,
        `server/index.js should read "(no count stated) | NO". Row: ${row}`
      );
      assert.match(stdout, /shape no scanner knows/, "the failure should say how to fix it.");
    });
  });

  test("fail-open: a surface declared count-free in the script is still allowed to say nothing", () => {
    // The allowlist has exactly one member today. server.json's description
    // is read verbatim by the MCP registry and has never carried a
    // cardinal; the row must stay green, or the gate is unrunnable and gets
    // switched off, which is the same fail-open by a different door.
    withScratch({}, ({ code, stdout }) => {
      assert.equal(code, 0);
      assert.match(
        tableRow(stdout, "server.json "),
        /\(declared count-free\) +\| \(no count stated\) +\| yes$/,
        "server.json should pass by declaration, visibly, rather than by silence."
      );
    });
  });
});
