#!/usr/bin/env node
//
// Stripo API probe — answers three questions before we commit to an
// integration schema:
//
//   1. Does POST /api/v1/auth with role:'API' return a JWT that
//      authorises the REST endpoints, or is the per-project REST
//      token strictly required?
//   2. What does GET /emailgeneration/v1/modules actually return
//      — what metadata fields are present, does the response
//      include HTML?
//   3. What does POST /emailgeneration/v1/email return — is there
//      an editor URL field?
//
// Run:
//   ORBIT_STRIPO_PLUGIN_ID=...           \
//   ORBIT_STRIPO_SECRET_KEY=...          \
//   ORBIT_STRIPO_REST_API_TOKEN=...      \  (optional)
//   ORBIT_STRIPO_MASTER_TEMPLATE_ID=...  \  (optional)
//   ORBIT_STRIPO_FOLDER_ID=...           \  (optional)
//   node scripts/stripo-probe.js
//
// Output: live progress to stdout + a markdown report at
// docs/stripo-probe-findings.md. The report redacts JWTs and any
// other secrets so it can be safely shared / committed.

import fs from "node:fs";
import path from "node:path";

const PLUGIN_AUTH_URL = "https://plugins.stripo.email/api/v1/auth";
const REST_BASE_URL = "https://my.stripo.email/emailgeneration/v1";
const PROBE_USER_ID = "orbit-probe-user";
const RATE_LIMIT_MS = 250;

const env = {
  pluginId: process.env.ORBIT_STRIPO_PLUGIN_ID,
  secretKey: process.env.ORBIT_STRIPO_SECRET_KEY,
  restToken: process.env.ORBIT_STRIPO_REST_API_TOKEN,
  masterTemplateId: process.env.ORBIT_STRIPO_MASTER_TEMPLATE_ID,
  folderId: process.env.ORBIT_STRIPO_FOLDER_ID,
};

const findings = [];
let lastCallAt = 0;

async function pace() {
  const wait = RATE_LIMIT_MS - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

function redact(str) {
  if (!str || typeof str !== "string") return str;
  if (str.length <= 12) return "[redacted]";
  return `${str.slice(0, 6)}…${str.slice(-4)} (${str.length} chars)`;
}

function record(name, status, details) {
  findings.push({ name, status, details });
  const icon = status === "pass" ? "✓" : status === "fail" ? "✗" : "•";
  console.log(`${icon} ${name}: ${status}`);
  if (details && typeof details === "string") {
    console.log(`  ${details.replace(/\n/g, "\n  ")}`);
  }
}

async function callJson(url, init = {}) {
  await pace();
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep null — body wasn't JSON */
  }
  return { status: res.status, ok: res.ok, headers: Object.fromEntries(res.headers), text, json };
}

async function probeAuth(role) {
  const body = {
    pluginId: env.pluginId,
    secretKey: env.secretKey,
    userId: PROBE_USER_ID,
    role,
  };
  const result = await callJson(PLUGIN_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!result.ok) {
    record(`Plugin auth (role=${role})`, "fail", `HTTP ${result.status} — ${result.text.slice(0, 300)}`);
    return null;
  }
  const token = result.json?.token ?? result.json?.access_token ?? null;
  record(
    `Plugin auth (role=${role})`,
    "pass",
    `JWT minted: ${redact(token)}\nResponse shape keys: ${Object.keys(result.json ?? {}).join(", ")}`,
  );
  return token;
}

