/**
 * The free path is free — asserted through the wire, on a keyless install.
 *
 * `orbit_check_setup` is the first tool a model reaches for in almost any
 * session. It used to return `needs_setup` with a seven-item credential list
 * on every install, because `brand_header_render` — the only default feature
 * that needs an API key — sat in DEFAULT_FEATURES, so the
 * `requestedBlockers.length === 0 ? "ready" : "needs_setup"` line could never
 * return `ready`. Not on a virgin machine, and not on a fully-configured one
 * either.
 *
 * On a product whose headline is "free, no key, no account", and whose
 * flagship brain path needs zero credentials, that answer had one predictable
 * consequence: Claude opens by walking a stranger through Braze, Stripo,
 * Figma and Google AI setup — rebuilding in the chat window the wall the
 * download page tore down.
 *
 * This suite spawns a server with every credential env var explicitly blanked
 * so it reproduces a stranger's first run, not this machine's. It reads the
 * status off the RUNNING server, because a unit test against the validator
 * would not have caught the env plumbing.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";

import { spawnMcpClient } from "../harness/mcp-client.mjs";
import { makeTempWorkspace } from "../harness/fixtures.mjs";

/** Every credential Orbit reads, blanked — a machine that has configured none. */
const NO_CREDENTIALS = {
  ORBIT_GOOGLE_AI_API_KEY: "",
  ORBIT_FIGMA_API_TOKEN: "",
  ORBIT_BRAZE_API_KEY: "",
  ORBIT_BRAZE_REST_ENDPOINT: "",
  ORBIT_STRIPO_PLUGIN_ID: "",
  ORBIT_STRIPO_SECRET_KEY: "",
  ORBIT_STRIPO_REST_API_TOKEN: "",
  ORBIT_STRIPO_WORKSPACE_ID: "",
  ORBIT_STRIPO_MASTER_TEMPLATE_ID: "",
  ORBIT_BRAND_KIT_DIR: ""
};

let client = null;

describe("A keyless install is a ready install", () => {
  before(async () => {
    client = await spawnMcpClient({
      env: { ...NO_CREDENTIALS, ORBIT_HOME_ROOT: makeTempWorkspace() }
    });
    // Orbit intercepts the first intercept-eligible call of a fresh workspace
    // with its setup greeting. orbit_check_setup is exempt from its own
    // intercept, but burn one anyway so nothing below reads the greeting.
    await client.callTool("orbit_route_task", { request: "warm up" });
  });

  after(async () => {
    if (client) await client.close();
  });

  test("orbit_check_setup {} returns ready with no credentials configured", async () => {
    const res = await client.callToolJson("orbit_check_setup", {});
    assert.equal(
      res.parsed?.status,
      "ready",
      `a keyless install reported "${res.parsed?.status}" — every default feature must be credential-free. ` +
        `feature_readiness: ${JSON.stringify(res.parsed?.feature_readiness)}`
    );
  });

  test("no default feature is blocked on a keyless install", async () => {
    const res = await client.callToolJson("orbit_check_setup", {});
    const blocked = Object.entries(res.parsed?.feature_readiness ?? {})
      .filter(([name]) => (res.parsed?.requested_features ?? []).includes(name))
      .filter(([, f]) => (f?.blocking_issues ?? []).length > 0)
      .map(([name]) => name);
    assert.deepEqual(blocked, [], `default features blocked without credentials: ${blocked.join(", ")}`);
  });

  test("credential-gated features are still reported, just not as blockers", async () => {
    const res = await client.callToolJson("orbit_check_setup", {});
    const optional = res.parsed?.optional_integrations ?? {};
    assert.ok(
      Object.keys(optional).length > 0,
      "optional_integrations is empty — a model cannot see what a key would unlock"
    );
    assert.equal(
      optional.brand_header_render?.status,
      "needs_setup",
      "the honest answer about brand_header_render is still needs_setup; it just is not the install's verdict"
    );
  });

  test("asking for a credential-gated feature by name still gates the status", async () => {
    const res = await client.callToolJson("orbit_check_setup", {
      requested_features: ["brand_header_render"]
    });
    assert.equal(
      res.parsed?.status,
      "needs_setup",
      "a caller who names brand_header_render must still be told it needs a key"
    );
  });
});
