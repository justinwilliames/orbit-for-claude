/**
 * An Orbit API key is OPTIONAL, and Orbit has to SAY so.
 *
 * THE PRODUCT DECISION THIS PINS. Orbit keeps its own API adapters on
 * purpose: when a platform ships a new API capability, Orbit can support
 * it the same day instead of waiting on a vendor's MCP roadmap. That
 * speed is the whole reason the adapters exist. But it must never read
 * as "you have to give Orbit a key" — a user who already runs the
 * platform's own MCP server has a perfectly good path, and Orbit
 * nagging for a credential in that situation is the product being needy
 * about its own plumbing.
 *
 * THE ARCHITECTURAL FACT, because a test is the right place to stop
 * someone building on a false premise: an MCP server CANNOT see,
 * enumerate, or call another MCP server. Orbit has exactly one
 * transport, to the host. It can never detect that a Braze MCP is
 * connected and it can never hand off to it. The HOST sees every
 * connected server, so the host does the routing. Orbit's job is to
 * make the alternative KNOWN — in the missing-credential response, in
 * orbit_esp_capabilities, and in the server instructions — and then get
 * out of the way. These tests assert that Orbit does that job, not that
 * it does something it structurally cannot.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { VENDOR_MCP, vendorMcpHint, PLATFORMS } from "../../server/esp/capabilities.js";
import { dispatch } from "../../server/esp/registry.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("the key is optional, and Orbit says so", () => {
  test("every ESP has a vendor-MCP verdict — including the negative ones", () => {
    // A missing entry would silently read as "no alternative", which is a
    // claim, not an absence. Mailchimp's `exists:false` is a FINDING and
    // has to be recorded as deliberately as the positives.
    for (const platform of PLATFORMS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(VENDOR_MCP, platform),
        `${platform} has no vendor-MCP verdict — is that researched, or forgotten?`
      );
      const v = VENDOR_MCP[platform];
      assert.equal(typeof v.exists, "boolean", `${platform}.exists must be a decided boolean`);
      if (v.exists) {
        assert.ok(v.url?.startsWith("https://"), `${platform} claims an MCP with no URL to check it`);
        assert.ok(v.covers, `${platform} claims an MCP without saying what it covers`);
      } else {
        assert.ok(v.caveat, `${platform} has no vendor MCP and must explain what that means for the user`);
      }
    }
  });

  test("a missing credential offers the no-key alternative, never just a demand", async () => {
    // The old response said "set your key" and stopped. If the user has
    // Klaviyo's own MCP connected, that instruction is simply wrong for
    // them.
    const res = await dispatch("klaviyo", "listTemplates", { config: {} });
    assert.equal(res.needs_setup, true);
    assert.equal(res.key_optional, true, "the response must state the key is optional");
    assert.match(res.alternative, /OPTIONAL/, "the alternative must lead with the key being optional");
    assert.match(res.alternative, /own MCP server/, "it must name the vendor's own MCP as the alternative");
    assert.match(res.alternative, /developers\.klaviyo\.com/, "it must link the vendor docs so the claim is checkable");
  });

  test("Mailchimp is told the truth: there is no alternative", async () => {
    // The one platform where an Orbit key really is the only integrated
    // path. Promising a vendor MCP here would be the same false-claim bug
    // this codebase keeps producing, just pointed the other way.
    const res = await dispatch("mailchimp", "listTemplates", { config: {} });
    assert.equal(res.needs_setup, true);
    assert.match(res.alternative, /No first-party MCP exists/i);
    assert.ok(
      !/ask Claude to use it instead/.test(res.alternative),
      "Mailchimp must not be offered an alternative that does not exist"
    );
  });

  test("the hint never fabricates a server for a platform that lacks one", () => {
    for (const platform of PLATFORMS) {
      const hint = vendorMcpHint(platform);
      assert.ok(hint, `${platform} produced no hint at all`);
      if (!VENDOR_MCP[platform].exists) {
        assert.ok(
          !/publishes its own MCP server/.test(hint),
          `${platform} has no vendor MCP but the hint implies one`
        );
      }
    }
  });

  test("the server instructions teach the host to look at other connected servers", () => {
    // This is the ONLY mechanism that makes any of it work: Orbit cannot
    // route, so the instructions have to tell the host to. If this text
    // is ever trimmed for bytes, the feature silently stops existing —
    // hence a test rather than a comment.
    const src = readFileSync(join(ROOT, "server", "index.js"), "utf8");
    const start = src.indexOf("  instructions: [");
    const end = src.indexOf("\n  ]", start);
    assert.ok(start > 0 && end > start, "the instructions block could not be located");
    const text = src.slice(start, end);

    assert.match(text, /LOOK AT WHAT ELSE IS CONNECTED/,
      "the instructions must tell the host to check other connected MCP servers");
    assert.match(text, /cannot see any of the others|cannot see or call another MCP server/,
      "the instructions must state that Orbit cannot see other servers — the host does the routing");
    assert.match(text, /API KEY IS OPTIONAL/,
      "the instructions must state the key is optional");
  });

  test("the instructions do not misstate how many tools Orbit has", () => {
    // It said 131 while shipping 135. Small, but it is the single string
    // every host loads eagerly, and nothing was checking it.
    const src = readFileSync(join(ROOT, "server", "index.js"), "utf8");
    const claim = src.match(/(\d+) skills and (\d+) tools/);
    assert.ok(claim, "the instructions no longer state a skill/tool count");
    const manifest = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
    assert.equal(
      Number(claim[2]),
      manifest.tools.length,
      `instructions claim ${claim[2]} tools, manifest lists ${manifest.tools.length}`
    );

    // The SKILLS half was not pinned, and drifted exactly as you would
    // predict: the tool count stayed correct because this test watched it,
    // while the skill count sat at 80 against 81 files on disk. Half a
    // guard is how you get half a drift.
    const skillCount = readdirSync(join(ROOT, "skills")).filter((f) => f.endsWith(".md")).length;
    assert.equal(
      Number(claim[1]),
      skillCount,
      `instructions claim ${claim[1]} skills, skills/ holds ${skillCount}`
    );
  });
});
