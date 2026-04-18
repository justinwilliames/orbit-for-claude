/**
 * Orbit version check — compares the installed version against the
 * latest release on GitHub. No auth required; uses the raw manifest.json
 * in the -dl download repo as the source of truth.
 */

import { fetchWithRetry, getBreaker } from "./orbit-resilience.js";

const GITHUB_BREAKER = getBreaker("github");
const LATEST_MANIFEST_URL =
  "https://raw.githubusercontent.com/justinwilliames-sketch/orbit-for-claude-dl/main/manifest.json";
const FALLBACK_LATEST_URL =
  "https://raw.githubusercontent.com/justinwilliames-sketch/orbit-for-claude/main/manifest.json";

function compareVersions(a, b) {
  const [am, an, ap] = String(a).split(".").map((x) => Number.parseInt(x, 10) || 0);
  const [bm, bn, bp] = String(b).split(".").map((x) => Number.parseInt(x, 10) || 0);
  if (am !== bm) return am - bm;
  if (an !== bn) return an - bn;
  return ap - bp;
}

export async function checkOrbitVersion({ installedVersion }) {
  const sources = [LATEST_MANIFEST_URL, FALLBACK_LATEST_URL];
  let latest = null;
  let sourceUsed = null;
  let error = null;

  for (const url of sources) {
    try {
      const res = await fetchWithRetry(
        url,
        { method: "GET", headers: { Accept: "application/json" } },
        { timeoutMs: 10_000, retries: 2, breaker: GITHUB_BREAKER }
      );
      if (!res.ok) {
        error = `GitHub returned ${res.status} for ${url}`;
        continue;
      }
      const data = await res.json();
      latest = data?.version;
      sourceUsed = url;
      if (latest) break;
    } catch (err) {
      error = err.message;
    }
  }

  if (!latest) {
    return {
      status: "error",
      code: "version_check_failed",
      message: `Could not reach GitHub to compare versions: ${error ?? "unknown"}`,
      installed_version: installedVersion,
      suggested_next_steps: [
        "Check your internet connection.",
        "Visit https://github.com/justinwilliames-sketch/orbit-for-claude-dl to see the latest release."
      ]
    };
  }

  const comparison = compareVersions(installedVersion, latest);
  let status;
  let message;
  if (comparison === 0) {
    status = "up_to_date";
    message = `You're running the latest Orbit (${installedVersion}).`;
  } else if (comparison > 0) {
    status = "ahead";
    message = `Your local Orbit (${installedVersion}) is ahead of the published release (${latest}). This usually means you're running a dev build.`;
  } else {
    status = "update_available";
    message = `A newer Orbit is available: ${latest} (you're on ${installedVersion}).`;
  }

  return {
    status,
    installed_version: installedVersion,
    latest_version: latest,
    source: sourceUsed,
    message,
    download_url: "https://get.yourorbit.team/download",
    suggested_next_steps: comparison < 0
      ? [
          "Open https://get.yourorbit.team/download in your browser.",
          "Download the latest .mcpb, double-click to install in Claude Desktop.",
          "Restart Claude Desktop after install."
        ]
      : []
  };
}
