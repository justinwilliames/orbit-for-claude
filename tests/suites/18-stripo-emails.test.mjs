/**
 * Stripo email lifecycle helpers — get / delete / auth-probe.
 *
 * Loads server/stripo-emails.js in a vm sandbox with the Stripo REST
 * helpers mocked, so we assert on endpoint shaping and response
 * structure without touching the network (same pattern as suite 17).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { parseMaybeJson } from "../../server/utils.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(TEST_DIR, "..", "..", "server", "stripo-emails.js");

function loadModule({ get, del, restSetup = () => null } = {}) {
  const source = fs
    .readFileSync(SOURCE_PATH, "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/^export /gm, "");

  const calls = { get: [], del: [] };
  const context = {
    stripoRestGet: async ({ endpoint }) => {
      calls.get.push(endpoint);
      return (get ?? (() => ({})))({ endpoint });
    },
    stripoRestDelete: async ({ endpoint }) => {
      calls.del.push(endpoint);
      return (del ?? (() => ({})))({ endpoint });
    },
    validateStripoRestSetup: restSetup,
    parseMaybeJson,
    module: { exports: {} },
    exports: {},
  };

  vm.runInNewContext(
    `${source}\nmodule.exports = { getStripoEmail, deleteStripoEmails, checkStripoAuth };`,
    context,
    { filename: SOURCE_PATH },
  );
  return { mod: context.module.exports, calls };
}

const CONFIG = { stripoRestApiToken: "tok", stripoMasterTemplateId: "4451727", stripoPluginId: "p", stripoSecretKey: "s" };

// After a real delete, the read-back GET /emails/<id> must 404. `gone`
// simulates that confirmation so deleteStripoEmails can report success.
const gone = () => {
  const e = new Error("not found");
  e.code = "stripo_not_found";
  throw e;
};

// ─── getStripoEmail ────────────────────────────────────────────────────────

test("getStripoEmail hits GET /emails/<id> and returns the payload", async () => {
  const { mod, calls } = loadModule({ get: () => ({ id: 999, html: "<html></html>" }) });
  const res = await mod.getStripoEmail({ config: CONFIG, emailId: 11907219 });
  assert.equal(res.status, "ok");
  assert.equal(res.email_id, "11907219");
  assert.deepEqual(calls.get, ["/emails/11907219"]);
  assert.equal(res.email.html, "<html></html>");
});

test("getStripoEmail rejects non-numeric IDs without calling the API", async () => {
  const { mod, calls } = loadModule();
  const res = await mod.getStripoEmail({ config: CONFIG, emailId: "abc" });
  assert.equal(res.status, "needs_inputs");
  assert.equal(calls.get.length, 0);
});

test("getStripoEmail surfaces needs_setup when REST token missing", async () => {
  const { mod } = loadModule({ restSetup: () => ({ status: "needs_setup", missing: ["stripo_rest_api_token"] }) });
  const res = await mod.getStripoEmail({ config: {}, emailId: 1 });
  assert.equal(res.status, "needs_setup");
});

// ─── deleteStripoEmails ──────────────────────────────────────────────────────

test("deleteStripoEmails deletes each ID and dedupes (read-back confirms 404)", async () => {
  const { mod, calls } = loadModule({ get: gone });
  const res = await mod.deleteStripoEmails({ config: CONFIG, emailIds: [101, 102, "101"] });
  assert.equal(res.status, "ok");
  assert.equal(res.deleted_count, 2);
  assert.equal(res.unconfirmed_count, 0);
  assert.deepEqual(calls.del, ["/emails/101", "/emails/102"]);
  // Each delete is read back to confirm the purge.
  assert.deepEqual(calls.get, ["/emails/101", "/emails/102"]);
});

test("deleteStripoEmails accepts a JSON-stringified array (MCP-bridge batch path)", async () => {
  // The MCP client can serialise an array argument as a JSON string when the
  // param's union schema advertises a string branch. The batch path must still
  // delete every ID, not choke on the literal "[...]" string.
  const { mod, calls } = loadModule({ get: gone });
  const res = await mod.deleteStripoEmails({ config: CONFIG, emailIds: "[101, 102, 103]" });
  assert.equal(res.status, "ok");
  assert.equal(res.deleted_count, 3);
  assert.deepEqual(calls.del, ["/emails/101", "/emails/102", "/emails/103"]);
});

test("deleteStripoEmails accepts a single scalar ID", async () => {
  const { mod, calls } = loadModule({ get: gone });
  const res = await mod.deleteStripoEmails({ config: CONFIG, emailIds: 11907266 });
  assert.equal(res.status, "ok");
  assert.deepEqual(calls.del, ["/emails/11907266"]);
});

test("deleteStripoEmails reports partial failure per-ID", async () => {
  const { mod } = loadModule({
    // Successful deletes (1, 3) read back as gone; 2 fails the DELETE outright.
    get: gone,
    del: ({ endpoint }) => {
      if (endpoint === "/emails/2") {
        const e = new Error("boom");
        e.code = "stripo_unknown";
        throw e;
      }
      return {};
    },
  });
  const res = await mod.deleteStripoEmails({ config: CONFIG, emailIds: [1, 2, 3] });
  assert.equal(res.status, "partial");
  assert.equal(res.deleted_count, 2);
  assert.equal(res.failed_count, 1);
  assert.equal(res.failed[0].email_id, "2");
});

test("deleteStripoEmails flags UNCONFIRMED when Stripo 2xx's the delete but the email survives", async () => {
  // The documented production bug: Stripo returns DELETE success without
  // purging. The read-back GET still returns the email → must NOT report "ok".
  const { mod, calls } = loadModule({ get: () => ({ id: 55, html: "<html></html>" }) });
  const res = await mod.deleteStripoEmails({ config: CONFIG, emailIds: 55 });
  assert.notEqual(res.status, "ok");
  assert.equal(res.deleted_count, 0);
  assert.equal(res.unconfirmed_count, 1);
  assert.equal(res.unconfirmed[0].email_id, "55");
  assert.deepEqual(calls.del, ["/emails/55"]);
  assert.deepEqual(calls.get, ["/emails/55"]);
});

test("deleteStripoEmails refuses a batch over the cap", async () => {
  const { mod, calls } = loadModule();
  const ids = Array.from({ length: 201 }, (_, i) => i + 1);
  const res = await mod.deleteStripoEmails({ config: CONFIG, emailIds: ids });
  assert.equal(res.status, "needs_inputs");
  assert.equal(calls.del.length, 0);
});

// ─── checkStripoAuth ─────────────────────────────────────────────────────────

test("checkStripoAuth passes when the read-only probe authorises", async () => {
  const { mod, calls } = loadModule({ get: () => ({ id: 4451727 }) });
  const res = await mod.checkStripoAuth({ config: CONFIG });
  assert.equal(res.status, "ok");
  assert.equal(res.rest_auth_probe, "passed");
  assert.deepEqual(calls.get, ["/templates/4451727"]);
});

test("checkStripoAuth reports auth_failed on a 401", async () => {
  const { mod } = loadModule({
    get: () => {
      const e = new Error("401 Unauthorized");
      e.code = "stripo_auth_failed";
      throw e;
    },
  });
  const res = await mod.checkStripoAuth({ config: CONFIG });
  assert.equal(res.status, "auth_failed");
  assert.equal(res.rest_auth_probe, "failed");
  assert.match(res.message, /RESTART Claude/);
  assert.match(res.message, /regenerate the token in Stripo/);
});

test("checkStripoAuth returns needs_setup when token absent", async () => {
  const { mod, calls } = loadModule();
  const res = await mod.checkStripoAuth({ config: { stripoMasterTemplateId: "1" } });
  assert.equal(res.status, "needs_setup");
  assert.equal(calls.get.length, 0);
});