async function probeFindModules(label, jwt, params = {}) {
  const url = new URL(`${REST_BASE_URL}/modules`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const result = await callJson(url.toString(), {
    method: "GET",
    headers: {
      "Stripo-Api-Auth": jwt,
      Accept: "application/json",
    },
  });
  if (!result.ok) {
    record(`findmodules via ${label}`, "fail", `HTTP ${result.status} — ${result.text.slice(0, 400)}`);
    return null;
  }

  const body = result.json;
  // Stripo returns { data: [...], total: N } — not { modules: [...] }.
  // Earlier versions of this script checked body.modules and silently
  // returned "(empty list)" against perfectly populated accounts.
  const list = Array.isArray(body)
    ? body
    : Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.modules)
    ? body.modules
    : null;
  const total = body?.total ?? (Array.isArray(list) ? list.length : "unknown");
  const sample = Array.isArray(list) && list.length > 0 ? list[0] : null;
  const sampleKeys = sample ? Object.keys(sample).join(", ") : "(empty list)";
  const containsHtml = sample && typeof sample.html === "string" && sample.html.length > 0;

  record(
    `findmodules via ${label}`,
    "pass",
    [
      `Total reported by API: ${total}`,
      `Items returned in this page: ${Array.isArray(list) ? list.length : "unknown shape"}`,
      `Top-level response keys: ${Object.keys(body ?? {}).join(", ") || "(array, not object)"}`,
      `Sample module keys: ${sampleKeys}`,
      `HTML included on first call: ${containsHtml ? "yes" : "no"}`,
      sample ? `Sample (first 1500 chars):\n${JSON.stringify(sample, null, 2).slice(0, 1500)}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return list;
}

async function probeGenerateEmail(jwt) {
  if (!env.masterTemplateId) {
    record("generateemail", "skip", "ORBIT_STRIPO_MASTER_TEMPLATE_ID not provided.");
    return null;
  }
  const body = {
    templateId: env.masterTemplateId,
    folderId: env.folderId ?? undefined,
    name: `[Orbit probe — safe to delete] ${new Date().toISOString()}`,
    // Stripo's canonical-JSON area-fill payload. Phase 0 captures the
    // exact 200 response shape; the production tool will use the real
    // assembled module HTML here.
    areas: [
      {
        name: "main-area",
        html: `<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="font-family:Arial,sans-serif;font-size:14px;color:#333;padding:24px;">Orbit probe — safe to delete.</td></tr></table>`,
      },
    ],
  };
  const result = await callJson(`${REST_BASE_URL}/email`, {
    method: "POST",
    headers: {
      "Stripo-Api-Auth": jwt,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!result.ok) {
    record("generateemail", "fail", `HTTP ${result.status} — ${result.text.slice(0, 600)}`);
    return null;
  }
  record(
    "generateemail",
    "pass",
    [
      `Response status: ${result.status}`,
      `Response keys: ${Object.keys(result.json ?? {}).join(", ") || "(non-object body)"}`,
      `Editor-deeplink-shaped fields present: ${detectDeeplinkFields(result.json).join(", ") || "none found"}`,
      `Body (first 800 chars):\n${(result.text ?? "").slice(0, 800)}`,
    ].join("\n"),
  );
  return result.json;
}

function detectDeeplinkFields(obj) {
  if (!obj || typeof obj !== "object") return [];
  const candidates = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && /https?:\/\//.test(v)) candidates.push(`${k}=<url>`);
    if (/url|link|edit|deeplink/i.test(k)) candidates.push(k);
  }
  return [...new Set(candidates)];
}

function summariseEnv() {
  const presence = {
    ORBIT_STRIPO_PLUGIN_ID: env.pluginId ? "set" : "missing",
    ORBIT_STRIPO_SECRET_KEY: env.secretKey ? "set" : "missing",
    ORBIT_STRIPO_REST_API_TOKEN: env.restToken ? "set" : "missing (REST-token probe will be skipped)",
    ORBIT_STRIPO_MASTER_TEMPLATE_ID: env.masterTemplateId ? "set" : "missing (generateemail probe will be skipped)",
    ORBIT_STRIPO_FOLDER_ID: env.folderId ? "set" : "missing (will use account default)",
  };
  console.log("Env credential presence:");
  for (const [k, v] of Object.entries(presence)) console.log(`  ${k}: ${v}`);
  console.log("");
  return presence;
}

function writeReport(envPresence) {
  const reportPath = path.join(process.cwd(), "docs", "stripo-probe-findings.md");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const lines = [
    "# Stripo API probe findings",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Credential presence",
    "",
    ...Object.entries(envPresence).map(([k, v]) => `- \`${k}\`: ${v}`),
    "",
    "## Probe results",
    "",
    ...findings.flatMap(({ name, status, details }) => [
      `### ${name}`,
      "",
      `**Status:** ${status}`,
      "",
      details ? "```" : "",
      details || "",
      details ? "```" : "",
      "",
    ]),
    "## Decisions to make",
    "",
    "1. **Do we need both Plugin auth (role=API) JWT _and_ a separate REST token?**",
    "   - If `findmodules via plugin-API-JWT` passes, we can ship with just plugin creds in user_config.",
    "   - If only `findmodules via REST token` passes, the REST token is mandatory for module sync.",
    "",
    "2. **Does `findmodules` return HTML in the default call?**",
    "   - If no, the sync tool needs a per-module follow-up call OR a query param to opt in.",
    "",
    "3. **Does `generateemail` return an editor URL?**",
    "   - If yes, we wire it into the compose tool's `editor_hint` field.",
    "   - If no, the hint falls back to \"open Stripo and look in folder X for `[Orbit probe — safe to delete]…`\".",
    "",
    "4. **Any unexpected response fields worth capturing in the schema?** Look at the sample-keys lines above.",
    "",
  ];
  fs.writeFileSync(reportPath, lines.join("\n"), "utf8");
  console.log(`\nReport written to ${path.relative(process.cwd(), reportPath)}`);
}

async function main() {
  console.log("Stripo API probe\n================\n");
  const presence = summariseEnv();

  if (!env.pluginId || !env.secretKey) {
    console.error("ORBIT_STRIPO_PLUGIN_ID and ORBIT_STRIPO_SECRET_KEY are required.");
    process.exit(1);
  }

  const userJwt = await probeAuth("USER");
  const apiJwt = await probeAuth("API");

  if (apiJwt) {
    await probeFindModules("plugin-API-JWT (role=API)", apiJwt, { limit: 5 });
    // Some Stripo deployments require an explicit content-include flag.
    // Try a couple of likely param names so the report captures which (if any) works.
    await probeFindModules("plugin-API-JWT + includeContent=true", apiJwt, { limit: 5, includeContent: "true" });
    await probeFindModules("plugin-API-JWT + withContent=true", apiJwt, { limit: 5, withContent: "true" });
  }

  if (env.restToken) {
    await probeFindModules("REST token (Stripo-Api-Auth header)", env.restToken, { limit: 5 });
  } else {
    record("findmodules via REST token", "skip", "ORBIT_STRIPO_REST_API_TOKEN not set.");
  }

  // Use REST token for generateemail if present; otherwise fall back to API JWT.
  const generateJwt = env.restToken ?? apiJwt;
  if (generateJwt) {
    await probeGenerateEmail(generateJwt);
  } else {
    record("generateemail", "skip", "No JWT or REST token available.");
  }

  writeReport(presence);

  const failures = findings.filter((f) => f.status === "fail");
  if (failures.length > 0) {
    console.log(`\n${failures.length} probe(s) failed. See report for full detail.`);
    // Do not exit non-zero — failures here are data, not bugs.
  }
}

main().catch((err) => {
  console.error("Probe crashed unexpectedly:", err);
  process.exit(2);
});
