/**
 * Foolproof MCP test client.
 *
 * Spawns server/index.js as a child process with stdin/stdout piped,
 * speaks JSON-RPC 2.0 over newline-delimited JSON (the MCP stdio
 * transport), and surfaces tool calls as ordinary async functions.
 *
 * Every test that touches a tool goes through this client. If the
 * client can't call a tool, the tool is broken — there's no second
 * path that could hide regressions.
 *
 * Usage:
 *   const client = await spawnMcpClient({ env, cwd });
 *   const tools = await client.listTools();
 *   const response = await client.callTool("orbit_check_setup", {});
 *   await client.close();
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const HARNESS_DIR = path.dirname(__filename);
const ROOT_DIR = path.resolve(HARNESS_DIR, "..", "..");
const SERVER_ENTRY = path.join(ROOT_DIR, "server", "index.js");

const DEFAULT_TIMEOUT_MS = 15_000;
const PROTOCOL_VERSION = "2024-11-05";

export async function spawnMcpClient({
  env = {},
  cwd = ROOT_DIR,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onStderr = null
} = {}) {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd,
    // ORBIT_TELEMETRY=0 by default: every suite here spawns a REAL server,
    // and the real server posts to the production endpoint. A clean run
    // used to fire 135 live events (13 session_start, 110 tool_call, 11
    // tool_error) into the same table the relaunch is judged by — and CI
    // runs on an ephemeral HOME, so each release job minted a brand-new
    // "install". A caller that is deliberately testing the emitter passes
    // its own ORBIT_TELEMETRY/ORBIT_TELEMETRY_ENDPOINT in `env` and wins,
    // because the spread below comes last.
    env: { ...process.env, ORBIT_TELEMETRY: "0", ...env },
    stdio: ["pipe", "pipe", "pipe"]
  });

  const pending = new Map(); // id -> { resolve, reject, timer }
  let nextId = 1;
  const stderrChunks = [];

  child.on("error", (err) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    pending.clear();
  });

  const stderrReader = readline.createInterface({ input: child.stderr });
  stderrReader.on("line", (line) => {
    stderrChunks.push(line);
    if (typeof onStderr === "function") {
      try { onStderr(line); } catch { /* ignore */ }
    }
  });

  const stdoutReader = readline.createInterface({ input: child.stdout });
  stdoutReader.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return; // non-JSON banner or debug output
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const entry = pending.get(msg.id);
      clearTimeout(entry.timer);
      pending.delete(msg.id);
      if (msg.error) {
        const err = new Error(msg.error.message ?? "MCP error");
        err.code = msg.error.code;
        err.data = msg.error.data;
        entry.reject(err);
      } else {
        entry.resolve(msg.result);
      }
    }
  });

  function send(method, params = undefined) {
    const id = nextId++;
    const payload = { jsonrpc: "2.0", id, method, ...(params !== undefined ? { params } : {}) };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`MCP ${method} timed out after ${timeoutMs}ms (last stderr: ${stderrChunks.slice(-3).join(" | ")})`));
        }
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  function notify(method, params = undefined) {
    const payload = { jsonrpc: "2.0", method, ...(params !== undefined ? { params } : {}) };
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  // Perform the MCP initialize handshake. Required before any other call.
  // The result is kept: it carries serverInfo and the `instructions`
  // string every host reads, which suite 33 asserts the shape of. It was
  // previously discarded, so nothing could test the most-read text in
  // the product.
  const initializeResult = await send("initialize", {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "orbit-test-harness", version: "1.0.0" }
  });
  notify("notifications/initialized");

  async function listTools() {
    const res = await send("tools/list");
    return res.tools ?? [];
  }

  async function callTool(name, args = {}) {
    const res = await send("tools/call", { name, arguments: args });
    return res;
  }

  /**
   * Call a tool and return the parsed JSON from its text-content block.
   * Throws if the response isn't the expected MCP shape.
   */
  async function callToolJson(name, args = {}) {
    const res = await callTool(name, args);
    if (!res || !Array.isArray(res.content) || res.content.length === 0) {
      throw new Error(`Tool ${name} returned invalid MCP response shape: ${JSON.stringify(res)}`);
    }
    const textBlocks = res.content.filter((c) => c.type === "text");
    if (textBlocks.length === 0) {
      throw new Error(`Tool ${name} returned no text content block`);
    }
    // Tools may prepend a non-JSON attribution banner ("✦ Orbit · …") as the
    // first text block; locate the block that actually parses as JSON.
    let parsed;
    let found = false;
    let lastErr;
    for (const b of textBlocks) {
      try {
        parsed = JSON.parse(b.text);
        found = true;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!found) {
      throw new Error(`Tool ${name} text content was not valid JSON: ${lastErr?.message}`);
    }
    return { raw: res, parsed };
  }

  /**
   * Call a tool and tolerate either a JSON response OR an SDK-level
   * schema validation failure. Useful for "missing inputs" contract
   * tests where the MCP SDK may reject the call before the handler
   * runs. Returns one of:
   *   { kind: "response", raw, parsed } — tool returned a text-content block
   *   { kind: "parse_error", text }    — text content is not JSON
   *   { kind: "rpc_error", error }     — MCP SDK rejected via JSON-RPC error
   *   { kind: "transport_error", error } — other transport failure
   */
  async function callToolLenient(name, args = {}) {
    try {
      const res = await callTool(name, args);
      if (res?.isError) {
        return { kind: "rpc_error", error: res };
      }
      const textBlocks = (res?.content ?? []).filter((c) => c.type === "text");
      if (textBlocks.length === 0) {
        return { kind: "transport_error", error: new Error("no text content"), raw: res };
      }
      // Skip a leading attribution banner; return the first JSON-parseable block.
      for (const b of textBlocks) {
        try {
          return { kind: "response", raw: res, parsed: JSON.parse(b.text) };
        } catch { /* try next block */ }
      }
      return { kind: "parse_error", raw: res, text: textBlocks[textBlocks.length - 1].text };
    } catch (err) {
      return { kind: "rpc_error", error: err };
    }
  }

  async function listResources() {
    const res = await send("resources/list");
    return res.resources ?? [];
  }

  async function close() {
    try {
      child.stdin.end();
    } catch { /* ignore */ }
    return new Promise((resolve) => {
      const kill = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 2000);
      child.once("exit", () => {
        clearTimeout(kill);
        resolve();
      });
    });
  }

  return {
    initializeResult,
    serverInfo: initializeResult?.serverInfo ?? null,
    instructions: initializeResult?.instructions ?? "",
    send,
    notify,
    listTools,
    callTool,
    callToolJson,
    callToolLenient,
    listResources,
    close,
    getStderr: () => stderrChunks.slice(),
    pid: child.pid
  };
}
