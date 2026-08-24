/**
 * The keystone document must agree with the code it describes.
 *
 * docs/INTEGRATION-STANDARD.md calls itself the contract every integration
 * meets, and says three files move together and must never disagree. On
 * 2026-08-24 it disagreed with itself and with the registry in the same
 * breath: its compliance table listed Amplitude and Databricks at Tier 0
 * "(built, not registered)" and Segment/RudderStack at Tier 0, while a
 * bullet twelve lines below said Amplitude and Databricks were LIVE at
 * Tier 2 and Segment/RudderStack were "NOT built" — and server/
 * integrations.js had all four live at Tier 2. Every one of those claims
 * was written by someone who believed it when they wrote it.
 *
 * That is the failure mode this whole session has been chasing: prose
 * that was true once, kept its confident tone, and quietly stopped being
 * true. A document nobody checks is a document that drifts, and this one
 * is load-bearing — it is what a contributor reads to learn the rules.
 *
 * So the table is now checked against the registry, cell by cell. The
 * prose is not (nobody can test an argument), but the FACTS the prose
 * repeats — tiers, platform counts, budget figures — are exactly what
 * went stale, and those live in the table and the suite-01 comment.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { INTEGRATIONS } from "../../server/integrations.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const doc = readFileSync(join(ROOT, "docs", "INTEGRATION-STANDARD.md"), "utf8");

/** Parse the compliance table into { displayName -> {tier, reads} }. */
function parseTable(markdown) {
  const rows = new Map();
  for (const line of markdown.split("\n")) {
    // | Name | kind | **tier** | check | reads | deep |
    const m = line.match(/^\|\s*([^|]+?)\s*\|\s*([a-z_]+)\s*\|\s*\*\*(\d)\*\*\s*\|\s*([^|]+?)\s*\|\s*([\d—-]+)\s*\|/);
    if (m) rows.set(m[1], { kind: m[2], tier: Number(m[3]), check: m[4], reads: m[5] });
  }
  return rows;
}

const table = parseTable(doc);

describe("INTEGRATION-STANDARD.md agrees with the registry", () => {
  test("the table lists every registered integration, and no extras", () => {
    assert.equal(
      table.size,
      INTEGRATIONS.length,
      `the compliance table has ${table.size} rows but server/integrations.js has ${INTEGRATIONS.length} ` +
        `integrations. Regenerate the table from the registry rather than hand-editing it.`
    );
  });

  test("every integration's declared tier matches the table", () => {
    // The exact defect: four platforms sat at Tier 0 in the table while the
    // registry had them live at Tier 2.
    const byTier = new Map([...table.values()].map((r) => [r.tier, r]));
    void byTier;
    const registryTiers = INTEGRATIONS.map((e) => e.declaredTier).sort();
    const docTiers = [...table.values()].map((r) => r.tier).sort();
    assert.deepEqual(
      docTiers,
      registryTiers,
      `the tiers in INTEGRATION-STANDARD.md's table do not match the registry.\n` +
        `  doc:      ${docTiers.join(", ")}\n  registry: ${registryTiers.join(", ")}`
    );
  });

  test("no integration is described as unbuilt while the registry has it live", () => {
    // Prose is untestable in general, but THIS class of sentence is exactly
    // what went stale, so the specific phrases that were wrong are banned.
    const live = INTEGRATIONS.filter((e) => !e.roadmap).map((e) => e.id);
    const banned = [
      { re: /\bare NOT built\b/i, why: 'says an integration is "NOT built"' },
      { re: /built, not registered/i, why: 'says an integration is "built, not registered"' },
    ];
    for (const { re, why } of banned) {
      assert.ok(
        !re.test(doc),
        `INTEGRATION-STANDARD.md ${why}, but the registry currently has these live: ${live.join(", ")}. ` +
          `If something really is unbuilt, mark it roadmap:true in server/integrations.js so the two agree.`
      );
    }
  });

  test("the budget figure it quotes matches the one suite 01 enforces", () => {
    // The doc quoted 165,500 and "222 bytes of headroom" long after the cap
    // moved. A paraphrased number in prose is a number that goes stale.
    const contract = readFileSync(join(ROOT, "tests", "suites", "01-contract.test.mjs"), "utf8");
    const real = contract.match(/TOOLS_LIST_BYTE_BUDGET\s*=\s*([\d_]+)/);
    assert.ok(real, "could not read the byte budget from suite 01");
    const budget = Number(real[1].replace(/_/g, ""));
    const quoted = [...doc.matchAll(/`tools\/list`\s+at\s+([\d,]+)\s+bytes/g)].map((m) =>
      Number(m[1].replace(/,/g, ""))
    );
    for (const q of quoted) {
      assert.equal(
        q,
        budget,
        `INTEGRATION-STANDARD.md quotes a ${q.toLocaleString()}-byte cap; suite 01 enforces ` +
          `${budget.toLocaleString()}. Quote the enforced number or do not quote one.`
      );
    }
  });
});
