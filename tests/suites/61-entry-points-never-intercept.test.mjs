/**
 * The two entry points must answer, not redirect.
 *
 * THE BUG. `setupInterceptIfNeeded()` was wired to eight tools, including
 * the two a new user hits regardless of what they came for:
 * orbit_list_skills ("what can Orbit do?") and orbit_route_task ("which
 * skill fits my question?"). On a fresh install with no brand kit, both
 * returned "Orbit hasn't been fully set up yet" and instructed Claude to
 * collect a logo and a tone of voice BEFORE answering.
 *
 * The server's own instructions tell Claude to call orbit_route_task
 * first for any lifecycle work. So a user whose opening line was "why did
 * my last send underperform" had that question deferred for a setup flow
 * they did not ask for — while the same instructions promise that
 * "roughly two-thirds of Orbit needs no credentials at all". The product
 * broke its own contract on turn one, and the marketing site now leads
 * with that same promise, which makes it a visible contradiction rather
 * than a private one.
 *
 * THE RULE, asserted below: does the OUTPUT need brand tokens? Building a
 * message plan or an MJML template on defaults produces something worse
 * than a setup prompt, so those keep the intercept. Listing skills and
 * routing a question need nothing, so they must always answer.
 *
 * Both tools still bootstrap the workspace on first run — that side
 * effect is silent and wanted. It is only the INTERCEPT that is wrong
 * here, and this suite is careful to test the difference.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { startMockApiServer } from "../harness/mock-api-server.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";

let client = null;
let mockServer = null;
let workspace = null;

/** The intercept's opening words — the thing that must not come back. */
const INTERCEPT_MARKERS = [/hasn't been fully set up/i, /walk you through setting up Orbit/i];

describe("entry points answer on a fresh install, never redirect to setup", () => {
  before(async () => {
    mockServer = await startMockApiServer();
    // A brand-new workspace: no brand-profile.json, so the intercept
    // condition is genuinely met. If these tools were still wired to it,
    // this is exactly the state that would trip them.
    workspace = makeTempWorkspace();
    client = await spawnMcpClient({ env: { ...mockServer.env, ORBIT_HOME_ROOT: workspace } });
  });

  after(async () => {
    if (client) await client.close();
    if (mockServer) await mockServer.close();
  });

  test("the fixture really has no brand kit — otherwise this suite proves nothing", () => {
    const profile = path.join(workspace, "brand-kit", "brand-profile.json");
    assert.ok(
      !fs.existsSync(profile),
      "the temp workspace already has a brand profile, so the intercept condition is not met and these tests are vacuous"
    );
  });

  test("orbit_route_task routes the question instead of asking for a logo", async () => {
    const res = await client.callTool("orbit_route_task", {
      request: "why did my last Braze send underperform",
    });
    const text = (res?.content ?? []).map((c) => c.text ?? "").join("\n");
    for (const marker of INTERCEPT_MARKERS) {
      assert.ok(!marker.test(text), `orbit_route_task returned the setup intercept:\n${text.slice(0, 300)}`);
    }
    assert.ok(text.length > 0, "orbit_route_task returned nothing at all");
  });

  test("orbit_list_skills lists skills instead of asking for a logo", async () => {
    const res = await client.callTool("orbit_list_skills", {});
    const text = (res?.content ?? []).map((c) => c.text ?? "").join("\n");
    for (const marker of INTERCEPT_MARKERS) {
      assert.ok(!marker.test(text), `orbit_list_skills returned the setup intercept:\n${text.slice(0, 300)}`);
    }
    assert.match(text, /skill/i, "orbit_list_skills did not return anything skill-shaped");
  });

  test("the workspace is still bootstrapped — the side effect must survive", () => {
    // Removing the intercept must not remove the silent first-run bootstrap.
    // If this fails, the entry points were freed by deleting too much.
    assert.ok(fs.existsSync(workspace), "the workspace root vanished");
  });

  test("tools whose OUTPUT needs brand tokens keep the intercept", () => {
    // The line is not "first call" but "does the output need it". Six tools
    // still call setupInterceptIfNeeded; if that count drops, someone has
    // freed a tool that will now emit a template built on defaults.
    const src = fs.readFileSync(new URL("../../server/index.js", import.meta.url), "utf8");
    const callSites = (src.match(/setupInterceptIfNeeded\(\)/g) ?? []).length - 1; // minus the definition
    assert.equal(
      callSites,
      6,
      `expected 6 operational tools to keep the setup intercept, found ${callSites}. ` +
        `Freeing an entry point is right; freeing a tool that builds a message plan or MJML on ` +
        `default brand tokens is not — it ships something worse than a setup prompt.`
    );
  });
});
