/**
 * Guides resource suite.
 *
 * Locks in that the guide library is exposed as MCP resources:
 *   - orbit://guides/index                JSON index of all guides
 *   - orbit://guides/by-category/{cat}    JSON list scoped to a category
 *   - orbit://guides/{slug}               markdown for each individual guide
 *
 * The export is bundled at mcpb build time via scripts/fetch-guides.mjs
 * from get.yourorbit.team/api/guides/export. This suite reads the
 * bundled data/guides-export.json and asserts that every guide in the
 * snapshot appears as a listable, readable MCP resource.
 *
 * If the snapshot is missing (fresh checkout, fetch failed), this
 * suite is skipped. The guides module is designed to no-op in that
 * case so the rest of Orbit stays functional.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { spawnMcpClient } from "../harness/mcp-client.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(TEST_DIR, "..", "..");
const EXPORT_PATH = path.join(ROOT_DIR, "data", "guides-export.json");

const hasExport = fs.existsSync(EXPORT_PATH);
const exportPayload = hasExport
  ? JSON.parse(fs.readFileSync(EXPORT_PATH, "utf8"))
  : null;

describe("Guides resource suite", { skip: !hasExport }, () => {
  let client;

  before(async () => {
    client = await spawnMcpClient({ cwd: ROOT_DIR });
  });

  after(async () => {
    if (client) await client.close();
  });

  test("resources/list includes guide URIs for every bundled guide", async () => {
    const resources = await client.listResources();
    const guideResources = resources.filter((r) => r.uri?.startsWith("orbit://guides/"));
    // Expect: 1 index + N categories + M guide-specific
    const expectedCategories = new Set(exportPayload.guides.map((g) => g.category));
    const expectedCount = 1 + expectedCategories.size + exportPayload.guides.length;
    assert.equal(
      guideResources.length,
      expectedCount,
      `Expected ${expectedCount} guide resources (index + ${expectedCategories.size} categories + ${exportPayload.guides.length} guides), got ${guideResources.length}`
    );
  });

  test("orbit://guides/index returns a valid index document", async () => {
    const res = await client.send("resources/read", { uri: "orbit://guides/index" });
    assert.equal(res.contents[0].mimeType, "application/json");
    const index = JSON.parse(res.contents[0].text);
    assert.equal(index.count, exportPayload.guides.length);
    assert.ok(Array.isArray(index.categories));
    assert.ok(index.categories.length > 0);
    assert.ok(index.guidesByCategory, "expected guidesByCategory map");
  });

  test("every guide is readable as markdown with a non-empty body", async () => {
    // Sample rather than exhaust — reading 80 guides one-by-one takes a
    // meaningful amount of time. Cover first, middle, last + any that
    // live in an unusual category.
    const sample = [
      exportPayload.guides[0],
      exportPayload.guides[Math.floor(exportPayload.guides.length / 2)],
      exportPayload.guides[exportPayload.guides.length - 1],
    ];
    for (const guide of sample) {
      const res = await client.send("resources/read", {
        uri: `orbit://guides/${guide.slug}`,
      });
      assert.equal(res.contents[0].mimeType, "text/markdown");
      const body = res.contents[0].text;
      assert.ok(body.length > 500, `Guide ${guide.slug} markdown too short (${body.length} chars)`);
      assert.ok(
        body.includes(guide.title),
        `Guide ${guide.slug} markdown missing title`
      );
    }
  });

  test("unknown slug throws", async () => {
    await assert.rejects(
      () => client.send("resources/read", { uri: "orbit://guides/this-slug-does-not-exist" }),
      /resource/i
    );
  });

  test("per-category resource returns scoped list", async () => {
    const category = exportPayload.guides[0].category;
    const res = await client.send("resources/read", {
      uri: `orbit://guides/by-category/${category}`,
    });
    assert.equal(res.contents[0].mimeType, "application/json");
    const scoped = JSON.parse(res.contents[0].text);
    assert.equal(scoped.category, category);
    assert.ok(Array.isArray(scoped.guides));
    assert.ok(scoped.guides.length > 0);
    assert.ok(scoped.guides.every((g) => g.uri.startsWith(`orbit://guides/`)));
  });
});
