/**
 * Opt-in structured tool-invocation logging.
 *
 * Writes one JSONL event per tool call to ~/Orbit/logs/orbit-trace.jsonl
 * when ORBIT_DEBUG_TRACE is on. Each event records tool name, args hash,
 * duration, outcome (ok/error/timeout/...), response size, and any
 * retry/breaker/truncation signals. Users hitting mysterious bugs can
 * flip the flag, reproduce, and share the log.
 *
 * Strictly opt-in — zero overhead when the env var is unset.
 *
 * Accepts "1" or "true" because there are two ways in: an env var a
 * developer exports, and the "Debug trace log" checkbox in the extension
 * settings, which substitutes the string "true". This flag was the only
 * diagnostic Orbit had and it was documented nowhere outside this
 * comment — see docs/SETUP.md and .github/ISSUE_TEMPLATE/bug_report.yml.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ENABLED = ["1", "true", "yes", "on"].includes(
  String(process.env.ORBIT_DEBUG_TRACE ?? "").trim().toLowerCase()
);

let _logPath = null;
let _logStream = null;

function resolveLogPath() {
  if (_logPath) return _logPath;
  const homeRoot =
    process.env.ORBIT_HOME_ROOT ||
    path.join(os.homedir(), "Orbit");
  const logsDir = path.join(homeRoot, "logs");
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    _logPath = path.join(logsDir, "orbit-trace.jsonl");
  } catch {
    _logPath = null;
  }
  return _logPath;
}

function getStream() {
  if (_logStream) return _logStream;
  const p = resolveLogPath();
  if (!p) return null;
  try {
    _logStream = fs.createWriteStream(p, { flags: "a" });
    _logStream.on("error", () => { _logStream = null; });
  } catch {
    _logStream = null;
  }
  return _logStream;
}

function hashArgs(args) {
  try {
    return crypto
      .createHash("sha1")
      .update(JSON.stringify(args ?? {}))
      .digest("hex")
      .slice(0, 10);
  } catch {
    return null;
  }
}

/**
 * Log a structured trace event. No-op unless ORBIT_DEBUG_TRACE=1.
 * Fire-and-forget — never blocks, never throws.
 */
export function traceToolCall(event) {
  if (!ENABLED) return;
  const stream = getStream();
  if (!stream) return;
  try {
    const payload = {
      ts: new Date().toISOString(),
      ...event
    };
    stream.write(`${JSON.stringify(payload)}\n`);
  } catch { /* swallow */ }
}

export const traceEnabled = ENABLED;
export { hashArgs };
