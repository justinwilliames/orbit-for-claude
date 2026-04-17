/**
 * Generate a human-readable HTML review report from a run summary.
 *
 * Opens in any browser, shows pass/fail for every test, lists every
 * artifact written to the run directory, and links each one for quick
 * visual inspection. The review mechanism for "is the output actually
 * right, not just shape-correct."
 */

import fs from "node:fs";
import path from "node:path";

export function renderReport({ runDir, summary }) {
  const artifacts = listArtifacts(runDir);
  const html = renderHtml(summary, artifacts);
  fs.writeFileSync(path.join(runDir, "index.html"), html);
}

function listArtifacts(runDir) {
  const entries = [];
  function walk(dir, relBase = "") {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const rel = path.posix.join(relBase, name);
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        walk(abs, rel);
      } else if (!rel.endsWith("index.html") && !rel.endsWith("summary.json")) {
        entries.push({ rel, size: stat.size, mtime: stat.mtime.toISOString() });
      }
    }
  }
  walk(runDir);
  return entries.sort((a, b) => a.rel.localeCompare(b.rel));
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderHtml(summary, artifacts) {
  const passRate = summary.total > 0
    ? Math.round((summary.passed / summary.total) * 100)
    : 0;
  const ok = summary.failed === 0;

  const resultRows = summary.results
    .filter((r) => r.nesting === 0 || r.status === "fail")
    .map((r) => {
      const bullet = r.status === "pass" ? "✓" : "✗";
      const cls = r.status === "pass" ? "pass" : "fail";
      const errorRow = r.status === "fail"
        ? `<div class="err"><pre>${escapeHtml(r.error)}</pre></div>`
        : "";
      return `
        <tr class="${cls}">
          <td class="bullet">${bullet}</td>
          <td class="name">${escapeHtml(r.name)}${errorRow}</td>
          <td class="file">${escapeHtml(path.basename(r.file ?? ""))}</td>
          <td class="dur">${r.durationMs != null ? `${r.durationMs.toFixed(0)}ms` : ""}</td>
        </tr>`;
    })
    .join("");

  const artifactGroups = groupArtifactsByDirectory(artifacts);
  const artifactHtml = Object.entries(artifactGroups)
    .map(([dir, files]) => `
      <details open><summary>${escapeHtml(dir || "(root)")}</summary>
        <ul>
          ${files.map((f) => `<li><a href="./${escapeHtml(f.rel)}" target="_blank">${escapeHtml(f.rel)}</a> <span class="meta">${formatBytes(f.size)}</span></li>`).join("")}
        </ul>
      </details>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Orbit test report — ${escapeHtml(summary.run_id)}</title>
<style>
  :root { color-scheme: light dark; --ok: #16a34a; --fail: #dc2626; --fg: #0a0a0b; --bg: #f8f8f9; --muted: #6b7280; --border: #e5e7eb; }
  @media (prefers-color-scheme: dark) { :root { --fg: #fafafa; --bg: #0a0a0b; --muted: #9ca3af; --border: rgba(255,255,255,0.1); } }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; background: var(--bg); color: var(--fg); padding: 24px; max-width: 960px; margin: 0 auto; }
  h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 4px; }
  .meta { color: var(--muted); font-size: 13px; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 20px 0 32px; }
  .card { border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
  .card h2 { margin: 0 0 6px; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
  .card .big { font-size: 28px; font-weight: 800; letter-spacing: -0.02em; }
  .ok { color: var(--ok); }
  .fail { color: var(--fail); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  tr.pass td.bullet { color: var(--ok); font-weight: 700; }
  tr.fail td.bullet { color: var(--fail); font-weight: 700; }
  tr.fail { background: rgba(220, 38, 38, 0.04); }
  td.bullet { width: 24px; font-family: monospace; }
  td.file, td.dur { color: var(--muted); font-size: 12px; font-family: monospace; white-space: nowrap; }
  .err { margin-top: 6px; padding: 8px; border-radius: 6px; background: rgba(220, 38, 38, 0.08); }
  .err pre { margin: 0; white-space: pre-wrap; font-size: 11.5px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  details { border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; margin: 8px 0; }
  summary { cursor: pointer; font-weight: 600; }
  details ul { margin: 8px 0 0; padding-left: 20px; font-size: 13px; }
  details li { margin: 2px 0; }
  details li a { color: var(--fg); }
  h2.section { margin-top: 32px; font-size: 15px; font-weight: 700; }
</style>
</head>
<body>

<h1>Orbit test run <span class="meta">${escapeHtml(summary.run_id)}</span></h1>
<p class="meta">Started ${escapeHtml(summary.started_at)} · Duration ${Math.round((summary.duration_ms ?? 0) / 1000)}s · ${summary.files.length} suite file(s)</p>

<div class="summary">
  <div class="card"><h2>Status</h2><div class="big ${ok ? "ok" : "fail"}">${ok ? "PASS" : "FAIL"}</div></div>
  <div class="card"><h2>Passed</h2><div class="big ok">${summary.passed}</div></div>
  <div class="card"><h2>Failed</h2><div class="big ${summary.failed ? "fail" : ""}">${summary.failed}</div></div>
  <div class="card"><h2>Pass rate</h2><div class="big">${passRate}%</div></div>
</div>

<h2 class="section">Test results</h2>
<table>
  <thead><tr><th></th><th>Name</th><th>File</th><th>Duration</th></tr></thead>
  <tbody>${resultRows}</tbody>
</table>

<h2 class="section">Artifacts (${artifacts.length})</h2>
${artifactHtml || "<p class=\"meta\">No artifacts written.</p>"}

</body>
</html>`;
}

function groupArtifactsByDirectory(artifacts) {
  const groups = {};
  for (const a of artifacts) {
    const dir = path.posix.dirname(a.rel);
    const key = dir === "." ? "" : dir;
    if (!groups[key]) groups[key] = [];
    groups[key].push(a);
  }
  return groups;
}

function formatBytes(n) {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
